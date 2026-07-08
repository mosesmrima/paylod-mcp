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
import { UnauthorizedError } from "./errors.js";

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
    } catch {
      // Do not leak the underlying reason (bad sig vs expired vs wrong aud).
      throw new UnauthorizedError("invalid or expired token", "invalid_token");
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
