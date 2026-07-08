/**
 * OAuth scope catalog (contract §2.1). These strings are a FROZEN interface
 * seam — they must match the AS `scopes_supported` and the backend enforcement
 * exactly. Do not rename.
 */

export const SCOPES = {
  paymentsCollect: "paylod:payments.collect",
  paymentsRead: "paylod:payments.read",
  paymentsPayout: "paylod:payments.payout",
  paymentsSimulate: "paylod:payments.simulate",
  appsWrite: "paylod:apps.write",
  credentialsWrite: "paylod:credentials.write",
  keysMint: "paylod:keys.mint",
  webhooksWrite: "paylod:webhooks.write",
  teamRead: "paylod:team.read",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

/** The nine supported scopes, in the exact order the PRM document advertises. */
export const SCOPES_SUPPORTED: readonly Scope[] = [
  SCOPES.paymentsCollect,
  SCOPES.paymentsRead,
  SCOPES.paymentsPayout,
  SCOPES.paymentsSimulate,
  SCOPES.appsWrite,
  SCOPES.credentialsWrite,
  SCOPES.keysMint,
  SCOPES.webhooksWrite,
  SCOPES.teamRead,
];

/** Parse a space-delimited `scope` claim into a set (RFC 8693 / OAuth 2.1). */
export function parseScopeClaim(scope: unknown): Set<string> {
  if (typeof scope !== "string") return new Set();
  return new Set(scope.split(/\s+/).filter((s) => s.length > 0));
}
