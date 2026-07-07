import { z } from "zod";
import type { ToolDef } from "./types.js";

export const accountBalanceInput = {
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
  category: "read",
  description:
    "Query the merchant's M-Pesa account balance (POST paylod /account-balance). This is ASYNCHRONOUS: " +
    "it returns { queryId, conversationId } with HTTP 202, and the actual balance is delivered later to " +
    "the merchant's results callback — this tool does not return the balance value directly. Requires " +
    "the merchant to have configured an initiator name + password in paylod.",
  inputSchema: accountBalanceInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/account-balance", { body });
  },
};
