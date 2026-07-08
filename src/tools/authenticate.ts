import type { ToolDef } from "./types.js";

/**
 * `authenticate` — reflects the current OAuth session.
 *
 * The actual OAuth 2.1 + PKCE login/consent is driven by the MCP CLIENT (it
 * discovers the AS via the PRM document on the first 401 and obtains a token).
 * By the time a tool handler runs, the resource server has already validated a
 * bearer, so this tool simply reports that the caller is authenticated and which
 * scopes were granted — letting an agent introspect what it may do.
 */
export const authenticateTool: ToolDef = {
  name: "authenticate",
  title: "Authenticate / show granted scopes",
  // No scope: any valid token may introspect its own grant.
  description:
    "Confirm you are authenticated with paylod and list the scopes your access token was granted. " +
    "The OAuth login + consent itself is handled by your MCP client (it discovers the authorization " +
    "server from this server's protected-resource metadata on the first 401). Call this to check which " +
    "capabilities (collect, payout, apps.write, …) you currently hold before attempting an action.",
  inputSchema: {},
  handler: async (client) => {
    return { authenticated: true, scopesGranted: client.grantedScopes() };
  },
};
