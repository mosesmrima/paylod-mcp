/**
 * Thin, runtime-agnostic HTTP client for the paylod edge functions.
 *
 * Uses the global `fetch` (Node >= 18) — zero heavy dependencies. All merchant
 * endpoints authenticate with the API key (`Authorization: Bearer mp_...`); the
 * sandbox `simulate` endpoints use a Supabase session JWT instead (see README).
 */

import type { Config } from "./config.js";
import { PaylodApiError, PaylodNetworkError } from "./errors.js";

export interface RequestOptions {
  /** JSON body for POST requests. */
  body?: unknown;
  /** Query string params (appended to the URL). */
  query?: Record<string, string | number | undefined>;
  /** Value for the `Idempotency-Key` header (safe retries on /collect). */
  idempotencyKey?: string;
  /**
   * Authenticate with the Supabase session JWT (`config.sessionToken`) instead
   * of the merchant API key. Used only by the sandbox `simulate` endpoints.
   */
  useSessionToken?: boolean;
}

/** Minimal `fetch` signature so tests can inject a mock. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export class PaylodClient {
  private readonly config: Config;
  private readonly fetchImpl: FetchLike;

  constructor(config: Config, fetchImpl?: FetchLike) {
    this.config = config;
    this.fetchImpl = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    if (!this.fetchImpl) {
      throw new Error("No fetch implementation available. Use Node >= 18 or pass one explicitly.");
    }
  }

  get keyEnv() {
    return this.config.keyEnv;
  }

  get hasSessionToken(): boolean {
    return Boolean(this.config.sessionToken);
  }

  buildUrl(path: string, query?: RequestOptions["query"]): string {
    const clean = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.config.baseUrl}${clean}`;
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  buildHeaders(opts: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "paylod-mcp",
    };
    if (opts.useSessionToken) {
      const token = this.config.sessionToken;
      if (!token) {
        throw new PaylodApiError(
          "This tool needs a Supabase session token (PAYLOD_SESSION_TOKEN / --session-token). " +
            "The paylod sandbox simulator is currently dashboard-session authed, not API-key authed.",
          401,
        );
      }
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    return headers;
  }

  async request<T = unknown>(
    method: "GET" | "POST",
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const headers = this.buildHeaders(opts);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        signal: controller.signal,
      });
    } catch (err) {
      const msg = err instanceof Error && err.name === "AbortError"
        ? `Request to ${path} timed out after ${this.config.timeoutMs}ms`
        : `Network error calling ${path}: ${err instanceof Error ? err.message : String(err)}`;
      throw new PaylodNetworkError(msg);
    } finally {
      clearTimeout(timer);
    }

    const raw = await res.text();
    const parsed = raw ? safeJson(raw) : undefined;

    if (!res.ok) {
      const message =
        (isRecord(parsed) && typeof parsed.error === "string" && parsed.error) ||
        `Request failed with status ${res.status}`;
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      throw new PaylodApiError(message, res.status, {
        ...(retryAfter !== undefined && Number.isFinite(retryAfter) ? { retryAfter } : {}),
        body: parsed ?? raw,
      });
    }

    return parsed as T;
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
