import { z } from "zod";
import type { ToolDef } from "./types.js";

export const mintKeyInput = {
  applicationId: z
    .string()
    .uuid()
    .describe("The paylod application UUID to mint a key for."),
  env: z
    .enum(["sandbox", "production"])
    .optional()
    .describe("Environment for the new key (default 'sandbox'). 'production' mints a live mp_live_ key."),
  name: z.string().max(80).optional().describe("Optional human label for the key (≤80 chars)."),
} as const;

const schema = z.object(mintKeyInput);

export const mintKeyTool: ToolDef = {
  name: "mint_api_key",
  title: "Mint a paylod API key",
  category: "mint",
  description:
    "Mint a NEW paylod merchant API key for an application (POST paylod /mint-key), returning " +
    "{ apiKey, prefix, env }. The plaintext apiKey is shown ONCE — store it securely. ELEVATED and " +
    "sensitive: off by default, enable only with --tools=mint_api_key. " +
    "IMPORTANT AUTH NOTE: paylod's /mint-key is authenticated by a dashboard SESSION JWT + org " +
    "membership, NOT by a merchant API key. This tool therefore needs PAYLOD_SESSION_TOKEN " +
    "(--session-token) set to a valid Supabase user access token; without it the call returns 401.",
  inputSchema: mintKeyInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/mint-key", { body, useSessionToken: true });
  },
};
