import { describe, expect, it } from "vitest";
import { ForbiddenError, UnauthorizedError } from "../src/oauth/errors.js";
import { extractBearer } from "../src/oauth/verify.js";
import { parseScopeClaim } from "../src/scopes.js";
import { makeTestKeys, mintHsToken, mintToken } from "./helpers.js";

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
