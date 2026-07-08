/**
 * RFC 9728 Protected-Resource-Metadata document (contract §5), served at
 * `GET /.well-known/oauth-protected-resource`.
 */

import { SCOPES_SUPPORTED } from "../scopes.js";
import type { Config } from "../config.js";

export const PRM_PATH = "/.well-known/oauth-protected-resource";

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_name: string;
  resource_documentation: string;
}

/** Build the PRM document. The `resource` and AS are taken from config. */
export function buildPrm(config: Config): ProtectedResourceMetadata {
  return {
    resource: config.canonicalUri,
    authorization_servers: [config.asIssuer],
    scopes_supported: [...SCOPES_SUPPORTED],
    bearer_methods_supported: ["header"],
    resource_name: "paylod MCP",
    resource_documentation: "https://paylod.dev/docs/mcp",
  };
}
