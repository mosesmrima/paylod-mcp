import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField } from "./common.js";
import type { ToolDef } from "./types.js";

export const mintKeyInput = {
  applicationId: applicationIdField,
  env: z
    .enum(["sandbox", "production"])
    .optional()
    .describe("Environment for the new key (default 'sandbox'). 'production' mints a live mp_live_ key."),
  name: z.string().max(80).optional().describe("Optional human label for the key (≤80 chars)."),
} as const;

const schema = z.object(mintKeyInput);

export const mintKeyTool: ToolDef = {
  name: "mint_key",
  title: "Mint a paylod API key",
  scope: SCOPES.keysMint,
  description:
    "Mint a NEW paylod merchant API key for an application (POST /mint-key), returning " +
    "{ apiKey, prefix, env }. The plaintext apiKey is shown ONCE — store it securely; it can never be " +
    "read back (list_keys returns prefixes only). HIGH-RISK: requires the keys.mint scope. Use this to " +
    "hand a long-lived REST key to a non-agent integration; the MCP server itself never uses API keys. " +
    "`env` defaults to 'sandbox' — you must ask for 'production' explicitly, because a production key " +
    "moves real money. Minted a key you no longer need (a demo, a test)? Call list_keys to find its " +
    "apiKeyId and revoke_key to kill it.",
  inputSchema: mintKeyInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/mint-key", { body });
  },
};
