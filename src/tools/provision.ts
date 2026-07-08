import { z } from "zod";
import { SCOPES } from "../scopes.js";
import type { ToolDef } from "./types.js";

export const createAppInput = {
  organizationName: z
    .string()
    .min(1)
    .max(120)
    .describe("Name of the organization to create (this call bootstraps org + first app)."),
  applicationName: z.string().min(1).max(120).describe("Name of the first application to create."),
  product: z
    .enum(["stk", "c2b", "b2c", "qr"])
    .optional()
    .describe("Primary product for the app (default 'stk')."),
  env: z
    .enum(["sandbox", "production"])
    .optional()
    .describe("Environment to provision (default 'sandbox')."),
  shortcode: z.string().min(1).max(12).optional().describe("Optional M-Pesa shortcode / paybill / till."),
  credentials: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional Daraja credentials to seed at creation (consumerKey, consumerSecret, passkey, …)."),
} as const;

const schema = z.object(createAppInput);

export const createAppTool: ToolDef = {
  name: "create_app",
  title: "Create organization + first application",
  scope: SCOPES.appsWrite,
  description:
    "Create a new paylod organization and its first application (POST /provision). The org is derived " +
    "from your identity — this is the ONE tenant tool that does not take an applicationId. Returns " +
    "{ organizationId, applicationId, env, collectEndpoint, callbackUrl, callbackToken, apiKey }. Store " +
    "the apiKey securely; it is shown once.",
  inputSchema: createAppInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/provision", { body });
  },
};
