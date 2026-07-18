/**
 * Bearer access-token validation (contract Revision 1.2 §3.2).
 *
 * The AS mints ES256 tokens and publishes a JWKS. We:
 *  - select the verification key by `kid` (handled by the injected key resolver),
 *  - verify the signature with `alg` PINNED to ES256 (reject none / HS* / others),
 *  - assert `iss`, `aud` and `exp`/`nbf`.
 *
 * The key resolver is injectable so tests can point at a stub JWKS / local key
 * without any network access. In production it is a jose remote JWKS set.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import { parseScopeClaim } from "../scopes.js";
import { TokenVerificationUnavailableError, UnauthorizedError } from "./errors.js";

/**
 * jose error codes that mean "we reached a verdict, and the verdict is: this
 * token is bad". Every one of these is caused by the token (or the key it
 * claims), so it is a genuine 401 and the caller learns nothing beyond that.
 *
 * ANYTHING NOT ON THIS LIST is treated as an infrastructure failure. That
 * direction is the safe default: a misclassified infrastructure error still
 * DENIES the request (503, no claims returned) — it just stops the server
 * lying about whose fault it was. The reverse default is the bug this list
 * exists to kill: on Node 18 `globalThis.crypto` is undefined, `jwtVerify`
 * throws a bare `ReferenceError`, and every valid token was reported as
 * "invalid or expired".
 */
const AUTH_FAILURE_CODES: ReadonlySet<string> = new Set([
  "ERR_JWT_EXPIRED", // exp in the past
  "ERR_JWT_CLAIM_VALIDATION_FAILED", // wrong iss / aud, nbf in the future
  "ERR_JWT_INVALID", // not a JWT / undecodable payload
  "ERR_JWS_INVALID", // malformed compact serialisation
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED", // bad signature
  "ERR_JWKS_NO_MATCHING_KEY", // unknown / rotated-away `kid`
  "ERR_JOSE_ALG_NOT_ALLOWED", // `alg` outside the ES256 pin (none / HS*)
  "ERR_JOSE_NOT_SUPPORTED", // token header names something unsupported
]);

function isAuthFailure(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && AUTH_FAILURE_CODES.has(code);
}

/**
 * A jose-compatible key input: a JWKS resolver, a public key, or raw key
 * material. Typed off `jwtVerify` so it tracks the installed jose version.
 */
export type KeyResolver = Parameters<typeof jwtVerify>[1];

export interface AccessClaims {
  /** Subject — the consenting user's `auth.users.id`. */
  sub: string;
  /** Granted scopes (parsed from the space-delimited `scope` claim). */
  scopes: Set<string>;
  /** The raw verified JWT payload. */
  raw: Record<string, unknown>;
}

export interface VerifierOptions {
  issuer: string;
  audience: string;
}

export class TokenVerifier {
  private readonly key: KeyResolver;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(key: KeyResolver, opts: VerifierOptions) {
    this.key = key;
    this.issuer = opts.issuer;
    this.audience = opts.audience;
  }

  /** Build a verifier backed by the AS's remote (cached, rotating) JWKS. */
  static fromJwksUri(jwksUri: string, opts: VerifierOptions): TokenVerifier {
    const jwks = createRemoteJWKSet(new URL(jwksUri));
    return new TokenVerifier(jwks, opts);
  }

  async verify(token: string): Promise<AccessClaims> {
    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(token, this.key, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["ES256"], // PIN — defeats alg-confusion (none/HS*).
      });
      payload = result.payload as Record<string, unknown>;
    } catch (err) {
      if (isAuthFailure(err)) {
        // Do not leak the underlying reason (bad sig vs expired vs wrong aud).
        // The opacity here is deliberate and unchanged.
        throw new UnauthorizedError("invalid or expired token", "invalid_token");
      }
      // NOT an authentication verdict: missing WebCrypto, a JWKS fetch/timeout,
      // or a bug in our own code. Deny the request either way, but say so
      // truthfully — and give the operator the detail the client never sees.
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      process.stderr.write(
        `[paylod-mcp] token verification FAILED FOR INFRASTRUCTURE REASONS (not a bad token): ${detail}\n`,
      );
      throw new TokenVerificationUnavailableError(err);
    }

    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) {
      throw new UnauthorizedError("invalid or expired token", "invalid_token");
    }

    return { sub, scopes: parseScopeClaim(payload.scope), raw: payload };
  }
}

/** Pull the bearer token out of an Authorization header value. */
export function extractBearer(header: string | undefined | null): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : undefined;
}
