import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField } from "./common.js";
import type { ToolDef } from "./types.js";

/**
 * Tools backed by the `/applications` edge function.
 *
 *   create_application → POST /applications                     (add an app to an EXISTING org)
 *   get_callback_url   → GET  /applications/:id/callback-url    (the Daraja callback URL)
 *
 * Both schemas mirror supabase/functions/applications/index.ts exactly.
 */

// ---- create_application ---------------------------------------------------------------

export const createApplicationInput = {
  name: z
    .string()
    .min(1)
    .max(120)
    .describe("Name for the new application. Must be unique within the organization (409 if not)."),
  organizationId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Organization to create the app in. OPTIONAL: omit it when you belong to exactly one org and " +
        "it is inferred. Required (422 otherwise) if you belong to several — get it from " +
        "list_applications, which returns organizationId on every app.",
    ),
  env: z
    .enum(["sandbox", "production"])
    .optional()
    .describe("Environment this application targets (default 'sandbox'). Chosen once, at creation."),
  product: z
    .enum(["paybill", "till"])
    .optional()
    .describe(
      "The kind of M-Pesa shortcode this app collects into (default 'paybill'). 'paybill' → Daraja " +
        "CustomerPayBillOnline; 'till' → CustomerBuyGoodsOnline (Buy Goods).",
    ),
  shortcode: z
    .string()
    .min(1)
    .max(12)
    .optional()
    .describe("Optional M-Pesa shortcode / paybill / till number to record on the app."),
} as const;

const createSchema = z.object(createApplicationInput);

export const createApplicationTool: ToolDef = {
  name: "create_application",
  title: "Create an application in an existing organization",
  scope: SCOPES.appsWrite,
  description:
    "Add a NEW application to an organization you already belong to (POST /applications). This is the " +
    "tool to use for every app after your first — create_app / POST /provision only bootstraps the very " +
    "first org+app and 409s ('already onboarded') for any existing user. " +
    "Returns { applicationId, organizationId, name, env, product, callbackUrl, callbackToken, " +
    "collectEndpoint }. The callbackUrl is minted here and ready to paste into the Safaricom Daraja " +
    "portal. No API key is minted — call mint_key for one. Next steps after this: set_credentials " +
    "(Daraja consumer key/secret/passkey), then mint_key, then configure_webhook.",
  inputSchema: createApplicationInput,
  handler: async (client, args) => {
    const body = createSchema.parse(args);
    return client.request("POST", "/applications", { body });
  },
};

// ---- get_callback_url -----------------------------------------------------------------

export const getCallbackUrlInput = {
  applicationId: applicationIdField,
  env: z
    .enum(["sandbox", "production"])
    .optional()
    .describe(
      "Which environment's callback URL to return. Defaults to the application's own env " +
        "(settings.env), else 'sandbox'. Each (application, env) pair has its OWN distinct URL.",
    ),
} as const;

const callbackSchema = z.object(getCallbackUrlInput);

export const getCallbackUrlTool: ToolDef = {
  name: "get_callback_url",
  title: "Get an application's M-Pesa callback URL",
  // apps.write, NOT a read scope: the token inside the URL is a bearer-equivalent secret — anyone
  // holding it can POST forged Daraja results at the callback route. Backend denies `viewer` too.
  scope: SCOPES.appsWrite,
  description:
    "Get the M-Pesa CALLBACK URL for an application + environment (GET /applications/:id/callback-url). " +
    "THIS IS THE URL YOU PASTE INTO THE SAFARICOM DARAJA PORTAL (and into any Daraja app that asks for a " +
    "CallbackURL / ResultURL / ValidationURL / ConfirmationURL) — the M-Pesa setup is not complete without " +
    "it. paylod hosts the receiver, so you never write callback-handling code. " +
    "Returns { applicationId, env, callbackUrl, callbackToken, collectEndpoint }. One URL per " +
    "(application, env); it is created on demand if the app does not have one yet, and is stable " +
    "afterwards. SECRET: the token in the path both routes AND authenticates inbound callbacks — treat " +
    "the URL like an API key (server-side only, never logged or shown client-side).",
  inputSchema: getCallbackUrlInput,
  handler: async (client, args) => {
    const { applicationId, env } = callbackSchema.parse(args);
    return client.request("GET", `/applications/${applicationId}/callback-url`, {
      query: env ? { env } : undefined,
    });
  },
};
