/**
 * Runtime configuration: resolved from CLI flags first, then environment
 * variables. No secrets are ever logged.
 */

export const DEFAULT_BASE_URL = "https://paylod.dev/functions/v1";

/** The environment a merchant API key operates in, derived from its prefix. */
export type KeyEnv = "production" | "sandbox" | "unknown";

export interface Config {
  /** Merchant API key: `mp_live_...` (production) or `mp_test_...` (sandbox). */
  apiKey: string;
  /** Base URL for the paylod edge functions. */
  baseUrl: string;
  /** Derived from the API key prefix. */
  keyEnv: KeyEnv;
  /**
   * Raw tool-selection value (from `--tools=` or `PAYLOD_TOOLS`). A comma list of
   * tool names / category names, or the literal `all`. Undefined = safe defaults.
   */
  tools?: string;
  /**
   * Optional Supabase user session JWT for the `simulate_*` tools, which the
   * paylod backend currently authenticates with a dashboard session — NOT an API
   * key. See README "Sandbox simulator" for the backend change that removes this.
   */
  sessionToken?: string;
  /** Network timeout in milliseconds for edge-function calls. */
  timeoutMs: number;
}

/** Derive the operating environment from an API-key prefix. */
export function keyEnvOf(apiKey: string): KeyEnv {
  if (apiKey.startsWith("mp_live_")) return "production";
  if (apiKey.startsWith("mp_test_")) return "sandbox";
  return "unknown";
}

interface RawArgs {
  apiKey?: string;
  baseUrl?: string;
  tools?: string;
  sessionToken?: string;
  timeoutMs?: number;
}

/** Parse `--key=value` and `--key value` style flags. Unknown flags are ignored. */
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
      case "api-key": {
        const [v, ni] = take(i, inline);
        out.apiKey = v;
        i = ni;
        break;
      }
      case "base-url": {
        const [v, ni] = take(i, inline);
        out.baseUrl = v;
        i = ni;
        break;
      }
      case "tools": {
        const [v, ni] = take(i, inline);
        out.tools = v;
        i = ni;
        break;
      }
      case "session-token": {
        const [v, ni] = take(i, inline);
        out.sessionToken = v;
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
  PAYLOD_API_KEY?: string;
  PAYLOD_BASE_URL?: string;
  PAYLOD_TOOLS?: string;
  PAYLOD_SESSION_TOKEN?: string;
  PAYLOD_TIMEOUT_MS?: string;
}

/**
 * Build a validated {@link Config} from CLI args + environment. Throws a
 * user-friendly Error when the required API key is missing.
 */
export function loadConfig(argv: readonly string[], env: Env): Config {
  const args = parseArgs(argv);

  const apiKey = (args.apiKey || env.PAYLOD_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "Missing paylod API key. Pass --api-key=mp_test_... or set PAYLOD_API_KEY. " +
        "Get a key from your paylod dashboard at https://paylod.dev.",
    );
  }

  const baseUrl = (args.baseUrl || env.PAYLOD_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const tools = args.tools ?? env.PAYLOD_TOOLS;
  const sessionToken = (args.sessionToken || env.PAYLOD_SESSION_TOKEN || "").trim() || undefined;
  const envTimeout = env.PAYLOD_TIMEOUT_MS ? Number(env.PAYLOD_TIMEOUT_MS) : undefined;
  const timeoutMs =
    args.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout! > 0 ? envTimeout! : 30_000);

  return {
    apiKey,
    baseUrl,
    keyEnv: keyEnvOf(apiKey),
    tools: tools && tools.trim().length > 0 ? tools.trim() : undefined,
    sessionToken,
    timeoutMs,
  };
}
