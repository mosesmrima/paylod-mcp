import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ALL_TOOLS } from "../src/tools/index.js";
import { SCOPES } from "../src/scopes.js";
import { collectTool } from "../src/tools/collect.js";
import { statusTool } from "../src/tools/status.js";
import { listKeysTool, revokeKeyTool } from "../src/tools/keys.js";
import { qrTool } from "../src/tools/qr.js";
import { registerC2bTool } from "../src/tools/c2b.js";
import { accountBalanceTool } from "../src/tools/account-balance.js";
import { transactionStatusTool } from "../src/tools/transaction-status.js";
import { payoutTool } from "../src/tools/payout.js";
import { reversalTool } from "../src/tools/reversal.js";
import { simulateCollectTool, simulateOutcomeTool } from "../src/tools/simulate.js";
import { mintKeyTool } from "../src/tools/mint-key.js";
import { createAppTool } from "../src/tools/provision.js";
import { createApplicationTool, getCallbackUrlTool } from "../src/tools/applications.js";
import { setCredentialsTool } from "../src/tools/credentials.js";
import { listApplicationsTool } from "../src/tools/apps.js";
import { authenticateTool } from "../src/tools/authenticate.js";
import { configureWebhookTool, listWebhooksTool } from "../src/tools/webhooks.js";
import { decodeErrorTool } from "../src/tools/decode-error.js";
import { makeClient, mockFetch, mockFetchSequence } from "./helpers.js";

const UUID = "11111111-2222-3333-4444-555555555555";
const BASE = "https://paylod.dev/functions/v1";
const PAYMENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
/** An application in a DIFFERENT organization — used to prove the mismatch guard. */
const OTHER_APP_ID = "99999999-8888-7777-6666-555555555555";

describe("tool surface", () => {
  it("exposes exactly the 23 contract tools", () => {
    expect(ALL_TOOLS.length).toBe(23);
    const names = new Set(ALL_TOOLS.map((t) => t.name));
    for (const n of [
      "authenticate",
      "list_applications",
      "create_app",
      "create_application",
      "get_callback_url",
      "set_credentials",
      "mint_key",
      "configure_webhook",
      "list_webhooks",
      "request_stk_push",
      "get_payment_status",
      "list_keys",
      "revoke_key",
      "generate_qr",
      "register_c2b",
      "get_account_balance",
      "get_transaction_status",
      "payout",
      "reversal",
      "simulate_test_payment",
      "simulate_outcome",
      "decode_mpesa_error",
      "get_docs",
    ]) {
      expect(names.has(n)).toBe(true);
    }
  });

  it("maps every tool to its contract scope (§2.2)", () => {
    const scopeOf = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t.scope]));
    expect(scopeOf.authenticate).toBeUndefined();
    expect(scopeOf.decode_mpesa_error).toBeUndefined();
    expect(scopeOf.get_docs).toBeUndefined();
    expect(scopeOf.list_applications).toBe(SCOPES.teamRead);
    expect(scopeOf.create_app).toBe(SCOPES.appsWrite);
    expect(scopeOf.create_application).toBe(SCOPES.appsWrite);
    // apps.write (not a read scope): the callback token is a bearer-equivalent secret.
    expect(scopeOf.get_callback_url).toBe(SCOPES.appsWrite);
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
      product: "paybill",
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

  it("get_payment_status → resolves via GET /payments/:id then POST /provider-ops/status", async () => {
    const { fetch, calls } = mockFetchSequence([
      { json: { payment: { id: PAYMENT_ID, applicationId: UUID, env: "sandbox" } } },
      { json: { id: PAYMENT_ID, status: "success" } },
    ]);
    await statusTool.handler(makeClient({}, fetch), { paymentId: PAYMENT_ID });

    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(`${BASE}/payments/${PAYMENT_ID}`);
    expect(calls[1]!.method).toBe("POST");
    expect(calls[1]!.url).toBe(`${BASE}/provider-ops/status`);
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

/**
 * Regression suite for the schema drift found against the LIVE deployment: MCP zod enums that no
 * value could satisfy, because they described the Daraja API (stk/c2b/b2c/qr) while the backend
 * validates the shortcode KIND (paybill/till). Every case below is pinned to the backend source.
 */
describe("backend schema parity (regression)", () => {
  it("create_app product accepts the backend enum paybill|till and rejects the old stk|c2b|b2c|qr", async () => {
    const { fetch, calls } = mockFetch({ status: 201, json: { applicationId: UUID } });
    await createAppTool.handler(makeClient({}, fetch), {
      organizationName: "Acme",
      applicationName: "Checkout",
      product: "till",
    });
    expect(JSON.parse(calls[0]!.body!).product).toBe("till");

    for (const product of ["stk", "c2b", "b2c", "qr"]) {
      await expect(
        createAppTool.handler(makeClient({}, mockFetch().fetch), {
          organizationName: "Acme",
          applicationName: "Checkout",
          product,
        }),
      ).rejects.toThrow();
    }
  });

  it("set_credentials product accepts paybill|till and rejects the old API-name enum", async () => {
    const { fetch, calls } = mockFetch({ json: {} });
    await setCredentialsTool.handler(makeClient({}, fetch), {
      applicationId: UUID,
      env: "sandbox",
      product: "till",
      consumerKey: "ck",
      consumerSecret: "cs",
      passkey: "pk",
      shortcode: "174379",
      partyB: "600000",
    });
    expect(JSON.parse(calls[0]!.body!).product).toBe("till");

    await expect(
      setCredentialsTool.handler(makeClient({}, mockFetch().fetch), {
        applicationId: UUID,
        env: "sandbox",
        product: "stk",
        consumerKey: "ck",
        consumerSecret: "cs",
        passkey: "pk",
        shortcode: "174379",
      }),
    ).rejects.toThrow();
  });

  it("create_app credentials mirror the backend object shape (not a loose record)", async () => {
    await expect(
      createAppTool.handler(makeClient({}, mockFetch().fetch), {
        organizationName: "Acme",
        applicationName: "Checkout",
        // Missing passkey + shortcode — the backend's credentialsSchema requires them.
        credentials: { consumerKey: "ck", consumerSecret: "cs" },
      }),
    ).rejects.toThrow();
  });
});

describe("create_application + get_callback_url", () => {
  it("create_application → POST /applications (org inferred when omitted)", async () => {
    const { fetch, calls } = mockFetch({
      status: 201,
      json: { applicationId: UUID, callbackUrl: "https://paylod.dev/functions/v1/callback/cbk_x" },
    });
    await createApplicationTool.handler(makeClient({}, fetch), { name: "Second App", product: "till" });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(`${BASE}/applications`);
    const body = JSON.parse(calls[0]!.body!);
    expect(body).toEqual({ name: "Second App", product: "till" });
  });

  it("create_application forwards an explicit organizationId and rejects a non-UUID one", async () => {
    const { fetch, calls } = mockFetch({ status: 201, json: {} });
    await createApplicationTool.handler(makeClient({}, fetch), { name: "In B", organizationId: UUID });
    expect(JSON.parse(calls[0]!.body!).organizationId).toBe(UUID);

    await expect(
      createApplicationTool.handler(makeClient({}, mockFetch().fetch), {
        name: "Bad",
        organizationId: "nope",
      }),
    ).rejects.toThrow();
  });

  it("get_callback_url → GET /applications/:id/callback-url?env=", async () => {
    const { fetch, calls } = mockFetch({
      json: { callbackUrl: "https://paylod.dev/functions/v1/callback/cbk_x", env: "production" },
    });
    await getCallbackUrlTool.handler(makeClient({}, fetch), {
      applicationId: UUID,
      env: "production",
    });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(`${BASE}/applications/${UUID}/callback-url?env=production`);
    expect(calls[0]!.body).toBeUndefined();
  });

  it("get_callback_url omits env when not supplied (backend defaults it)", async () => {
    const { fetch, calls } = mockFetch({ json: {} });
    await getCallbackUrlTool.handler(makeClient({}, fetch), { applicationId: UUID });
    expect(calls[0]!.url).toBe(`${BASE}/applications/${UUID}/callback-url`);
  });

  it("get_callback_url rejects a bad applicationId / env", async () => {
    await expect(
      getCallbackUrlTool.handler(makeClient({}, mockFetch().fetch), { applicationId: "nope" }),
    ).rejects.toThrow();
    await expect(
      getCallbackUrlTool.handler(makeClient({}, mockFetch().fetch), {
        applicationId: UUID,
        env: "staging",
      }),
    ).rejects.toThrow();
  });
});

/**
 * ERGONOMICS REGRESSION — the exact calls that failed twice in front of the product owner:
 *
 *   request_stk_push({applicationId, phone, amount, reference}) -> ERROR path ["env"] "Required"
 *   get_payment_status({paymentId})                             -> ERROR path ["applicationId"], ["env"]
 *
 * The second is a bug (paymentId uniquely identifies a payment; the row knows its own app + env)
 * and is fixed. The FIRST is not: `env` picks between sandbox and REAL MONEY, an application can
 * hold both credential sets at once (credentials is UNIQUE (application_id, env), and the
 * applications table has no env column), so there is nothing unambiguous to default it to. It
 * stays required on money-moving calls BY DESIGN — these tests pin that decision so nobody
 * "helpfully" defaults it later.
 */
describe("get_payment_status: paymentId is sufficient", () => {
  const resolved = { payment: { id: PAYMENT_ID, applicationId: UUID, env: "sandbox" } };

  it("accepts ONLY a paymentId — no applicationId, no env", () => {
    const schema = z.object(statusTool.inputSchema as never);
    expect(schema.safeParse({ paymentId: PAYMENT_ID }).success).toBe(true);
  });

  it("still requires a paymentId, and it must be a UUID", () => {
    const schema = z.object(statusTool.inputSchema as never);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ paymentId: "p1" }).success).toBe(false);
  });

  it("sends the AUTHORITATIVE applicationId + env from the payment, not the caller's", async () => {
    const { fetch, calls } = mockFetchSequence([
      { json: resolved },
      { json: { id: PAYMENT_ID, status: "success" } },
    ]);
    await statusTool.handler(makeClient({}, fetch), { paymentId: PAYMENT_ID });

    expect(JSON.parse(calls[1]!.body!)).toEqual({
      applicationId: UUID,
      env: "sandbox",
      paymentId: PAYMENT_ID,
    });
  });

  it("stays backward compatible: a CORRECT applicationId + env still works", async () => {
    const { fetch, calls } = mockFetchSequence([
      { json: resolved },
      { json: { id: PAYMENT_ID, status: "success" } },
    ]);
    const out = await statusTool.handler(makeClient({}, fetch), {
      paymentId: PAYMENT_ID,
      applicationId: UUID,
      env: "sandbox",
    });

    expect(calls.length).toBe(2);
    expect(out).toEqual({ id: PAYMENT_ID, status: "success" });
  });

  // THE TRAP. /provider-ops/status looks a payment up by (applicationId, paymentId) and does NOT
  // filter on env, so a WRONG env used to still find the row, fail to load that env's credentials,
  // and silently return the STALE `pending` view — reporting "pending" for a payment that had
  // actually succeeded. A contradiction must be an error, never a misleading result.
  it("REJECTS a contradicting env instead of silently returning a stale view", async () => {
    const { fetch, calls } = mockFetchSequence([{ json: resolved }]);
    await expect(
      statusTool.handler(makeClient({}, fetch), { paymentId: PAYMENT_ID, env: "production" }),
    ).rejects.toThrow(/env mismatch/i);

    // It must NOT have gone on to call provider-ops with a bogus env.
    expect(calls.length).toBe(1);
  });

  it("REJECTS a contradicting applicationId", async () => {
    const { fetch, calls } = mockFetchSequence([{ json: resolved }]);
    await expect(
      statusTool.handler(makeClient({}, fetch), {
        paymentId: PAYMENT_ID,
        applicationId: OTHER_APP_ID,
      }),
    ).rejects.toThrow(/applicationId mismatch/i);
    expect(calls.length).toBe(1);
  });
});

/**
 * OWNERSHIP / IDOR — the one thing that must not be got wrong.
 *
 * Resolving tenancy "from the payment id" must NOT let an authenticated agent read any payment by
 * guessing a UUID. The gate is GET /payments/:id, which asserts the row's organization_id is one of
 * the CALLER'S OWN memberships and returns the same 404 as a non-existent payment otherwise (no
 * existence oracle). The MCP tool never bypasses it: the resolve call is the FIRST thing it does and
 * a non-2xx there aborts the tool before /provider-ops/status is ever reached.
 */
describe("get_payment_status: a payment in ANOTHER org is not readable", () => {
  it("propagates the 404 and NEVER calls provider-ops with a foreign payment", async () => {
    // Exactly what the backend returns for a payment belonging to an org the caller is not in.
    const { fetch, calls } = mockFetchSequence([
      { status: 404, json: { error: "payment not found" } },
    ]);

    await expect(
      statusTool.handler(makeClient({}, fetch), { paymentId: PAYMENT_ID }),
    ).rejects.toThrow(/payment not found/i);

    // The authorization gate is the ONLY call made. If this ever becomes 2, the tenancy check has
    // been bypassed and a foreign payment is being settled/read.
    expect(calls.length).toBe(1);
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(`${BASE}/payments/${PAYMENT_ID}`);
  });

  it("a 403 (insufficient scope) also aborts before provider-ops", async () => {
    const { fetch, calls } = mockFetchSequence([
      { status: 403, json: { error: "insufficient scope: paylod:payments.read" } },
    ]);
    await expect(
      statusTool.handler(makeClient({}, fetch), { paymentId: PAYMENT_ID }),
    ).rejects.toThrow(/insufficient scope/i);
    expect(calls.length).toBe(1);
  });

  it("forwards the caller's own OAuth token on the gate call (tenancy is derived from it)", async () => {
    const { fetch, calls } = mockFetchSequence([
      { json: { payment: { id: PAYMENT_ID, applicationId: UUID, env: "sandbox" } } },
      { json: { id: PAYMENT_ID, status: "pending" } },
    ]);
    await statusTool.handler(makeClient({ token: "caller-token" }, fetch), { paymentId: PAYMENT_ID });
    expect(calls[0]!.headers.Authorization).toBe("Bearer caller-token");
  });
});

describe("env stays REQUIRED on money-moving tools (an app can be BOTH envs)", () => {
  it.each([
    ["request_stk_push", collectTool, { applicationId: UUID, amount: 100, phone: "254712345678" }],
    ["payout", payoutTool, { applicationId: UUID, amount: 100, phone: "254712345678" }],
    ["reversal", reversalTool, { applicationId: UUID, transactionId: "OEI2AK4Q16", amount: 100 }],
  ])("%s rejects a call with no env — it must never be guessed", (_name, tool, args) => {
    const schema = z.object(tool.inputSchema as never);
    expect(schema.safeParse(args).success).toBe(false);
    expect(schema.safeParse({ ...args, env: "sandbox" }).success).toBe(true);
  });
});

describe("key management: list_keys + revoke_key", () => {
  it("list_keys → GET /api-keys, scoped to an application", async () => {
    const { fetch, calls } = mockFetch({ json: { keys: [] } });
    await listKeysTool.handler(makeClient({}, fetch), { applicationId: UUID });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(`${BASE}/api-keys?applicationId=${UUID}`);
  });

  it("list_keys passes env + includeRevoked through as query params", async () => {
    const { fetch, calls } = mockFetch({ json: { keys: [] } });
    await listKeysTool.handler(makeClient({}, fetch), {
      applicationId: UUID,
      env: "production",
      includeRevoked: true,
    });
    expect(calls[0]!.url).toContain("env=production");
    expect(calls[0]!.url).toContain("includeRevoked=true");
  });

  it("revoke_key needs ONLY an apiKeyId — the key knows its own application", async () => {
    const schema = z.object(revokeKeyTool.inputSchema as never);
    expect(schema.safeParse({ apiKeyId: UUID }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);

    const { fetch, calls } = mockFetch({ json: { revoked: true, apiKeyId: UUID, prefix: "mp_test_ab" } });
    await revokeKeyTool.handler(makeClient({}, fetch), { apiKeyId: UUID });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(`${BASE}/api-keys/${UUID}/revoke`);
    // The id is a PATH segment — POSTing a body here would be silently ignored by the backend.
    expect(calls[0]!.body).toBeUndefined();
  });

  it("both key tools require the keys.mint scope — listing keys is key-management surface", () => {
    expect(listKeysTool.scope).toBe(SCOPES.keysMint);
    expect(revokeKeyTool.scope).toBe(SCOPES.keysMint);
  });

  it("list_keys never promises the secret — only the prefix", () => {
    expect(listKeysTool.description).toMatch(/prefix/i);
    expect(listKeysTool.description).not.toMatch(/returns the (plaintext|secret)/i);
  });
});
