import { describe, expect, it } from "vitest";
import { decodeDarajaResult, ERROR_CATALOG } from "../src/error-catalog.js";
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

describe("decode_mpesa_error tool", () => {
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
