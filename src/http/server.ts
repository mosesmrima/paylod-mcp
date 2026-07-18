/**
 * OAuth-authenticated Streamable-HTTP MCP server (contract A-1 / §3.2 / §5).
 *
 * Endpoints:
 *   GET  /.well-known/oauth-protected-resource  → RFC 9728 PRM (no auth)
 *   POST /mcp                                    → MCP requests (bearer required)
 *   GET  /mcp                                    → server-initiated SSE (bearer required)
 *   DELETE /mcp                                  → session teardown (bearer required)
 *
 * Bearer validation runs at the HTTP boundary: a missing/invalid token is a 401
 * for the whole request; a valid token missing a tool's required scope is a 403
 * on that `tools/call` before it is dispatched.
 */

import { createServer as createHttpServerNode, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { PaylodClient, type FetchLike } from "../client.js";
import type { Config } from "../config.js";
import { buildMcpServer, requiredScopeFor } from "../server.js";
import {
  ForbiddenError,
  TokenVerificationUnavailableError,
  UnauthorizedError,
} from "../oauth/errors.js";
import { extractBearer, TokenVerifier, type AccessClaims } from "../oauth/verify.js";
import { buildPrm, PRM_PATH } from "./prm.js";
import {
  challengeInsufficientScope,
  challengeInvalid,
  challengeMissing,
} from "./www-authenticate.js";

export const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 1_000_000;

export interface HttpDeps {
  /** Token verifier (injectable so tests use a stub JWKS / local key). */
  verifier: TokenVerifier;
  /** Fetch used by the backend client (injectable for tests). */
  fetchImpl?: FetchLike;
}

/** Build the default production dependencies from config (remote JWKS). */
export function defaultDeps(config: Config): HttpDeps {
  return {
    verifier: TokenVerifier.fromJwksUri(config.asJwksUri, {
      issuer: config.asIssuer,
      audience: config.canonicalUri,
    }),
  };
}

function pathOf(req: IncomingMessage): string {
  const url = req.url ?? "/";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Collect every JSON-RPC message in a body (single object or a batch array). */
function messagesOf(parsedBody: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsedBody)) {
    return parsedBody.filter((m): m is Record<string, unknown> => isRecord(m));
  }
  return isRecord(parsedBody) ? [parsedBody] : [];
}

/**
 * Enforce per-tool scope for any `tools/call` in the body. Throws ForbiddenError
 * for the first tool whose required scope is not in the granted set.
 */
function enforceScopes(parsedBody: unknown, claims: AccessClaims): void {
  for (const msg of messagesOf(parsedBody)) {
    if (msg.method !== "tools/call") continue;
    const params = isRecord(msg.params) ? msg.params : undefined;
    const name = params && typeof params.name === "string" ? params.name : undefined;
    if (!name) continue;
    const scope = requiredScopeFor(name);
    if (scope && !claims.scopes.has(scope)) {
      throw new ForbiddenError(scope);
    }
  }
}

/** Send the correct 401/403/503 for an auth error (contract §3.4). */
function respondAuthError(res: ServerResponse, err: unknown, config: Config): boolean {
  if (err instanceof UnauthorizedError) {
    const header = err.oauthError ? challengeInvalid() : challengeMissing(config);
    writeJson(res, 401, { error: err.message }, { "WWW-Authenticate": header });
    return true;
  }
  if (err instanceof TokenVerificationUnavailableError) {
    // A JWKS outage or a broken runtime is not the caller's fault: 503 + Retry-After,
    // and NO `WWW-Authenticate` — there is nothing for the client to re-authenticate
    // with. The request is still denied; only the diagnosis is honest.
    writeJson(res, 503, { error: err.message }, { "Retry-After": "5" });
    return true;
  }
  if (err instanceof ForbiddenError) {
    writeJson(
      res,
      403,
      { error: err.message },
      { "WWW-Authenticate": challengeInsufficientScope(err.requiredScope) },
    );
    return true;
  }
  return false;
}

async function authenticate(
  req: IncomingMessage,
  verifier: TokenVerifier,
): Promise<AccessClaims> {
  const token = extractBearer(req.headers.authorization);
  if (!token) throw new UnauthorizedError("missing bearer token");
  return verifier.verify(token); // throws UnauthorizedError("invalid_token") on failure
}

/** Build the Node request handler. Exposed for direct unit testing. */
export function createRequestHandler(
  config: Config,
  deps: HttpDeps,
): (req: IncomingMessage, res: ServerResponse) => void {
  const fetchImpl = deps.fetchImpl;

  return (req, res) => {
    void handle(req, res).catch((err) => {
      if (!res.headersSent) {
        writeJson(res, 500, { error: "internal server error" });
      } else {
        res.end();
      }
      // Never leak internals to the client; log to stderr for the operator.
      process.stderr.write(
        `[paylod-mcp] unhandled: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    });
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = pathOf(req);
    const method = (req.method ?? "GET").toUpperCase();

    // --- PRM document (public, no auth) ---
    if (method === "GET" && path === PRM_PATH) {
      writeJson(res, 200, buildPrm(config), { "Cache-Control": "public, max-age=3600" });
      return;
    }

    if (path !== MCP_PATH) {
      writeJson(res, 404, { error: "not found" });
      return;
    }

    // --- authenticate the bearer for every /mcp method ---
    let claims: AccessClaims;
    try {
      claims = await authenticate(req, deps.verifier);
    } catch (err) {
      if (respondAuthError(res, err, config)) return;
      throw err;
    }

    if (method === "POST") {
      let parsedBody: unknown;
      try {
        const raw = await readBody(req);
        parsedBody = raw ? JSON.parse(raw) : undefined;
      } catch {
        writeJson(res, 400, { error: "invalid JSON body" });
        return;
      }

      // --- per-tool scope enforcement before dispatch ---
      try {
        enforceScopes(parsedBody, claims);
      } catch (err) {
        if (respondAuthError(res, err, config)) return;
        throw err;
      }

      await dispatch(req, res, claims, parsedBody);
      return;
    }

    if (method === "GET" || method === "DELETE") {
      await dispatch(req, res, claims, undefined);
      return;
    }

    writeJson(res, 405, { error: "method not allowed" });
  }

  async function dispatch(
    req: IncomingMessage,
    res: ServerResponse,
    claims: AccessClaims,
    parsedBody: unknown,
  ): Promise<void> {
    const client = new PaylodClient(
      {
        backendBaseUrl: config.backendBaseUrl,
        timeoutMs: config.timeoutMs,
        token: extractBearer(req.headers.authorization)!,
        scopes: claims.scopes,
      },
      fetchImpl,
    );

    // Stateless: one server + transport per request (no cross-request state).
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = buildMcpServer(client);

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Create (but do not start) the Node HTTP server. */
export function createServer(config: Config, deps?: HttpDeps): Server {
  const resolved = deps ?? defaultDeps(config);
  return createHttpServerNode(createRequestHandler(config, resolved));
}
