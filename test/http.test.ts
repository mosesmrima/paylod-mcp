import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/http/server.js";
import { TokenVerifier } from "../src/oauth/verify.js";
import { buildPrm } from "../src/http/prm.js";
import { SCOPES } from "../src/scopes.js";
import { makeConfig, makeTestKeys, mintToken, mockFetch, type TestKeys } from "./helpers.js";

let server: Server;
let base: string;
let keys: TestKeys;

const config = makeConfig();

beforeAll(async () => {
  keys = await makeTestKeys();
  // Backend calls are stubbed so a fully-authorized tools/call can succeed.
  const { fetch } = mockFetch({ json: { ok: true } });
  server = createServer(config, { verifier: keys.verifier, fetchImpl: fetch });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function toolCall(name: string, args: Record<string, unknown> = {}) {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
}

const MCP_HEADERS = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };

describe("GET /.well-known/oauth-protected-resource", () => {
  it("serves the exact PRM document (contract §5) with no auth", async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual(buildPrm(config));
    // Spot-check the frozen seams.
    expect(body.resource).toBe("https://mcp.paylod.dev/mcp");
    expect(body.authorization_servers).toEqual(["https://paylod.dev/oauth"]);
    expect(body.bearer_methods_supported).toEqual(["header"]);
    expect(body.scopes_supported).toHaveLength(9);
  });
});

describe("POST /mcp bearer validation", () => {
  it("401s with a resource_metadata challenge when the bearer is missing", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: toolCall("list_applications"),
    });
    expect(res.status).toBe(401);
    const wa = res.headers.get("www-authenticate")!;
    expect(wa).toContain("Bearer");
    expect(wa).toContain('resource_metadata="https://mcp.paylod.dev/.well-known/oauth-protected-resource"');
    expect(((await res.json()) as { error: string }).error).toMatch(/missing bearer/i);
  });

  it("401s with error=invalid_token for a bad token", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: "Bearer not.a.jwt" },
      body: toolCall("list_applications"),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("401s for a valid signature but wrong audience", async () => {
    const token = await mintToken(keys.privateKey, { aud: "https://evil.example/mcp" });
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: `Bearer ${token}` },
      body: toolCall("list_applications"),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });
});

/**
 * A JWKS outage or a broken runtime must not be billed to the caller as a bad
 * token. It gets 503 + Retry-After and NO WWW-Authenticate challenge — there is
 * nothing for the client to re-authenticate with.
 */
describe("POST /mcp when token verification is unavailable", () => {
  let broken: Server;
  let brokenBase: string;

  beforeAll(async () => {
    // Stands in for Node 18's missing `globalThis.crypto`.
    const verifier = new TokenVerifier(() => {
      throw new ReferenceError("crypto is not defined");
    }, { issuer: "https://paylod.dev/oauth", audience: "https://mcp.paylod.dev/mcp" });
    const { fetch: f } = mockFetch({ json: { ok: true } });
    broken = createServer(config, { verifier, fetchImpl: f });
    await new Promise<void>((resolve) => broken.listen(0, "127.0.0.1", resolve));
    const { port } = broken.address() as AddressInfo;
    brokenBase = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => broken.close(() => resolve()));
  });

  afterEach(() => vi.restoreAllMocks());

  it("503s a VALID token instead of falsely calling it invalid", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const token = await mintToken(keys.privateKey, { scope: SCOPES.paymentsRead });
    const res = await fetch(`${brokenBase}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: `Bearer ${token}` },
      body: toolCall("list_applications"),
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(res.headers.get("www-authenticate")).toBeNull();
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toMatch(/invalid or expired token/i);
    // And no internals leak to the unauthenticated caller.
    expect(body.error).not.toMatch(/crypto/i);
  });

  it("still 401s a genuinely missing bearer", async () => {
    const res = await fetch(`${brokenBase}/mcp`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: toolCall("list_applications"),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /mcp scope enforcement", () => {
  it("403s insufficient_scope when a scoped tool is called without the scope", async () => {
    const token = await mintToken(keys.privateKey, { scope: SCOPES.paymentsRead });
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: `Bearer ${token}` },
      body: toolCall("payout", { applicationId: "11111111-2222-3333-4444-555555555555", env: "sandbox" }),
    });
    expect(res.status).toBe(403);
    const wa = res.headers.get("www-authenticate")!;
    expect(wa).toContain('error="insufficient_scope"');
    expect(wa).toContain(`scope="${SCOPES.paymentsPayout}"`);
    expect(((await res.json()) as { error: string }).error).toContain(SCOPES.paymentsPayout);
  });

  it("lets a valid, correctly-scoped tools/call through the auth gate", async () => {
    const token = await mintToken(keys.privateKey, { scope: SCOPES.paymentsPayout });
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: `Bearer ${token}` },
      body: toolCall("payout", {
        applicationId: "11111111-2222-3333-4444-555555555555",
        env: "sandbox",
        amount: 100,
        phone: "254712345678",
      }),
    });
    // The scope gate passed — the request reached the MCP transport (not 401/403).
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("does not require a scope for a public tool (decode_mpesa_error)", async () => {
    const token = await mintToken(keys.privateKey, { scope: "" });
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: `Bearer ${token}` },
      body: toolCall("decode_mpesa_error", { resultCode: 1032 }),
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("does not scope-gate non tools/call methods (tools/list)", async () => {
    const token = await mintToken(keys.privateKey, { scope: "" });
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe("routing", () => {
  it("404s an unknown path", async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });

  it("GET /mcp requires a bearer too", async () => {
    const res = await fetch(`${base}/mcp`);
    expect(res.status).toBe(401);
  });
});
