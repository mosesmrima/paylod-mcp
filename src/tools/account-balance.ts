import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

/**
 * Backend truth: supabase/functions/provider-ops/index.ts → POST /account-balance parses
 * `baseSchema` ONLY ({ applicationId, env }). It hardcodes identifierType "4" and sends no
 * remarks. This tool used to declare `identifierType` and `remarks`; zod strips unknown keys,
 * so the backend silently DROPPED them — the agent believed it had set something it had not.
 */
export const accountBalanceInput = {
  applicationId: applicationIdField,
  env: envField,
} as const;

const schema = z.object(accountBalanceInput);

export const accountBalanceTool: ToolDef = {
  name: "get_account_balance",
  title: "Get M-Pesa account balance",
  scope: SCOPES.paymentsRead,
  description:
    "Query the merchant's M-Pesa account balance (POST /provider-ops/account-balance). ASYNCHRONOUS: " +
    "returns { queryId, conversationId } with HTTP 202; the actual balance is delivered later to the " +
    "merchant's results callback — not returned directly. The query always uses M-Pesa identifier " +
    "type '4' (Shortcode); this is fixed by the backend and not configurable. Requires the " +
    "payments.read scope and a configured initiator name + password.",
  inputSchema: accountBalanceInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/provider-ops/account-balance", { body });
  },
};
