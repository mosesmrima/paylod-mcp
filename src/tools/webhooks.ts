import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField } from "./common.js";
import type { ToolDef } from "./types.js";

export const configureWebhookInput = {
  applicationId: applicationIdField,
  url: z
    .string()
    .url()
    .describe("HTTPS URL paylod should POST webhook events to (SSRF-validated by the backend)."),
  active: z.boolean().optional().describe("Whether the endpoint is active (default true)."),
  webhookEndpointId: z
    .string()
    .uuid()
    .optional()
    .describe("Provide an existing endpoint id to UPDATE it (PATCH); omit to create a new one (POST)."),
  rollSecret: z
    .boolean()
    .optional()
    .describe("If true, (re)generate the signing secret and return it once (POST /webhook-secret)."),
} as const;

const configureSchema = z.object(configureWebhookInput);

export const configureWebhookTool: ToolDef = {
  name: "configure_webhook",
  title: "Create or update a webhook endpoint",
  scope: SCOPES.webhooksWrite,
  description:
    "Create a new webhook endpoint or update an existing one for an application. Omit webhookEndpointId " +
    "to CREATE (POST /webhook-endpoints); pass it to UPDATE url/active (PATCH /webhook-endpoints/:id). " +
    "Set rollSecret:true to (re)generate the HMAC signing secret (POST /webhook-secret) — the secret is " +
    "returned ONCE. Returns { webhookEndpointId, url, active, signingSecret? }. The target URL is " +
    "SSRF-validated by the backend.",
  inputSchema: configureWebhookInput,
  handler: async (client, args) => {
    const input = configureSchema.parse(args);
    const { applicationId, url, active, webhookEndpointId, rollSecret } = input;

    const endpoint = webhookEndpointId
      ? await client.request("PATCH", `/webhook-endpoints/${encodeURIComponent(webhookEndpointId)}`, {
          body: { url, ...(active !== undefined ? { active } : {}) },
        })
      : await client.request("POST", "/webhook-endpoints", {
          body: { applicationId, url, ...(active !== undefined ? { active } : {}) },
        });

    if (!rollSecret) return endpoint;

    const targetId =
      webhookEndpointId ??
      (isRecord(endpoint) && typeof endpoint.webhookEndpointId === "string"
        ? endpoint.webhookEndpointId
        : undefined);

    const secret = await client.request("POST", "/webhook-secret", {
      body: { applicationId, ...(targetId ? { webhookEndpointId: targetId } : {}) },
    });

    return { ...(isRecord(endpoint) ? endpoint : {}), ...(isRecord(secret) ? secret : {}) };
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
    "{ endpoints: [{ webhookEndpointId, url, active, hasSigningSecret, createdAt }] }. Signing secrets are " +
    "NEVER returned — only whether one is set.",
  inputSchema: listWebhooksInput,
  handler: async (client, args) => {
    const { applicationId } = listSchema.parse(args);
    return client.request("GET", "/webhook-endpoints", { query: { applicationId } });
  },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
