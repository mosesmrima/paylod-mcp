import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField } from "./common.js";
import type { ToolDef } from "./types.js";

/**
 * Tools backed by `/webhook-endpoints` (CRUD) and `/webhook-secret` (roll the HMAC secret).
 *
 * Backend truth (supabase/functions/webhook-endpoints/index.ts):
 *   POST  /webhook-endpoints      { applicationId, url, active? } → 201 { webhookEndpointId, url, active }
 *   GET   /webhook-endpoints?applicationId=…                      → 200 { endpoints: [{ webhookEndpointId, url, active, createdAt, hasSigningSecret }] }
 *   PATCH /webhook-endpoints/:id  { url?, active? }               → 200 { webhookEndpointId, url, active }  (at least one required)
 *
 * Backend truth (supabase/functions/webhook-secret/index.ts):
 *   POST  /webhook-secret         { webhookEndpointId }           → 201 { signingSecret }
 *   `webhookEndpointId` is the ONLY field the schema accepts — it is REQUIRED and must be a UUID.
 *   This tool used to send `{ applicationId }`, which the backend simply does not model.
 */

export const configureWebhookInput = {
  applicationId: applicationIdField,
  url: z
    .string()
    .url()
    .optional()
    .describe(
      "HTTPS URL paylod should POST webhook events to (SSRF-validated by the backend). REQUIRED when " +
        "creating a new endpoint; optional when updating an existing one by webhookEndpointId.",
    ),
  active: z.boolean().optional().describe("Whether the endpoint is active (default true on create)."),
  webhookEndpointId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "An existing endpoint id (from list_webhooks) to UPDATE (PATCH) or to roll the secret of. " +
        "Omit to CREATE a new endpoint (POST).",
    ),
  rollSecret: z
    .boolean()
    .optional()
    .describe(
      "If true, (re)generate the HMAC signing secret for the endpoint and return it ONCE " +
        "(POST /webhook-secret). Rolling INVALIDATES the previous secret immediately.",
    ),
} as const;

const configureSchema = z.object(configureWebhookInput).refine(
  (v) => v.webhookEndpointId !== undefined || v.url !== undefined,
  { message: "url is required when creating a webhook endpoint (omit webhookEndpointId to create)" },
);

export const configureWebhookTool: ToolDef = {
  name: "configure_webhook",
  title: "Create or update a webhook endpoint",
  scope: SCOPES.webhooksWrite,
  description:
    "Create a new webhook endpoint, update an existing one, and/or roll its HMAC signing secret. " +
    "Omit webhookEndpointId to CREATE (POST /webhook-endpoints — url is required). Pass " +
    "webhookEndpointId (from list_webhooks) to target an existing endpoint: with url and/or active it " +
    "UPDATES them (PATCH /webhook-endpoints/:id); with only rollSecret:true it rolls the secret and " +
    "changes nothing else. Set rollSecret:true to (re)generate the signing secret (POST " +
    "/webhook-secret) — it is returned ONCE as `signingSecret` and the OLD secret stops working " +
    "immediately. Returns { webhookEndpointId, url, active, signingSecret? }. The target URL is " +
    "SSRF-validated by the backend (public HTTPS only).",
  inputSchema: configureWebhookInput,
  handler: async (client, args) => {
    const { applicationId, url, active, webhookEndpointId, rollSecret } = configureSchema.parse(args);

    let endpoint: unknown = undefined;
    if (!webhookEndpointId) {
      // CREATE. `url` is guaranteed present by the refine above.
      endpoint = await client.request("POST", "/webhook-endpoints", {
        body: { applicationId, url, ...(active !== undefined ? { active } : {}) },
      });
    } else if (url !== undefined || active !== undefined) {
      // UPDATE. PATCH rejects an empty patch (422), so only call it when there is something to set.
      endpoint = await client.request(
        "PATCH",
        `/webhook-endpoints/${encodeURIComponent(webhookEndpointId)}`,
        {
          body: { ...(url !== undefined ? { url } : {}), ...(active !== undefined ? { active } : {}) },
        },
      );
    }

    if (!rollSecret) return endpoint ?? { webhookEndpointId };

    // POST /webhook-secret takes `{ webhookEndpointId }` and NOTHING else — never `applicationId`.
    const targetId =
      webhookEndpointId ??
      (isRecord(endpoint) && typeof endpoint.webhookEndpointId === "string"
        ? endpoint.webhookEndpointId
        : undefined);
    if (!targetId) {
      throw new Error(
        "cannot roll the signing secret: no webhookEndpointId (the endpoint create did not return one)",
      );
    }

    const secret = await client.request("POST", "/webhook-secret", {
      body: { webhookEndpointId: targetId },
    });

    return {
      ...(isRecord(endpoint) ? endpoint : { webhookEndpointId: targetId }),
      ...(isRecord(secret) ? secret : {}),
    };
  },
};

export const listWebhooksInput = {
  applicationId: applicationIdField,
} as const;

const listSchema = z.object(listWebhooksInput);

export const listWebhooksTool: ToolDef = {
  name: "list_webhooks",
  title: "List webhook endpoints",
  scope: SCOPES.webhooksWrite,
  description:
    "List an application's webhook endpoints (GET /webhook-endpoints?applicationId=), returning " +
    "{ endpoints: [{ webhookEndpointId, url, active, createdAt, hasSigningSecret }] }. Signing secrets " +
    "are NEVER returned — `hasSigningSecret` only says whether one is set. Use the webhookEndpointId " +
    "here to update an endpoint or roll its secret via configure_webhook.",
  inputSchema: listWebhooksInput,
  handler: async (client, args) => {
    const { applicationId } = listSchema.parse(args);
    return client.request("GET", "/webhook-endpoints", { query: { applicationId } });
  },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
