import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

export const transactionStatusInput = {
  applicationId: applicationIdField,
  env: envField,
  transactionId: z
    .string()
    .min(1)
    .describe("The M-Pesa transaction ID (receipt) to query the status of."),
  identifierType: z
    .enum(["1", "2", "4"])
    .optional()
    .describe("M-Pesa identifier type: '1' MSISDN, '2' Till, '4' Shortcode (default '4')."),
  remarks: z.string().optional().describe("Optional remarks."),
  occasion: z.string().optional().describe("Optional occasion note."),
} as const;

const schema = z.object(transactionStatusInput);

export const transactionStatusTool: ToolDef = {
  name: "get_transaction_status",
  title: "Get M-Pesa transaction status",
  scope: SCOPES.paymentsRead,
  description:
    "Query the status of an M-Pesa transaction by its transaction ID (POST /provider-ops/transaction-status). " +
    "ASYNCHRONOUS: returns { queryId, conversationId } with HTTP 202; the resolved status is delivered to the " +
    "merchant's results callback. For a collection you initiated via this server, prefer get_payment_status. " +
    "Requires the payments.read scope.",
  inputSchema: transactionStatusInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/provider-ops/transaction-status", { body });
  },
};
