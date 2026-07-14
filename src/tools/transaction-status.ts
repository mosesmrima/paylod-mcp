import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

/**
 * Backend truth: provider-ops POST /transaction-status accepts ONLY
 * { applicationId, env, transactionId (1–64) }. identifierType is hardcoded "4"; remarks and
 * occasion are not modelled at all. Declaring them here made the backend silently drop them.
 */
export const transactionStatusInput = {
  applicationId: applicationIdField,
  env: envField,
  transactionId: z
    .string()
    .min(1)
    .max(64)
    .describe("The M-Pesa transaction ID (receipt) to query the status of (1–64 chars)."),
} as const;

const schema = z.object(transactionStatusInput);

export const transactionStatusTool: ToolDef = {
  name: "get_transaction_status",
  title: "Get M-Pesa transaction status",
  scope: SCOPES.paymentsRead,
  description:
    "Query the status of an M-Pesa transaction by its transaction ID (POST /provider-ops/transaction-status). " +
    "ASYNCHRONOUS: returns { queryId, conversationId } with HTTP 202; the resolved status is delivered to the " +
    "merchant's results callback. The query always uses M-Pesa identifier type '4' (Shortcode) — fixed " +
    "by the backend. For a collection you initiated via this server, prefer get_payment_status. " +
    "Requires the payments.read scope.",
  inputSchema: transactionStatusInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/provider-ops/transaction-status", { body });
  },
};
