import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { PaylodClient, type FetchLike, type PaylodClientOptions } from "../src/client.js";
import type { Config } from "../src/config.js";
import { TokenVerifier } from "../src/oauth/verify.js";

// Frozen interface-seam values (Revision 1.2), mirrored for hermetic tests.
export const TEST_ISSUER = "https://paylod.dev/oauth";
export const TEST_AUDIENCE = "https://mcp.paylod.dev/mcp";
export const TEST_JWKS_URI = "https://paylod.dev/oauth/.well-known/jwks.json";
export const TEST_KID = "test-key-1";

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface MockResponse {
  status?: number;
  ok?: boolean;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

/** Build a mock fetch that records calls and returns a canned response. */
export function mockFetch(response: MockResponse = {}): {
  fetch: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const status = response.status ?? 200;
  const ok = response.ok ?? (status >= 200 && status < 300);
  const bodyText = response.text ?? (response.json !== undefined ? JSON.stringify(response.json) : "");
  const headers = response.headers ?? {};

  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
    });
    return {
      status,
      ok,
      headers: { get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null },
      text: async () => bodyText,
    };
  };

  return { fetch, calls };
}

/**
 * Build a mock fetch that returns a DIFFERENT canned response per call, in order.
 * Needed by tools that chain calls (get_payment_status: GET /payments/:id → POST
 * /provider-ops/status). Running past the end of the sequence throws, so a test that
 * makes an unexpected extra request fails loudly instead of silently reusing a response.
 */
export function mockFetchSequence(responses: MockResponse[]): {
  fetch: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];

  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
    });
    const response = responses[calls.length - 1];
    if (!response) {
      throw new Error(`mockFetchSequence: unexpected call #${calls.length} to ${init.method} ${url}`);
    }
    const status = response.status ?? 200;
    const ok = response.ok ?? (status >= 200 && status < 300);
    const bodyText =
      response.text ?? (response.json !== undefined ? JSON.stringify(response.json) : "");
    const headers = response.headers ?? {};
    return {
      status,
      ok,
      headers: { get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null },
      text: async () => bodyText,
    };
  };

  return { fetch, calls };
}

/** A full server {@link Config} pointed at the in-test seam values. */
export function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    backendBaseUrl: "https://paylod.dev/functions/v1",
    canonicalUri: TEST_AUDIENCE,
    asIssuer: TEST_ISSUER,
    asJwksUri: TEST_JWKS_URI,
    timeoutMs: 5000,
    ...overrides,
  };
}

/** A request-scoped client with a mock/injected fetch. */
export function makeClient(
  overrides: Partial<PaylodClientOptions> = {},
  fetchImpl?: FetchLike,
): PaylodClient {
  return new PaylodClient(
    {
      backendBaseUrl: "https://paylod.dev/functions/v1",
      timeoutMs: 5000,
      token: "oauth-access-token",
      scopes: new Set<string>(),
      ...overrides,
    },
    fetchImpl,
  );
}

// --- ES256 test keypair + token minting (stub JWKS) ---

/** The jose private-key type for the installed version (CryptoKey / KeyObject). */
type SignKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

export interface TestKeys {
  privateKey: SignKey;
  publicJwk: JWK;
  /** JWKS resolver + verifier wired to this keypair. */
  verifier: TokenVerifier;
}

/** Generate an ES256 keypair and a verifier backed by its (local) JWKS. */
export async function makeTestKeys(
  opts: { issuer?: string; audience?: string } = {},
): Promise<TestKeys> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid: TEST_KID, alg: "ES256", use: "sig" };
  const jwks = createLocalJWKSet({ keys: [publicJwk] });
  const verifier = new TokenVerifier(jwks, {
    issuer: opts.issuer ?? TEST_ISSUER,
    audience: opts.audience ?? TEST_AUDIENCE,
  });
  return { privateKey, publicJwk, verifier };
}

export interface MintOpts {
  sub?: string;
  /** Space-delimited scope claim. */
  scope?: string;
  aud?: string;
  iss?: string;
  kid?: string;
  /** Seconds until expiry (negative = already expired). Default 3600. */
  expSeconds?: number;
  /** Seconds until not-before (positive = not yet valid). Default 0. */
  nbfOffset?: number;
  typ?: string;
}

/** Mint an ES256 access token with the given (default-valid) claims. */
export async function mintToken(privateKey: SignKey, opts: MintOpts = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (opts.expSeconds ?? 3600);
  const jwt = new SignJWT({ scope: opts.scope ?? "" })
    .setProtectedHeader({ alg: "ES256", kid: opts.kid ?? TEST_KID, typ: opts.typ ?? "at+jwt" })
    .setSubject(opts.sub ?? "user-uuid-123")
    .setIssuer(opts.iss ?? TEST_ISSUER)
    .setAudience(opts.aud ?? TEST_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp);
  if (opts.nbfOffset) jwt.setNotBefore(now + opts.nbfOffset);
  return jwt.sign(privateKey);
}

/** Mint an HS256 token (wrong algorithm) to prove alg-pinning rejects it. */
export async function mintHsToken(secret: Uint8Array, opts: MintOpts = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope: opts.scope ?? "" })
    .setProtectedHeader({ alg: "HS256", kid: opts.kid ?? TEST_KID })
    .setSubject(opts.sub ?? "user-uuid-123")
    .setIssuer(opts.iss ?? TEST_ISSUER)
    .setAudience(opts.aud ?? TEST_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(secret);
}
