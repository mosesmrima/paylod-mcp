import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

export const reversalInput = {
  applicationId: applicationIdField,
  env: envField,
  transactionId: z
    .string()
    .min(1)
    .max(64)
    .describe("The M-Pesa transaction ID (receipt) to reverse."),
  amount: z
    .number()
    .int("Amount must be a whole number of KES")
    .positive()
    .max(150000)
    .describe("Amount to reverse in KES."),
  remarks: z.string().max(100).optional().describe("Optional remarks (≤100 chars)."),
  occasion: z.string().max(100).optional().describe("Optional occasion note (≤100 chars)."),
} as const;

const schema = z.object(reversalInput);

export const reversalTool: ToolDef = {
  name: "reversal",
  title: "Reverse / refund a transaction",
  scope: SCOPES.paymentsPayout,
  description:
    "Reverse (refund) a completed M-Pesa transaction (POST /provider-ops/reversal). Returns " +
    "{ disbursementId, conversationId, status: 'pending' } (HTTP 202); the final result arrives on the " +
    "merchant's results callback. HIGH-RISK money-out — shares the payments.payout scope. An env " +
    "'sandbox' call runs in the simulator.",
  inputSchema: reversalInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/provider-ops/reversal", { body });
  },
};
