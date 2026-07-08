/**
 * `WWW-Authenticate: Bearer ...` header construction (contract §3.2 / §3.4).
 */

import type { Config } from "../config.js";
import { PRM_PATH } from "./prm.js";

/** Absolute URL of the PRM document, from the canonical resource origin. */
export function prmUrl(config: Config): string {
  // canonicalUri is e.g. https://mcp.paylod.dev/mcp — the PRM lives at its origin.
  const origin = new URL(config.canonicalUri).origin;
  return `${origin}${PRM_PATH}`;
}

/**
 * Challenge for a MISSING bearer: point the client at the PRM so it can
 * discover the authorization server and begin the OAuth flow.
 */
export function challengeMissing(config: Config): string {
  return `Bearer resource_metadata="${prmUrl(config)}"`;
}

/** Challenge for an INVALID/expired token. */
export function challengeInvalid(): string {
  return `Bearer error="invalid_token", error_description="invalid or expired token"`;
}

/** Challenge for a valid token that lacks the required scope. */
export function challengeInsufficientScope(requiredScope: string): string {
  return `Bearer error="insufficient_scope", scope="${requiredScope}"`;
}
