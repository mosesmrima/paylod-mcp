import { z } from "zod";
import { SCOPES } from "../scopes.js";
import type { ToolDef } from "./types.js";

/**
 * Credentials accepted by POST /provision. Mirrors `credentialsSchema` in
 * supabase/functions/provision/index.ts EXACTLY — the old loose `record()` let this
 * tool ship shapes the backend rejects, the same class of drift as the product enum.
 */
const credentialsField = z
  .object({
    consumerKey: z.string().min(1),
    consumerSecret: z.string().min(1),
    passkey: z.string().min(1),
    shortcode: z.string().min(1),
    partyB: z.string().min(1).optional(),
  })
  .describe(
    "Optional Daraja credentials to seed at creation. consumerKey, consumerSecret, passkey and " +
      "shortcode are required together; partyB is the Buy Goods / Till party that receives funds. " +
      "Omit entirely and add them later with set_credentials.",
  );

export const createAppInput = {
  organizationName: z
    .string()
    .min(1)
    .max(120)
    .describe("Name of the organization to create (this call bootstraps org + first app)."),
  applicationName: z.string().min(1).max(120).describe("Name of the first application to create."),
  // Backend truth: provision/index.ts → `product: z.enum(["paybill", "till"]).default("paybill")`,
  // mapped to the Daraja tx type (paybill → CustomerPayBillOnline, till → CustomerBuyGoodsOnline).
  product: z
    .enum(["paybill", "till"])
    .optional()
    .describe(
      "The kind of M-Pesa shortcode this app collects into (default 'paybill'). 'paybill' → Daraja " +
        "CustomerPayBillOnline; 'till' → CustomerBuyGoodsOnline (Buy Goods). This is NOT the API you " +
        "call — STK push, C2B, B2C and QR all work on either.",
    ),
  env: z
    .enum(["sandbox", "production"])
    .optional()
    .describe("Environment to provision (default 'sandbox')."),
  shortcode: z
    .string()
    .min(1)
    .max(12)
    .optional()
    .describe("Optional M-Pesa shortcode / paybill / till number."),
  credentials: credentialsField.optional(),
} as const;

const schema = z.object(createAppInput);

export const createAppTool: ToolDef = {
  name: "create_app",
  title: "Onboard: create organization + first application",
  scope: SCOPES.appsWrite,
  description:
    "FIRST-TIME ONBOARDING ONLY (POST /provision): create a brand-new paylod organization and its " +
    "first application. The org is derived from your identity — this tool takes no applicationId. " +
    "Returns { organizationId, applicationId, env, collectEndpoint, callbackUrl, callbackToken, apiKey }; " +
    "the apiKey is shown ONCE, so store it securely. " +
    "IMPORTANT — this is a one-shot bootstrap: if you ALREADY own an organization it fails with 409 " +
    "'already onboarded' (returning your existing organizationId) and creates nothing. To add another " +
    "application to an organization you already have, use create_application instead. If unsure, call " +
    "list_applications first — any result at all means you are already onboarded.",
  inputSchema: createAppInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/provision", { body });
  },
};
