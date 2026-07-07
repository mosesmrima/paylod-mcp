import { describe, expect, it } from "vitest";
import { PaylodClient } from "../src/client.js";
import { collectTool } from "../src/tools/collect.js";
import { statusTool } from "../src/tools/status.js";
import { qrTool } from "../src/tools/qr.js";
import { payoutTool } from "../src/tools/payout.js";
import { reversalTool } from "../src/tools/reversal.js";
import { simulateCollectTool, simulateOutcomeTool } from "../src/tools/simulate.js";
import { mintKeyTool } from "../src/tools/mint-key.js";
import { makeConfig, mockFetch } from "./helpers.js";

const UUID = "11111111-2222-3333-4444-555555555555";

describe("request_stk_push (collect)", () => {
  it("posts to /collect and splits idempotencyKey into the header", async () => {
    const { fetch, calls } = mockFetch({ status: 202, json: { paymentId: "p1", status: "pending" } });
    const client = new PaylodClient(makeConfig(), fetch);
    await collectTool.handler(client, {
      amount: 100,
      phone: "254712345678",
      accountReference: "order-1",
      idempotencyKey: "idem-1",
    });

    const call = calls[0]!;
    expect(call.url).toBe("https://paylod.dev/functions/v1/collect");
    expect(call.headers["Idempotency-Key"]).toBe("idem-1");
    const body = JSON.parse(call.body!);
    expect(body).toEqual({ amount: 100, phone: "254712345678", accountReference: "order-1" });
    expect(body.idempotencyKey).toBeUndefined();
  });

  it("rejects non-integer / out-of-range amounts", async () => {
    const client = new PaylodClient(makeConfig(), mockFetch().fetch);
    await expect(collectTool.handler(client, { amount: 10.5, phone: "254712345678" })).rejects.toThrow();
    await expect(collectTool.handler(client, { amount: 200000, phone: "254712345678" })).rejects.toThrow();
  });

  it("rejects an invalid phone", async () => {
    const client = new PaylodClient(makeConfig(), mockFetch().fetch);
    await expect(collectTool.handler(client, { amount: 10, phone: "12345" })).rejects.toThrow();
  });

  it("accepts local (07...) format", async () => {
    const { fetch } = mockFetch({ json: {} });
    const client = new PaylodClient(makeConfig(), fetch);
    await expect(collectTool.handler(client, { amount: 10, phone: "0712345678" })).resolves.toBeDefined();
  });
});

describe("get_payment_status", () => {
  it("GETs /status/:id with an encoded id", async () => {
    const { fetch, calls } = mockFetch({ json: { id: "p 1", status: "success" } });
    const client = new PaylodClient(makeConfig(), fetch);
    await statusTool.handler(client, { paymentId: "p 1" });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe("https://paylod.dev/functions/v1/status/p%201");
  });
});

describe("generate_qr", () => {
  it("posts to /qr-generate", async () => {
    const { fetch, calls } = mockFetch({ json: { qrBase64: "AAA" } });
    const client = new PaylodClient(makeConfig(), fetch);
    await qrTool.handler(client, { amount: 50, trxCode: "BG" });
    expect(calls[0]!.url).toBe("https://paylod.dev/functions/v1/qr-generate");
    expect(JSON.parse(calls[0]!.body!)).toMatchObject({ amount: 50, trxCode: "BG" });
  });

  it("rejects an invalid trxCode", async () => {
    const client = new PaylodClient(makeConfig(), mockFetch().fetch);
    await expect(qrTool.handler(client, { amount: 50, trxCode: "ZZ" })).rejects.toThrow();
  });
});

describe("payout & reversal", () => {
  it("payout posts to /payout", async () => {
    const { fetch, calls } = mockFetch({ status: 202, json: { disbursementId: "d1" } });
    const client = new PaylodClient(makeConfig(), fetch);
    await payoutTool.handler(client, { amount: 100, phone: "254712345678" });
    expect(calls[0]!.url).toBe("https://paylod.dev/functions/v1/payout");
  });

  it("reversal requires transactionId", async () => {
    const client = new PaylodClient(makeConfig(), mockFetch().fetch);
    await expect(reversalTool.handler(client, { amount: 100 })).rejects.toThrow();
  });
});

describe("simulate tools (session-token authed)", () => {
  it("simulate_test_payment routes through the session token", async () => {
    const { fetch, calls } = mockFetch({ status: 202, json: { paymentId: UUID } });
    const client = new PaylodClient(makeConfig({ sessionToken: "jwt.abc" }), fetch);
    await simulateCollectTool.handler(client, { applicationId: UUID, phone: "254712345678" });
    expect(calls[0]!.url).toBe("https://paylod.dev/functions/v1/simulate/collect");
    expect(calls[0]!.headers.Authorization).toBe("Bearer jwt.abc");
  });

  it("simulate_outcome validates the outcome enum", async () => {
    const client = new PaylodClient(makeConfig({ sessionToken: "jwt.abc" }), mockFetch().fetch);
    await expect(
      simulateOutcomeTool.handler(client, { paymentId: UUID, outcome: "explode" }),
    ).rejects.toThrow();
  });

  it("simulate fails clearly without a session token", async () => {
    const client = new PaylodClient(makeConfig(), mockFetch().fetch);
    await expect(
      simulateCollectTool.handler(client, { applicationId: UUID, phone: "254712345678" }),
    ).rejects.toThrow(/session token/i);
  });
});

describe("mint_api_key", () => {
  it("posts to /mint-key using the session token", async () => {
    const { fetch, calls } = mockFetch({ status: 201, json: { apiKey: "mp_test_x", prefix: "mp_test_x", env: "sandbox" } });
    const client = new PaylodClient(makeConfig({ sessionToken: "jwt.abc" }), fetch);
    await mintKeyTool.handler(client, { applicationId: UUID, env: "sandbox" });
    expect(calls[0]!.url).toBe("https://paylod.dev/functions/v1/mint-key");
    expect(calls[0]!.headers.Authorization).toBe("Bearer jwt.abc");
  });
});
