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

/**
 * 503 — we could not REACH a verdict on the token: the JWKS could not be
 * fetched, WebCrypto is missing from the runtime, or the verifier itself threw
 * a programming error. This is not the caller's fault and it is not a statement
 * about their token, so it must never be rendered as 401 `invalid_token`.
 *
 * The `message` is deliberately generic — the operator gets the detail on
 * stderr; the unauthenticated client gets none.
 */
export class TokenVerificationUnavailableError extends Error {
  readonly status = 503 as const;

  /** @param cause the underlying failure. Kept for logs; never sent to the client. */
  constructor(cause?: unknown) {
    // Carried as the standard `Error.cause` — not serialised by our JSON writer.
    super("token verification temporarily unavailable", { cause });
    this.name = "TokenVerificationUnavailableError";
    this.cause = cause;
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
