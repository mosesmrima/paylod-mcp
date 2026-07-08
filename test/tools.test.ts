import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "../src/tools/index.js";
import { SCOPES } from "../src/scopes.js";
import { collectTool } from "../src/tools/collect.js";
import { statusTool } from "../src/tools/status.js";
import { qrTool } from "../src/tools/qr.js";
import { registerC2bTool } from "../src/tools/c2b.js";
import { accountBalanceTool } from "../src/tools/account-balance.js";
import { transactionStatusTool } from "../src/tools/transaction-status.js";
import { payoutTool } from "../src/tools/payout.js";
import { reversalTool } from "../src/tools/reversal.js";
import { simulateCollectTool, simulateOutcomeTool } from "../src/tools/simulate.js";
import { mintKeyTool } from "../src/tools/mint-key.js";
import { createAppTool } from "../src/tools/provision.js";
import { setCredentialsTool } from "../src/tools/credentials.js";
import { listApplicationsTool } from "../src/tools/apps.js";
import { authenticateTool } from "../src/tools/authenticate.js";
import { configureWebhookTool, listWebhooksTool } from "../src/tools/webhooks.js";
import { decodeErrorTool } from "../src/tools/decode-error.js";
import { makeClient, mockFetch } from "./helpers.js";

const UUID = "11111111-2222-3333-4444-555555555555";
const BASE = "https://paylod.dev/functions/v1";

describe("tool surface", () => {
  it("exposes exactly the 18 contract tools", () => {
    expect(ALL_TOOLS.length).toBe(18);
    const names = new Set(ALL_TOOLS.map((t) => t.name));
    for (const n of [
      "authenticate",
      "list_applications",
      "create_app",
      "set_credentials",
      "mint_key",
      "configure_webhook",
      "list_webhooks",
      "request_stk_push",
      "get_payment_status",
      "generate_qr",
      "register_c2b",
      "get_account_balance",
      "get_transaction_status",
      "payout",
      "reversal",
      "simulate_test_payment",
      "simulate_outcome",
      "decode_mpesa_error",
    ]) {
      expect(names.has(n)).toBe(true);
    }
  });

  it("maps every tool to its contract scope (§2.2)", () => {
    const scopeOf = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t.scope]));
    expect(scopeOf.authenticate).toBeUndefined();
    expect(scopeOf.decode_mpesa_error).toBeUndefined();
    expect(scopeOf.list_applications).toBe(SCOPES.teamRead);
    expect(scopeOf.create_app).toBe(SCOPES.appsWrite);
    expect(scopeOf.set_credentials).toBe(SCOPES.credentialsWrite);
    expect(scopeOf.mint_key).toBe(SCOPES.keysMint);
    expect(scopeOf.configure_webhook).toBe(SCOPES.webhooksWrite);
    expect(scopeOf.list_webhooks).toBe(SCOPES.webhooksWrite);
    expect(scopeOf.request_stk_push).toBe(SCOPES.paymentsCollect);
    expect(scopeOf.generate_qr).toBe(SCOPES.paymentsCollect);
    expect(scopeOf.register_c2b).toBe(SCOPES.paymentsCollect);
    expect(scopeOf.get_payment_status).toBe(SCOPES.paymentsRead);
    expect(scopeOf.get_account_balance).toBe(SCOPES.paymentsRead);
    expect(scopeOf.get_transaction_status).toBe(SCOPES.paymentsRead);
    expect(scopeOf.payout).toBe(SCOPES.paymentsPayout);
    expect(scopeOf.reversal).toBe(SCOPES.paymentsPayout);
    expect(scopeOf.simulate_test_payment).toBe(SCOPES.paymentsSimulate);
    expect(scopeOf.simulate_outcome).toBe(SCOPES.paymentsSimulate);
  });
});

describe("tool → endpoint mapping", () => {
  it("authenticate reflects granted scopes without a network call", async () => {
    const { fetch, calls } = mockFetch();
    const client = makeClient({ scopes: new Set([SCOPES.paymentsRead]) }, fetch);
    const res = (await authenticateTool.handler(client, {})) as {
      authenticated: boolean;
      scopesGranted: string[];
    };
    expect(calls.length).toBe(0);
    expect(res.authenticated).toBe(true);
    expect(res.scopesGranted).toEqual([SCOPES.paymentsRead]);
  });

  it("list_applications → GET /apps", async () => {
    const { fetch, calls } = mockFetch({ json: { applications: [] } });
    await listApplicationsTool.handler(makeClient({}, fetch), {});
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(`${BASE}/apps`);
  });

  it("create_app → POST /provision", async () => {
    const { fetch, calls } = mockFetch({ status: 201, json: { applicationId: UUID } });
    await createAppTool.handler(makeClient({}, fetch), {
      organizationName: "Acme",
      applicationName: "Checkout",
    });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(`${BASE}/provision`);
  });

  it("set_credentials → POST /save-credentials", async () => {
    const { fetch, calls } = mockFetch({ json: {} });
    await setCredentialsTool.handler(makeClient({}, fetch), {
      applicationId: UUID,
      env: "sandbox",
      product: "stk",
      consumerKey: "ck",
      consumerSecret: "cs",
      passkey: "pk",
      shortcode: "174379",
    });
    expect(calls[0]!.url).toBe(`${BASE}/save-credentials`);
  });

  it("mint_key → POST /mint-key with applicationId", async () => {
    const { fetch, calls } = mockFetch({ status: 201, json: { apiKey: "mp_test_x" } });
    await mintKeyTool.handler(makeClient({}, fetch), { applicationId: UUID });
    expect(calls[0]!.url).toBe(`${BASE}/mint-key`);
    expect(JSON.parse(calls[0]!.body!)).toMatchObject({ applicationId: UUID });
  });

  it("configure_webhook creates via POST when no id is given", async () => {
    const { fetch, calls } = mockFetch({ status: 201, json: { webhookEndpointId: UUID } });
    await configureWebhookTool.handler(makeClient({}, fetch), {
      applicationId: UUID,
      url: "https://merchant.example.com/hook",
    });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(`${BASE}/webhook-endpoints`);
  });

  it("configure_webhook updates via PATCH when an id is given", async () => {
    const { fetch, calls } = mockFetch({ json: { webhookEndpointId: UUID } });
    await configureWebhookTool.handler(makeClient({}, fetch), {
      applicationId: UUID,
      url: "https://merchant.example.com/hook2",
      webhookEndpointId: UUID,
    });
    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.url).toBe(`${BASE}/webhook-endpoints/${UUID}`);
  });

  it("configure_webhook rolls the secret via /webhook-secret when asked", async () => {
    const { fetch, calls } = mockFetch({ status: 201, json: { webhookEndpointId: UUID } });
    await configureWebhookTool.handler(makeClient({}, fetch), {
      applicationId: UUID,
      url: "https://merchant.example.com/hook",
      rollSecret: true,
    });
    expect(calls.map((c) => c.url)).toEqual([`${BASE}/webhook-endpoints`, `${BASE}/webhook-secret`]);
  });

  it("list_webhooks → GET /webhook-endpoints?applicationId=", async () => {
    const { fetch, calls } = mockFetch({ json: { endpoints: [] } });
    await listWebhooksTool.handler(makeClient({}, fetch), { applicationId: UUID });
    expect(calls[0]!.url).toBe(`${BASE}/webhook-endpoints?applicationId=${UUID}`);
  });

  it("request_stk_push → POST /provider-ops/collect, idempotencyKey to header", async () => {
    const { fetch, calls } = mockFetch({ status: 202, json: { paymentId: "p1" } });
    await collectTool.handler(makeClient({}, fetch), {
      applicationId: UUID,
      env: "sandbox",
      amount: 100,
      phone: "254712345678",
      idempotencyKey: "idem-1",
    });
    expect(calls[0]!.url).toBe(`${BASE}/provider-ops/collect`);
    expect(calls[0]!.headers["Idempotency-Key"]).toBe("idem-1");
    const body = JSON.parse(calls[0]!.body!);
    expect(body.idempotencyKey).toBeUndefined();
    expect(body).toMatchObject({ applicationId: UUID, env: "sandbox", amount: 100 });
  });

  it("request_stk_push rejects a bad phone / amount", async () => {
    const client = makeClient({}, mockFetch().fetch);
    await expect(
      collectTool.handler(client, { applicationId: UUID, env: "sandbox", amount: 10.5, phone: "254712345678" }),
    ).rejects.toThrow();
    await expect(
      collectTool.handler(client, { applicationId: UUID, env: "sandbox", amount: 10, phone: "nope" }),
    ).rejects.toThrow();
  });

  it("get_payment_status → POST /provider-ops/status", async () => {
    const { fetch, calls } = mockFetch({ json: { id: "p1", status: "success" } });
    await statusTool.handler(makeClient({}, fetch), { applicationId: UUID, env: "sandbox", paymentId: "p1" });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(`${BASE}/provider-ops/status`);
  });

  it("generate_qr → POST /provider-ops/qr", async () => {
    const { fetch, calls } = mockFetch({ json: { qrBase64: "AAA" } });
    await qrTool.handler(makeClient({}, fetch), { applicationId: UUID, env: "sandbox", amount: 50 });
    expect(calls[0]!.url).toBe(`${BASE}/provider-ops/qr`);
  });

  it("register_c2b → POST /provider-ops/c2b-register", async () => {
    const { fetch, calls } = mockFetch({ json: { registered: true } });
    await registerC2bTool.handler(makeClient({}, fetch), { applicationId: UUID, env: "sandbox" });
    expect(calls[0]!.url).toBe(`${BASE}/provider-ops/c2b-register`);
  });

  it("get_account_balance → POST /provider-ops/account-balance", async () => {
    const { fetch, calls } = mockFetch({ status: 202, json: { queryId: "q1" } });
    await accountBalanceTool.handler(makeClient({}, fetch), { applicationId: UUID, env: "sandbox" });
    expect(calls[0]!.url).toBe(`${BASE}/provider-ops/account-balance`);
  });

  it("get_transaction_status → POST /provider-ops/transaction-status", async () => {
    const { fetch, calls } = mockFetch({ status: 202, json: { queryId: "q1" } });
    await transactionStatusTool.handler(makeClient({}, fetch), {
      applicationId: UUID,
      env: "sandbox",
      transactionId: "OEI2AK4Q16",
    });
    expect(calls[0]!.url).toBe(`${BASE}/provider-ops/transaction-status`);
  });

  it("payout → POST /provider-ops/payout", async () => {
    const { fetch, calls } = mockFetch({ status: 202, json: { disbursementId: "d1" } });
    await payoutTool.handler(makeClient({}, fetch), {
      applicationId: UUID,
      env: "sandbox",
      amount: 100,
      phone: "254712345678",
    });
    expect(calls[0]!.url).toBe(`${BASE}/provider-ops/payout`);
  });

  it("reversal → POST /provider-ops/reversal and requires transactionId", async () => {
    const { fetch, calls } = mockFetch({ status: 202, json: { disbursementId: "d1" } });
    await reversalTool.handler(makeClient({}, fetch), {
      applicationId: UUID,
      env: "sandbox",
      transactionId: "OEI2AK4Q16",
      amount: 100,
    });
    expect(calls[0]!.url).toBe(`${BASE}/provider-ops/reversal`);
    await expect(
      reversalTool.handler(makeClient({}, mockFetch().fetch), {
        applicationId: UUID,
        env: "sandbox",
        amount: 100,
      }),
    ).rejects.toThrow();
  });

  it("simulate_test_payment → POST /simulate/collect (OAuth token, no session token)", async () => {
    const { fetch, calls } = mockFetch({ status: 202, json: { paymentId: UUID } });
    await simulateCollectTool.handler(makeClient({ token: "oauth.jwt" }, fetch), {
      applicationId: UUID,
      phone: "254712345678",
    });
    expect(calls[0]!.url).toBe(`${BASE}/simulate/collect`);
    expect(calls[0]!.headers.Authorization).toBe("Bearer oauth.jwt");
  });

  it("simulate_outcome → POST /simulate/outcome and validates the enum", async () => {
    const { fetch, calls } = mockFetch({ json: { status: "success" } });
    await simulateOutcomeTool.handler(makeClient({}, fetch), { paymentId: UUID, outcome: "approve" });
    expect(calls[0]!.url).toBe(`${BASE}/simulate/outcome`);
    await expect(
      simulateOutcomeTool.handler(makeClient({}, mockFetch().fetch), { paymentId: UUID, outcome: "explode" }),
    ).rejects.toThrow();
  });

  it("decode_mpesa_error is local (no network)", async () => {
    const { fetch, calls } = mockFetch();
    const res = (await decodeErrorTool.handler(makeClient({}, fetch), { resultCode: 1032 })) as {
      code: string;
    };
    expect(calls.length).toBe(0);
    expect(res.code).toBe("1032");
  });
});
