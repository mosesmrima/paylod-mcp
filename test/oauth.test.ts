import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ForbiddenError,
  TokenVerificationUnavailableError,
  UnauthorizedError,
} from "../src/oauth/errors.js";
import { extractBearer, TokenVerifier } from "../src/oauth/verify.js";
import { parseScopeClaim } from "../src/scopes.js";
import {
  makeTestKeys,
  mintHsToken,
  mintToken,
  TEST_AUDIENCE,
  TEST_ISSUER,
} from "./helpers.js";

describe("extractBearer", () => {
  it("pulls the token from an Authorization header", () => {
    expect(extractBearer("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(extractBearer("bearer   spaced")).toBe("spaced");
  });
  it("returns undefined for missing / non-bearer headers", () => {
    expect(extractBearer(undefined)).toBeUndefined();
    expect(extractBearer("")).toBeUndefined();
    expect(extractBearer("Basic Zm9v")).toBeUndefined();
    expect(extractBearer("Bearer ")).toBeUndefined();
  });
});

describe("parseScopeClaim", () => {
  it("splits a space-delimited scope claim", () => {
    const s = parseScopeClaim("paylod:payments.read paylod:apps.write");
    expect(s.has("paylod:payments.read")).toBe(true);
    expect(s.has("paylod:apps.write")).toBe(true);
    expect(s.size).toBe(2);
  });
  it("treats non-strings as empty", () => {
    expect(parseScopeClaim(undefined).size).toBe(0);
    expect(parseScopeClaim(123).size).toBe(0);
  });
});

describe("TokenVerifier (ES256, stub JWKS)", () => {
  it("accepts a valid ES256 token and extracts sub + scopes", async () => {
    const { privateKey, verifier } = await makeTestKeys();
    const token = await mintToken(privateKey, {
      sub: "user-9",
      scope: "paylod:payments.read paylod:payments.collect",
    });
    const claims = await verifier.verify(token);
    expect(claims.sub).toBe("user-9");
    expect(claims.scopes.has("paylod:payments.read")).toBe(true);
    expect(claims.scopes.has("paylod:payments.collect")).toBe(true);
  });

  it("rejects a token signed with the wrong algorithm (HS256)", async () => {
    const { verifier } = await makeTestKeys();
    const hs = await mintHsToken(new TextEncoder().encode("shared-secret-shared-secret-32b!"));
    await expect(verifier.verify(hs)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a wrong audience", async () => {
    const { privateKey, verifier } = await makeTestKeys();
    const token = await mintToken(privateKey, { aud: "https://evil.example/mcp" });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a wrong issuer", async () => {
    const { privateKey, verifier } = await makeTestKeys();
    const token = await mintToken(privateKey, { iss: "https://evil.example/oauth" });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects an expired token", async () => {
    const { privateKey, verifier } = await makeTestKeys();
    const token = await mintToken(privateKey, { expSeconds: -60 });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a not-yet-valid token (nbf in the future)", async () => {
    const { privateKey, verifier } = await makeTestKeys();
    const token = await mintToken(privateKey, { nbfOffset: 3600 });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a token signed by a different (unknown) key", async () => {
    const a = await makeTestKeys();
    const b = await makeTestKeys();
    // Signed by b's key, verified against a's JWKS.
    const token = await mintToken(b.privateKey);
    await expect(a.verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("tags UnauthorizedError from a bad token with invalid_token", async () => {
    const { privateKey, verifier } = await makeTestKeys();
    const token = await mintToken(privateKey, { aud: "https://evil.example/mcp" });
    await verifier.verify(token).catch((err) => {
      expect(err).toBeInstanceOf(UnauthorizedError);
      expect((err as UnauthorizedError).oauthError).toBe("invalid_token");
    });
    expect.assertions(2);
  });
});

describe("auth error shapes", () => {
  it("UnauthorizedError without a code is a missing-token 401", () => {
    const e = new UnauthorizedError("missing bearer token");
    expect(e.status).toBe(401);
    expect(e.oauthError).toBeUndefined();
  });
  it("ForbiddenError carries the required scope", () => {
    const e = new ForbiddenError("paylod:payments.payout");
    expect(e.status).toBe(403);
    expect(e.oauthError).toBe("insufficient_scope");
    expect(e.requiredScope).toBe("paylod:payments.payout");
  });
});

/**
 * Infrastructure failures must NOT masquerade as bad tokens.
 *
 * The regression: on Node 18 `globalThis.crypto` is undefined, so `jwtVerify`
 * throws `ReferenceError: crypto is not defined`. The old bare `catch {}` turned
 * that into `401 invalid or expired token`, so the server silently rejected every
 * VALID token while blaming the caller. These tests pin the distinction.
 */
describe("TokenVerifier — infrastructure vs authentication failures", () => {
  const opts = { issuer: TEST_ISSUER, audience: TEST_AUDIENCE };

  /**
   * A well-formed, correctly-signed token. It must be structurally valid, or jose
   * rejects it during parsing and never reaches the key resolver we are breaking —
   * which is itself the right 401 (see the opaque-401 test above).
   */
  async function goodToken(): Promise<string> {
    const { privateKey } = await makeTestKeys();
    return mintToken(privateKey, { sub: "user-1" });
  }

  afterEach(() => vi.restoreAllMocks());

  /** Silence the operator-facing stderr line these tests deliberately trigger. */
  function hushStderr() {
    return vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  }

  it("a genuinely invalid token is still an opaque 401 (boundary unchanged)", async () => {
    const { verifier } = await makeTestKeys();
    await expect(verifier.verify("not-a-jwt-at-all")).rejects.toBeInstanceOf(UnauthorizedError);
    await verifier.verify("not-a-jwt-at-all").catch((err) => {
      // Opaque: the same message for malformed as for expired or wrong-audience.
      expect((err as UnauthorizedError).message).toBe("invalid or expired token");
      expect((err as UnauthorizedError).status).toBe(401);
    });
  });

  it("a missing/broken WebCrypto is NOT reported as an invalid token", async () => {
    const stderr = hushStderr();
    // Stands in for Node 18's absent `globalThis.crypto`: jose throws a bare ReferenceError.
    const verifier = new TokenVerifier(() => {
      throw new ReferenceError("crypto is not defined");
    }, opts);

    const err = await verifier.verify(await goodToken()).catch((e) => e);
    expect(err).not.toBeInstanceOf(UnauthorizedError);
    expect(err).toBeInstanceOf(TokenVerificationUnavailableError);
    expect(err.message).not.toContain("invalid or expired token");
    expect(err.status).toBe(503);
    expect(err.cause).toBeInstanceOf(ReferenceError);
    // The operator gets the real reason on stderr; the client never does.
    expect(stderr.mock.calls.map((c) => String(c[0])).join("")).toContain("crypto is not defined");
  });

  it("a JWKS fetch failure is a 503, not a 401", async () => {
    hushStderr();
    const verifier = new TokenVerifier(
      () => Promise.reject(new TypeError("fetch failed")),
      opts,
    );
    const err = await verifier.verify(await goodToken()).catch((e) => e);
    expect(err).toBeInstanceOf(TokenVerificationUnavailableError);
    expect(err.status).toBe(503);
  });

  it("a programming error in the key resolver surfaces as infrastructure", async () => {
    hushStderr();
    const verifier = new TokenVerifier(() => {
      throw new TypeError("undefined is not a function");
    }, opts);
    await expect(verifier.verify(await goodToken())).rejects.toBeInstanceOf(
      TokenVerificationUnavailableError,
    );
  });

  it("TokenVerificationUnavailableError never echoes the cause to the client", () => {
    const e = new TokenVerificationUnavailableError(new Error("jwks.example.com ECONNREFUSED"));
    expect(e.message).toBe("token verification temporarily unavailable");
    expect(e.message).not.toContain("ECONNREFUSED");
  });
});
