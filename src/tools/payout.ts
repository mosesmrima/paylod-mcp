import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

const phoneSchema = z
  .string()
  .min(1)
  .describe("Recipient Safaricom number (paylod normalizes it), e.g. 254712345678.");

export const payoutInput = {
  applicationId: applicationIdField,
  env: envField,
  amount: z
    .number()
    .int("Amount must be a whole number of KES")
    .positive()
    .max(150000)
    .describe("Amount to disburse in KES (1–150000)."),
  phone: phoneSchema,
  commandId: z
    .enum(["SalaryPayment", "BusinessPayment", "PromotionPayment"])
    .optional()
    .describe("B2C command type (default 'BusinessPayment')."),
  remarks: z.string().max(100).optional().describe("Optional remarks (≤100 chars)."),
  occasion: z.string().max(100).optional().describe("Optional occasion note (≤100 chars)."),
} as const;

const schema = z.object(payoutInput);

export const payoutTool: ToolDef = {
  name: "payout",
  title: "Send money (B2C payout)",
  scope: SCOPES.paymentsPayout,
  description:
    "Disburse money from the merchant to a customer via M-Pesa B2C (POST /provider-ops/payout). Returns " +
    "{ disbursementId, conversationId, status: 'pending' } (HTTP 202); the final result arrives on the " +
    "merchant's results callback. HIGH-RISK money-out — requires the payments.payout scope. With env " +
    "'production' this is real and irreversible.",
  inputSchema: payoutInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/provider-ops/payout", { body });
  },
};
