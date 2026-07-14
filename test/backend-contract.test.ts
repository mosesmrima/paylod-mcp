import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "../src/tools/index.js";
import type { ToolDef } from "../src/tools/types.js";
import { makeClient, mockFetch } from "./helpers.js";

/**
 * BACKEND CONTRACT PINS.
 *
 * The root cause of the drift this file exists to prevent: a tool's zod schema is the ONLY thing an
 * agent sees, and nothing forced it to match the edge function it calls. A tool could invent a field
 * (`occasion`, `size`, `identifierType`), send it, and have the backend's `z.object()` SILENTLY STRIP
 * it — no error anywhere, while the agent believed it had configured something. Or it could send the
 * wrong field entirely (`configure_webhook` posting `{ applicationId }` to a `/webhook-secret` that
 * only models `{ webhookEndpointId }`) and simply fail.
 *
 * BACKEND is transcribed by hand from the Deno source in ../../mpesa/supabase/functions/<fn>/index.ts.
 * `body` lists EXACTLY the keys of that route's zod schema. The tests then drive every tool handler
 * with a maximal argument set and assert:
 *
 *   1. the method + path it calls,
 *   2. that EVERY body key it sends is one the backend actually models (the anti-silent-drop rule),
 *   3. that the required backend keys are present.
 *
 * If someone adds a field to a tool that the backend does not accept, (2) fails. If the backend
 * renames or drops a field, update BACKEND here and the failing test names the tool to fix.
 */
interface Contract {
  readonly method: string;
  /** Path after the backend base URL, with :params for path segments. */
  readonly path: string;
  /** Exact key set of the backend's zod body schema (empty for GET). */
  readonly body: readonly string[];
  /** Keys the backend's schema marks required. */
  readonly required: readonly string[];
}

const BACKEND: Record<string, Contract> = {
  // supabase/functions/apps/index.ts — GET /apps (no body)
  list_applications: { method: "GET", path: "/apps", body: [], required: [] },

  // supabase/functions/provision/index.ts — provisionSchema
  create_app: {
    method: "POST",
    path: "/provision",
    body: ["organizationName", "applicationName", "product", "shortcode", "env", "credentials"],
    required: ["organizationName", "applicationName"],
  },

  // supabase/functions/applications/index.ts — createSchema
  create_application: {
    method: "POST",
    path: "/applications",
    body: ["name", "organizationId", "env", "product", "shortcode", "provider"],
    required: ["name"],
  },

  // supabase/functions/applications/index.ts — GET /:id/callback-url?env=
  get_callback_url: {
    method: "GET",
    path: "/applications/:id/callback-url",
    body: [],
    required: [],
  },

  // supabase/functions/save-credentials/index.ts — saveSchema
  set_credentials: {
    method: "POST",
    path: "/save-credentials",
    body: [
      "applicationId",
      "env",
      "product",
      "consumerKey",
      "consumerSecret",
      "passkey",
      "shortcode",
      "partyB",
    ],
    required: [
      "applicationId",
      "env",
      "product",
      "consumerKey",
      "consumerSecret",
      "passkey",
      "shortcode",
    ],
  },

  // supabase/functions/mint-key/index.ts — mintSchema
  mint_key: {
    method: "POST",
    path: "/mint-key",
    body: ["applicationId", "env", "name"],
    required: ["applicationId"],
  },

  // supabase/functions/webhook-endpoints/index.ts — GET /?applicationId=
  list_webhooks: { method: "GET", path: "/webhook-endpoints", body: [], required: [] },

  // supabase/functions/provider-ops/index.ts — baseSchema.extend(...) per route.
  request_stk_push: {
    method: "POST",
    path: "/provider-ops/collect",
    body: ["applicationId", "env", "phone", "amount", "accountReference", "description"],
    required: ["applicationId", "env", "phone", "amount"],
  },
  // get_payment_status is deliberately NOT here — it is a CHAINED tool (GET /payments/:id to resolve
  // + authorize, then POST /provider-ops/status to settle). The single-call driver below cannot model
  // it; it is pinned in its own describe block ("get_payment_status resolves ...").

  // supabase/functions/api-keys/index.ts — GET /?applicationId=&env=&includeRevoked=
  list_keys: { method: "GET", path: "/api-keys", body: [], required: [] },

  // supabase/functions/api-keys/index.ts — POST /:id/revoke (id in the PATH, no body at all)
  revoke_key: { method: "POST", path: "/api-keys/:id/revoke", body: [], required: [] },
  generate_qr: {
    method: "POST",
    path: "/provider-ops/qr",
    body: ["applicationId", "env", "amount", "refNo", "merchantName", "trxCode", "cpi"],
    required: ["applicationId", "env", "amount"],
  },
  register_c2b: {
    method: "POST",
    path: "/provider-ops/c2b-register",
    body: ["applicationId", "env"],
    required: ["applicationId", "env"],
  },
  get_account_balance: {
    method: "POST",
    path: "/provider-ops/account-balance",
    body: ["applicationId", "env"],
    required: ["applicationId", "env"],
  },
  get_transaction_status: {
    method: "POST",
    path: "/provider-ops/transaction-status",
    body: ["applicationId", "env", "transactionId"],
    required: ["applicationId", "env", "transactionId"],
  },
  payout: {
    method: "POST",
    path: "/provider-ops/payout",
    body: ["applicationId", "env", "amount", "phone", "commandId", "remarks"],
    required: ["applicationId", "env", "amount", "phone"],
  },
  reversal: {
    method: "POST",
    path: "/provider-ops/reversal",
    body: ["applicationId", "env", "transactionId", "amount", "remarks"],
    required: ["applicationId", "env", "transactionId", "amount"],
  },

  // supabase/functions/simulate/index.ts — collectSchema / outcomeSchema
  simulate_test_payment: {
    method: "POST",
    path: "/simulate/collect",
    body: ["applicationId", "phone", "amount", "accountRef"],
    required: ["applicationId", "phone"],
  },
  simulate_outcome: {
    method: "POST",
    path: "/simulate/outcome",
    body: ["paymentId", "outcome"],
    required: ["paymentId", "outcome"],
  },
};

const UUID = "11111111-2222-3333-4444-555555555555";
const EP_ID = "99999999-8888-7777-6666-555555555555";
const BASE = "https://paylod.dev/functions/v1";

/** A maximal argument set per tool — every optional the tool declares is supplied. */
const MAX_ARGS: Record<string, Record<string, unknown>> = {
  list_applications: {},
  create_app: {
    organizationName: "Acme",
    applicationName: "Store",
    product: "till",
    env: "sandbox",
    shortcode: "174379",
    credentials: {
      consumerKey: "ck",
      consumerSecret: "cs",
      passkey: "pk",
      shortcode: "174379",
      partyB: "174380",
    },
  },
  create_application: {
    name: "Store 2",
    organizationId: UUID,
    env: "production",
    product: "paybill",
    shortcode: "174379",
  },
  get_callback_url: { applicationId: UUID, env: "production" },
  set_credentials: {
    applicationId: UUID,
    env: "sandbox",
    product: "till",
    consumerKey: "ck",
    consumerSecret: "cs",
    passkey: "pk",
    shortcode: "174379",
    partyB: "174380",
  },
  mint_key: { applicationId: UUID, env: "production", name: "ci-key" },
  list_webhooks: { applicationId: UUID },
  request_stk_push: {
    applicationId: UUID,
    env: "sandbox",
    amount: 100,
    phone: "254712345678",
    accountReference: "ORDER-1",
    description: "Test payment",
    idempotencyKey: "idem-1",
  },
  list_keys: { applicationId: UUID, env: "production", includeRevoked: true },
  revoke_key: { apiKeyId: UUID },
  generate_qr: {
    applicationId: UUID,
    env: "sandbox",
    amount: 100,
    refNo: "REF",
    merchantName: "Acme",
    trxCode: "BG",
    cpi: "174379",
  },
  register_c2b: { applicationId: UUID, env: "sandbox" },
  get_account_balance: { applicationId: UUID, env: "sandbox" },
  get_transaction_status: { applicationId: UUID, env: "sandbox", transactionId: "OEI2AK4Q16" },
  payout: {
    applicationId: UUID,
    env: "sandbox",
    amount: 100,
    phone: "254712345678",
    commandId: "BusinessPayment",
    remarks: "salary",
  },
  reversal: {
    applicationId: UUID,
    env: "sandbox",
    transactionId: "OEI2AK4Q16",
    amount: 100,
    remarks: "refund",
  },
  simulate_test_payment: { applicationId: UUID, phone: "254712345678", amount: 5, accountRef: "SIM" },
  simulate_outcome: { paymentId: UUID, outcome: "approve" },
};

function toolByName(name: string): ToolDef {
  const tool = ALL_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  return tool;
}

/** Path of a recorded call, with UUID path segments normalized back to :id. */
function pathOf(url: string): string {
  return url
    .replace(BASE, "")
    .split("?")[0]!
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id");
}

describe("every networked tool matches its backend edge function", () => {
  for (const [name, contract] of Object.entries(BACKEND)) {
    it(`${name} → ${contract.method} ${contract.path}`, async () => {
      const { fetch, calls } = mockFetch({ json: {} });
      const tool = toolByName(name);
      await tool.handler(makeClient({}, fetch), MAX_ARGS[name]!);

      expect(calls.length).toBe(1);
      const call = calls[0]!;
      expect(call.method).toBe(contract.method);
      expect(pathOf(call.url)).toBe(contract.path);

      if (contract.method === "GET") {
        expect(call.body).toBeUndefined();
        return;
      }

      // A POST whose backend schema has NO body (revoke_key — the id is a path segment) must send
      // no body at all.
      if (contract.body.length === 0) {
        expect(call.body, `${name} must not send a body to ${contract.path}`).toBeUndefined();
        return;
      }

      const sent = JSON.parse(call.body!) as Record<string, unknown>;

      // (2) THE ANTI-DRIFT RULE: never send a key the backend does not model — zod would strip it
      // and the agent would never learn its input was ignored.
      for (const key of Object.keys(sent)) {
        expect(
          contract.body,
          `${name} sends "${key}", which ${contract.path} does not accept (it would be silently dropped)`,
        ).toContain(key);
      }

      // (3) Every field the backend requires is actually sent.
      for (const key of contract.required) {
        expect(sent, `${name} must send required field "${key}"`).toHaveProperty(key);
      }
    });
  }
});

describe("configure_webhook / webhook-secret (the rollSecret contract)", () => {
  it("posts ONLY { webhookEndpointId } to /webhook-secret — never { applicationId }", async () => {
    const { fetch, calls } = mockFetch({ json: { webhookEndpointId: EP_ID } });
    await toolByName("configure_webhook").handler(makeClient({}, fetch), {
      applicationId: UUID,
      url: "https://merchant.example/hooks",
      rollSecret: true,
    });

    expect(calls.length).toBe(2);
    expect(pathOf(calls[0]!.url)).toBe("/webhook-endpoints");
    expect(calls[0]!.method).toBe("POST");

    const secretCall = calls[1]!;
    expect(secretCall.method).toBe("POST");
    expect(pathOf(secretCall.url)).toBe("/webhook-secret");
    // The backend's secretSchema is z.object({ webhookEndpointId: uuid }) — that is the WHOLE schema.
    expect(JSON.parse(secretCall.body!)).toEqual({ webhookEndpointId: EP_ID });
  });

  it("rolls the secret of an existing endpoint WITHOUT a pointless PATCH", async () => {
    const { fetch, calls } = mockFetch({ json: { signingSecret: "whsec_x" } });
    await toolByName("configure_webhook").handler(makeClient({}, fetch), {
      applicationId: UUID,
      webhookEndpointId: EP_ID,
      rollSecret: true,
    });

    // PATCH with an empty body is a 422 ("at least one of url or active"), so it must be skipped.
    expect(calls.length).toBe(1);
    expect(pathOf(calls[0]!.url)).toBe("/webhook-secret");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ webhookEndpointId: EP_ID });
  });

  it("PATCHes an existing endpoint by id and never re-sends applicationId", async () => {
    const { fetch, calls } = mockFetch({ json: {} });
    await toolByName("configure_webhook").handler(makeClient({}, fetch), {
      applicationId: UUID,
      webhookEndpointId: EP_ID,
      url: "https://merchant.example/v2",
      active: false,
    });

    expect(calls.length).toBe(1);
    expect(calls[0]!.method).toBe("PATCH");
    expect(pathOf(calls[0]!.url)).toBe("/webhook-endpoints/:id");
    // patchSchema is z.object({ url?, active? }) — applicationId is not part of it.
    expect(JSON.parse(calls[0]!.body!)).toEqual({ url: "https://merchant.example/v2", active: false });
  });

  it("requires a url when creating (no webhookEndpointId to target)", async () => {
    const { fetch } = mockFetch({ json: {} });
    await expect(
      toolByName("configure_webhook").handler(makeClient({}, fetch), { applicationId: UUID }),
    ).rejects.toThrow();
  });
});

describe("declared response shapes match what the backend returns", () => {
  it("simulate_test_payment documents outcomes as objects, not strings", () => {
    // supabase/functions/simulate/index.ts returns
    //   outcomes: simOutcomesFor(provider).map((o) => ({ id: o.id, label: o.label, status: o.status }))
    const description = toolByName("simulate_test_payment").description;
    expect(description).toMatch(/\{ id, label, status \}/);
    expect(description).toMatch(/NOT an array of strings/i);
  });

  it("list_webhooks documents webhookEndpointId (the field GET now returns)", () => {
    const description = toolByName("list_webhooks").description;
    expect(description).toContain("webhookEndpointId");
    // The backend GET used to emit a bare `id`; both sides now agree on webhookEndpointId.
    expect(description).not.toMatch(/\[\{ id,/);
  });

  it("list_applications documents the env hint the backend actually returns", () => {
    expect(toolByName("list_applications").description).toContain("env");
  });
});

/**
 * THE list_keys → revoke_key HANDSHAKE.
 *
 * The two backend routes disagree with each other:
 *   GET  /api-keys          → view(r) = { id, applicationId, env, prefix, ... }   ← `id`
 *   POST /api-keys/:id/revoke → { revoked, apiKeyId, prefix }                     ← `apiKeyId`
 *
 * So the fixture below is transcribed from the backend's ACTUAL `view()` projection (with `id`),
 * NOT from the shape the tool description wishes existed. Mocking the wished-for shape is how this
 * bug survived: the old test asserted the contract against its own invention. list_keys now
 * normalizes `id` → `apiKeyId`; these tests fail if that normalization is ever removed.
 */
describe("list_keys emits the exact field revoke_key consumes", () => {
  /** VERBATIM from supabase/functions/api-keys/index.ts view() — the key is `id`, not `apiKeyId`. */
  const REAL_GET_API_KEYS_ROW = {
    id: UUID,
    applicationId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    env: "sandbox",
    prefix: "mp_test_ab12cd34",
    name: "ci-key",
    lastUsedAt: null,
    revokedAt: null,
    createdAt: "2026-07-14T00:00:00Z",
    active: true,
  } as const;

  it("renames the backend's `id` to apiKeyId (the documented shape becomes true)", async () => {
    const { fetch } = mockFetch({ json: { keys: [REAL_GET_API_KEYS_ROW] } });
    const res = (await toolByName("list_keys").handler(makeClient({}, fetch), {
      applicationId: REAL_GET_API_KEYS_ROW.applicationId,
    })) as { keys: Array<Record<string, unknown>> };

    const key = res.keys[0]!;
    expect(key.apiKeyId).toBe(UUID);
    // One word for one thing: the raw backend `id` must not survive alongside it.
    expect(key).not.toHaveProperty("id");
    // Every other column is passed through untouched.
    expect(key.prefix).toBe("mp_test_ab12cd34");
    expect(key.active).toBe(true);
  });

  it("the advertised workflow runs end to end: list a key, feed it straight to revoke_key", async () => {
    const listFetch = mockFetch({ json: { keys: [REAL_GET_API_KEYS_ROW] } });
    const listed = (await toolByName("list_keys").handler(makeClient({}, listFetch.fetch), {
      applicationId: REAL_GET_API_KEYS_ROW.applicationId,
    })) as { keys: Array<{ apiKeyId?: string }> };

    // This is literally what the tool descriptions tell an agent to do. It used to yield undefined,
    // which revoke_key's z.string().uuid() then rejected.
    const apiKeyId = listed.keys[0]!.apiKeyId;
    expect(apiKeyId).toBeTypeOf("string");

    const revokeFetch = mockFetch({ json: { revoked: true, apiKeyId, prefix: "mp_test_ab12cd34" } });
    await toolByName("revoke_key").handler(makeClient({}, revokeFetch.fetch), { apiKeyId });

    expect(pathOf(revokeFetch.calls[0]!.url)).toBe("/api-keys/:id/revoke");
    expect(revokeFetch.calls[0]!.url).toContain(UUID);
  });

  it("passes an already-correct apiKeyId through unchanged (forward-compatible with a backend fix)", async () => {
    const { fetch } = mockFetch({ json: { keys: [{ apiKeyId: UUID, prefix: "mp_test_x", active: true }] } });
    const res = (await toolByName("list_keys").handler(makeClient({}, fetch), {
      applicationId: UUID,
    })) as { keys: Array<Record<string, unknown>> };
    expect(res.keys[0]!.apiKeyId).toBe(UUID);
  });

  it("both tool descriptions promise apiKeyId — and no longer promise a bare `id`", () => {
    for (const name of ["list_keys", "revoke_key", "mint_key"]) {
      expect(toolByName(name).description, name).toContain("apiKeyId");
    }
    expect(toolByName("list_keys").description).not.toMatch(/\[\{ id,/);
  });
});

describe("no tool invents a field the backend cannot see", () => {
  // These are the exact fields that were being silently dropped before this sweep. They must not
  // reappear in any tool's input schema.
  const REMOVED: ReadonlyArray<readonly [string, string]> = [
    ["get_account_balance", "identifierType"],
    ["get_account_balance", "remarks"],
    ["get_transaction_status", "identifierType"],
    ["get_transaction_status", "remarks"],
    ["get_transaction_status", "occasion"],
    ["payout", "occasion"],
    ["reversal", "occasion"],
    ["generate_qr", "size"],
  ];

  for (const [name, field] of REMOVED) {
    it(`${name} no longer declares "${field}"`, () => {
      expect(Object.keys(toolByName(name).inputSchema)).not.toContain(field);
    });
  }

  /**
   * accountReference: THREE limits disagreed, and the tool was pinned to the loosest one.
   *
   *   Daraja `AccountReference`              — max 12. The hard limit. Safaricom rejects longer.
   *   paylod POST /collect (API key / SDK)   — z.string().max(12)  ← enforces it
   *   paylod POST /provider-ops/collect      — z.string().max(64)  ← does not; it just forwards
   *
   * provider-ops' 64 is a MISSING GUARD, not permission: a 40-char reference passes paylod's zod
   * and is rejected by Safaricom one round-trip later as an opaque Daraja error. The tool must
   * advertise the limit that is true all the way to the handset — 12 — which is also what the SDK
   * and the docs say. 12 is a strict subset of what provider-ops accepts, so nothing breaks.
   */
  it("request_stk_push caps accountReference at 12 — Daraja's hard limit, not provider-ops' 64", async () => {
    const { fetch, calls } = mockFetch({ json: {} });
    const call = (accountReference: string) =>
      toolByName("request_stk_push").handler(makeClient({}, fetch), {
        applicationId: UUID,
        env: "sandbox",
        amount: 100,
        phone: "254712345678",
        accountReference,
        description: "D".repeat(128),
      });

    await call("A".repeat(12));
    const sent = JSON.parse(calls[0]!.body!) as { accountReference: string; description: string };
    expect(sent.accountReference.length).toBe(12);
    expect(sent.description.length).toBe(128);

    // 13 chars is what Daraja rejects, so the tool must reject it first — in the agent's own
    // stack trace, not as a 502 from Safaricom.
    await expect(call("A".repeat(13))).rejects.toThrow();
  });

  it("request_stk_push does not declare `metadata` — /provider-ops/collect would drop it", () => {
    // The SDK's collect() DOES take `metadata` (POST /collect models it and echoes it on the
    // webhook). provider-ops/collect does not: it inserts `metadata: {}`. Declaring the field here
    // would be the exact silent-drop this file exists to prevent, so the tool omits it and says so.
    expect(Object.keys(toolByName("request_stk_push").inputSchema)).not.toContain("metadata");
    expect(toolByName("request_stk_push").description).toMatch(/metadata/);
  });

  it("request_stk_push sends idempotencyKey as the Idempotency-Key HEADER, not in the body", async () => {
    // provider-ops POST /collect reads the header (its zod schema has no idempotencyKey field).
    const { fetch, calls } = mockFetch({ json: {} });
    await toolByName("request_stk_push").handler(makeClient({}, fetch), {
      applicationId: UUID,
      env: "sandbox",
      amount: 100,
      phone: "254712345678",
      idempotencyKey: "idem-42",
    });
    expect(calls[0]!.headers["Idempotency-Key"]).toBe("idem-42");
    expect(JSON.parse(calls[0]!.body!)).not.toHaveProperty("idempotencyKey");
  });
});
