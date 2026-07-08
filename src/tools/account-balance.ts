import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

export const accountBalanceInput = {
  applicationId: applicationIdField,
  env: envField,
  identifierType: z
    .enum(["1", "2", "4"])
    .optional()
    .describe("M-Pesa identifier type: '1' MSISDN, '2' Till, '4' Shortcode (default '4')."),
  remarks: z.string().optional().describe("Optional remarks attached to the balance query."),
} as const;

const schema = z.object(accountBalanceInput);

export const accountBalanceTool: ToolDef = {
  name: "get_account_balance",
  title: "Get M-Pesa account balance",
  scope: SCOPES.paymentsRead,
  description:
    "Query the merchant's M-Pesa account balance (POST /provider-ops/account-balance). ASYNCHRONOUS: " +
    "returns { queryId, conversationId } with HTTP 202; the actual balance is delivered later to the " +
    "merchant's results callback — not returned directly. Requires the payments.read scope and a " +
    "configured initiator name + password.",
  inputSchema: accountBalanceInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/provider-ops/account-balance", { body });
  },
};
