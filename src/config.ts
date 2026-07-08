/**
 * Runtime configuration for the OAuth-authenticated remote MCP server.
 *
 * Resolved from CLI flags first, then environment variables. There is no
 * API-key / session-token dev mode — the server is OAuth-only (contract A-6).
 *
 * The AS issuer, JWKS URI and canonical resource URI are FROZEN interface seams
 * (Revision 1.2); their defaults are the production values and should only be
 * overridden for local testing.
 */

export const DEFAULT_BACKEND_BASE_URL = "https://paylod.dev/functions/v1";
export const DEFAULT_MCP_CANONICAL_URI = "https://mcp.paylod.dev/mcp";
export const DEFAULT_AS_ISSUER = "https://paylod.dev/oauth";
export const DEFAULT_AS_JWKS_URI = "https://paylod.dev/oauth/.well-known/jwks.json";
export const DEFAULT_PORT = 8787;

export interface Config {
  /** TCP port the HTTP server listens on (behind Caddy). */
  port: number;
  /** Base URL for the paylod backend edge functions (tools route here). */
  backendBaseUrl: string;
  /**
   * Canonical resource URI (RFC 8707 audience). Every access token MUST carry
   * this exact value as `aud`. Also the `resource` in the PRM document.
   */
  canonicalUri: string;
  /** Expected token issuer (`iss`). */
  asIssuer: string;
  /** Authorization-server JWKS endpoint (ES256 public keys, keyed by `kid`). */
  asJwksUri: string;
  /** Network timeout in milliseconds for backend calls. */
  timeoutMs: number;
}

interface RawArgs {
  port?: number;
  backendBaseUrl?: string;
  canonicalUri?: string;
  asIssuer?: string;
  asJwksUri?: string;
  timeoutMs?: number;
}

/** Parse `--key=value` and `--key value` style flags. Unknown flags ignored. */
export function parseArgs(argv: readonly string[]): RawArgs {
  const out: RawArgs = {};
  const take = (i: number, inline: string | undefined): [string, number] => {
    if (inline !== undefined) return [inline, i];
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) return ["", i];
    return [next, i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || !arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);

    switch (name) {
      case "port": {
        const [v, ni] = take(i, inline);
        const n = Number(v);
        if (Number.isInteger(n) && n > 0) out.port = n;
        i = ni;
        break;
      }
      case "base-url":
      case "backend-url": {
        const [v, ni] = take(i, inline);
        out.backendBaseUrl = v;
        i = ni;
        break;
      }
      case "canonical-uri":
      case "resource": {
        const [v, ni] = take(i, inline);
        out.canonicalUri = v;
        i = ni;
        break;
      }
      case "as-issuer": {
        const [v, ni] = take(i, inline);
        out.asIssuer = v;
        i = ni;
        break;
      }
      case "as-jwks-uri": {
        const [v, ni] = take(i, inline);
        out.asJwksUri = v;
        i = ni;
        break;
      }
      case "timeout": {
        const [v, ni] = take(i, inline);
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) out.timeoutMs = n;
        i = ni;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export interface Env {
  MCP_PORT?: string;
  PAYLOD_BASE_URL?: string;
  MCP_CANONICAL_URI?: string;
  AS_ISSUER?: string;
  AS_JWKS_URI?: string;
  PAYLOD_TIMEOUT_MS?: string;
}

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Build a validated {@link Config} from CLI args + environment. */
export function loadConfig(argv: readonly string[], env: Env): Config {
  const args = parseArgs(argv);

  const envPort = env.MCP_PORT ? Number(env.MCP_PORT) : undefined;
  const port =
    args.port ?? (Number.isInteger(envPort) && envPort! > 0 ? envPort! : DEFAULT_PORT);

  const backendBaseUrl = stripSlash(
    args.backendBaseUrl || env.PAYLOD_BASE_URL || DEFAULT_BACKEND_BASE_URL,
  );
  // The canonical URI is an exact audience match — do NOT strip a trailing path.
  const canonicalUri = (args.canonicalUri || env.MCP_CANONICAL_URI || DEFAULT_MCP_CANONICAL_URI).trim();
  const asIssuer = (args.asIssuer || env.AS_ISSUER || DEFAULT_AS_ISSUER).trim();
  const asJwksUri = (args.asJwksUri || env.AS_JWKS_URI || DEFAULT_AS_JWKS_URI).trim();

  const envTimeout = env.PAYLOD_TIMEOUT_MS ? Number(env.PAYLOD_TIMEOUT_MS) : undefined;
  const timeoutMs =
    args.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout! > 0 ? envTimeout! : 30_000);

  return { port, backendBaseUrl, canonicalUri, asIssuer, asJwksUri, timeoutMs };
}
