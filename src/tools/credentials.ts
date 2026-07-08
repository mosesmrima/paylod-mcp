import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

export const setCredentialsInput = {
  applicationId: applicationIdField,
  env: envField,
  product: z
    .enum(["stk", "c2b", "b2c", "qr"])
    .describe("Which Daraja product these credentials are for."),
  consumerKey: z.string().min(1).describe("Daraja consumer key."),
  consumerSecret: z.string().min(1).describe("Daraja consumer secret."),
  passkey: z.string().min(1).describe("Daraja Lipa-na-M-Pesa passkey."),
  shortcode: z.string().min(1).max(12).describe("M-Pesa shortcode / paybill / till."),
  partyB: z.string().min(1).max(12).optional().describe("Optional Party B shortcode (for B2C, etc.)."),
} as const;

const schema = z.object(setCredentialsInput);

export const setCredentialsTool: ToolDef = {
  name: "set_credentials",
  title: "Set / rotate Daraja credentials",
  scope: SCOPES.credentialsWrite,
  description:
    "Store or rotate the Daraja (Safaricom) credentials for an application + environment (POST " +
    "/save-credentials). Returns a MASKED summary — the secrets are encrypted at rest and never echoed. " +
    "HIGH-RISK: this writes the keys used to move money. Requires the credentials.write scope.",
  inputSchema: setCredentialsInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/save-credentials", { body });
  },
};
