import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

/**
 * Mirrors `saveSchema` in supabase/functions/save-credentials/index.ts EXACTLY, including its
 * superRefine: for `product: "till"`, partyB is REQUIRED and must DIFFER from shortcode (Daraja
 * rejects an equal pair with error 2002). The `product` enum is paybill|till — the same backend
 * truth as /provision, NOT the Daraja API name (stk/c2b/b2c/qr), which this tool used to send.
 */
export const setCredentialsInput = {
  applicationId: applicationIdField,
  env: envField,
  product: z
    .enum(["paybill", "till"])
    .describe(
      "The kind of M-Pesa shortcode these credentials belong to: 'paybill' (Daraja " +
        "CustomerPayBillOnline) or 'till' (CustomerBuyGoodsOnline / Buy Goods). This is NOT the API " +
        "you call — STK push, C2B, B2C and QR all work on either.",
    ),
  consumerKey: z.string().min(1).describe("Daraja consumer key."),
  consumerSecret: z.string().min(1).describe("Daraja consumer secret."),
  passkey: z.string().min(1).describe("Daraja Lipa-na-M-Pesa passkey."),
  shortcode: z
    .string()
    .min(1)
    .max(12)
    .describe("M-Pesa Business Shortcode (the store number for a Till, or the paybill number)."),
  partyB: z
    .string()
    .min(1)
    .max(12)
    .optional()
    .describe(
      "The Till number that receives funds. REQUIRED when product is 'till', and it must DIFFER " +
        "from shortcode (Daraja rejects an identical pair with error 2002). Omit for 'paybill'.",
    ),
} as const;

const schema = z.object(setCredentialsInput);

export const setCredentialsTool: ToolDef = {
  name: "set_credentials",
  title: "Set / rotate Daraja credentials",
  scope: SCOPES.credentialsWrite,
  description:
    "Store or rotate the Daraja (Safaricom) credentials for an application + environment (POST " +
    "/save-credentials). Returns a MASKED summary — the secrets are encrypted at rest and never echoed. " +
    "`product` is the shortcode KIND ('paybill' or 'till'), not the Daraja API; for 'till' you must " +
    "also pass partyB (different from shortcode). Also ensures the application has a callback token for " +
    "that env — read the resulting URL with get_callback_url. " +
    "HIGH-RISK: this writes the keys used to move money. Requires the credentials.write scope.",
  inputSchema: setCredentialsInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/save-credentials", { body });
  },
};
