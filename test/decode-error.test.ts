import { describe, expect, it } from "vitest";
import {
  ALL_ENTRIES,
  classifyStkResult,
  decodeDarajaResult,
  ERROR_CATALOG,
  PENDING_RESULT_CODES,
} from "../src/error-catalog.js";
import { decodeErrorTool } from "../src/tools/decode-error.js";
import { makeClient, mockFetch } from "./helpers.js";

describe("decodeDarajaResult", () => {
  it("decodes a known code (wrong PIN = 2001)", () => {
    const d = decodeDarajaResult(2001);
    expect(d.code).toBe("2001");
    expect(d.category).toBe("customer");
    expect(d.retryable).toBe(true);
    expect(d.title).toMatch(/PIN/i);
  });

  it("decodes success (0)", () => {
    expect(decodeDarajaResult("0").category).toBe("success");
  });

  it("falls back for unknown codes and uses rawDesc as cause", () => {
    const d = decodeDarajaResult(424242, "Some raw description");
    expect(d.code).toBe("424242");
    expect(d.cause).toBe("Some raw description");
    expect(d.category).toBe("mpesa_system");
  });

  it("treats null/undefined as unknown failure", () => {
    expect(decodeDarajaResult(null).code).toBe("unknown");
    expect(decodeDarajaResult(undefined).title).toBe("Payment failed");
  });

  it("covers every catalog entry", () => {
    for (const code of Object.keys(ERROR_CATALOG)) {
      expect(decodeDarajaResult(code).code).toBe(code);
    }
  });
});

// ─── The 4999 regression ───────────────────────────────────────────────────────────────────
//
// Daraja returns 4999 ("still under processing") while the customer has NOT yet entered their
// M-Pesa PIN. This decoder's table was forked from the engine's BEFORE the engine learned that,
// so it had no 4999 entry and fell through to the generic failure fallback. Two harms:
//   1. it told a developer (or an AI agent driving this MCP) that a mid-PIN-entry payment had
//      FAILED — a false failure shown to a paying customer;
//   2. `retryable: true` invited a retry of an IN-FLIGHT payment — a double charge.
// Both are pinned here, against the SAME table the payment engine classifies with.

describe("4999 / pending — the decoder must agree with the payment engine", () => {
  it("4999 is PENDING, not a failure, and NOT retryable", () => {
    const d = decodeDarajaResult(4999);
    expect(d.code).toBe("4999");
    expect(d.category).toBe("pending");
    expect(d.retryable).toBe(false); // retrying an in-flight payment double-charges
    expect(d.title).not.toMatch(/failed/i);
    expect(d.customerMessage).toMatch(/PIN/i);
  });

  it("4999 decodes identically as a string and a number", () => {
    expect(decodeDarajaResult("4999")).toEqual(decodeDarajaResult(4999));
  });

  it("500.001.1001 (the STK Query quirk) is PENDING and not retryable", () => {
    const d = decodeDarajaResult("500.001.1001");
    expect(d.category).toBe("pending");
    expect(d.retryable).toBe(false);
  });

  it("500.001.1001 as a TERMINAL config error is not pending", () => {
    // Overloaded bucket — the ResultDesc disambiguates and the classifier has the final say.
    const d = decodeDarajaResult("500.001.1001", "Merchant does not exist");
    expect(d.category).not.toBe("pending");
    expect(d.retryable).toBe(false);
  });

  it("1032 is a customer cancellation", () => {
    const d = decodeDarajaResult(1032);
    expect(d.category).toBe("customer");
    expect(d.title).toMatch(/cancel/i);
    expect(d.retryable).toBe(true); // no money moved — a fresh charge really is safe
  });

  it("an unknown code is NOT safely retryable (indeterminate)", () => {
    expect(decodeDarajaResult(424242).retryable).toBe(false);
    expect(decodeDarajaResult(null).retryable).toBe(false);
  });

  it("INVARIANT: a pending payment is never retryable", () => {
    for (const [code, e] of Object.entries(ERROR_CATALOG)) {
      if (e.category === "pending") {
        expect(e.retryable, `${code} is pending but marked retryable`).toBe(false);
      }
    }
  });

  it("INVARIANT: the decoder never contradicts the engine's classifier (STK surface)", () => {
    // Scoped to STK-family codes on purpose. A code can exist in more than one family, and the
    // STK "still processing -> pending" semantics belong to the STK surface alone. A dotted
    // api_error code such as 400.002.02 is TERMINAL even though the STK classifier, which has
    // never heard of it, would call it pending. See the non-STK invariant below.
    const stkCodes = new Set(
      ALL_ENTRIES.filter((e) => e.family === "stk_result").map((e) => e.code),
    );
    for (const code of stkCodes) {
      const outcome = classifyStkResult(code);
      const decoded = decodeDarajaResult(code);
      if (outcome === "pending") {
        expect(decoded.category, `${code}: engine says pending`).toBe("pending");
        expect(decoded.retryable, `${code}: pending must not be retryable`).toBe(false);
      }
      if (outcome === "success") {
        expect(decoded.category, `${code}: engine says success`).toBe("success");
      }
    }
  });

  it("4999 on the STK surface is STILL pending (the scoping did not break the real path)", () => {
    const d = decodeDarajaResult(4999, null, "stk_result");
    expect(d.category).toBe("pending");
    expect(d.retryable).toBe(false);
  });

  it("INVARIANT: no non-STK family decode is ever 'pending'", () => {
    // The mirror-image of the 4999 bug: a TERMINAL api_error or b2c/c2b result reported as
    // "still in flight" makes a caller poll forever on something that will never settle.
    // Sweep the whole table from both non-STK surfaces — pending belongs to STK alone.
    for (const code of Object.keys(ERROR_CATALOG)) {
      for (const family of ["api_error", "b2c_c2b_result"] as const) {
        const decoded = decodeDarajaResult(code, null, family);
        expect(
          decoded.category === "pending",
          `${code} decoded as pending on the ${family} surface`,
        ).toBe(false);
      }
    }
  });

  it("INVARIANT: a non-STK-only code never falls through to pending on the default surface", () => {
    for (const e of ALL_ENTRIES) {
      if (e.family === "stk_result") continue;
      const hasStk = ALL_ENTRIES.some((x) => x.code === e.code && x.family === "stk_result");
      if (hasStk) continue; // overloaded codes are governed by the STK surface by default
      expect(
        decodeDarajaResult(e.code).category === "pending",
        `${e.code} (${e.family}) decoded via the default STK family fell through to pending`,
      ).toBe(false);
    }
  });

  it("INVARIANT: every pending code the engine knows decodes as pending", () => {
    for (const code of PENDING_RESULT_CODES) {
      expect(decodeDarajaResult(code).category, code).toBe("pending");
    }
    // The two codes that cost real money when read as failures.
    expect(PENDING_RESULT_CODES.has("4999")).toBe(true);
    expect(PENDING_RESULT_CODES.has("500.001.1001")).toBe(true);
  });
});

describe("decode_mpesa_error tool", () => {
  it("returns the pending decode for 4999 through the tool handler", async () => {
    const { fetch, calls } = mockFetch();
    const client = makeClient({}, fetch);
    const result = await decodeErrorTool.handler(client, { resultCode: 4999 });
    expect(calls.length).toBe(0); // still pure/offline
    expect(result).toMatchObject({ code: "4999", category: "pending", retryable: false });
  });

  it("is pure — makes no network call", async () => {
    const { fetch, calls } = mockFetch();
    const client = makeClient({}, fetch);
    const result = await decodeErrorTool.handler(client, { resultCode: 1032 });
    expect(calls.length).toBe(0);
    expect(result).toMatchObject({ code: "1032", category: "customer" });
  });

  it("rejects invalid input", async () => {
    const client = makeClient({}, mockFetch().fetch);
    await expect(decodeErrorTool.handler(client, {})).rejects.toThrow();
  });
});
