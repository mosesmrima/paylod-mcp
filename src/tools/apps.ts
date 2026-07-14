import { SCOPES } from "../scopes.js";
import type { ToolDef } from "./types.js";

export const listApplicationsTool: ToolDef = {
  name: "list_applications",
  title: "List your paylod applications",
  scope: SCOPES.teamRead,
  description:
    "List the paylod applications you can access (GET /apps), returning " +
    "{ applications: [{ applicationId, name, provider, env, organizationId }] }, where `env` is a HINT " +
    "derived from which credentials exist ('production' if any are configured, else 'sandbox') — every " +
    "other tool still takes an explicit env. Call this FIRST to discover " +
    "the applicationId you must pass to every other tenant tool (create_app, set_credentials, " +
    "request_stk_push, …). A user may belong to multiple organizations; this returns apps across all of " +
    "them.",
  inputSchema: {},
  handler: async (client) => {
    return client.request("GET", "/apps");
  },
};
