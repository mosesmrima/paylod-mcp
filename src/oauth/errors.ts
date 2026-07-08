/**
 * Auth-layer errors carrying the HTTP status + `WWW-Authenticate` semantics of
 * contract §3.4. These are thrown during bearer validation / scope enforcement
 * and rendered by the HTTP layer.
 */

/** 401 — no bearer, or a bearer that fails signature / iss / aud / exp checks. */
export class UnauthorizedError extends Error {
  readonly status = 401 as const;
  /** OAuth error code, e.g. `invalid_token`. Omitted for a missing token. */
  readonly oauthError?: string;

  constructor(message: string, oauthError?: string) {
    super(message);
    this.name = "UnauthorizedError";
    if (oauthError) this.oauthError = oauthError;
  }
}

/** 403 — valid token but the granted scopes do not include the required one. */
export class ForbiddenError extends Error {
  readonly status = 403 as const;
  readonly oauthError = "insufficient_scope" as const;
  readonly requiredScope: string;

  constructor(requiredScope: string) {
    super(`insufficient scope: ${requiredScope}`);
    this.name = "ForbiddenError";
    this.requiredScope = requiredScope;
  }
}
