/**
 * Thin, request-scoped HTTP client for the paylod backend edge functions.
 *
 * Every instance is bound to ONE validated OAuth access token and the scopes it
 * granted. That SAME token is forwarded to the backend in
 * `Authorization: Bearer <token>` (contract §3.2 step 5). It is NEVER forwarded
 * to Daraja/Safaricom (the backend holds those credentials).
 */

import { PaylodApiError, PaylodNetworkError } from "./errors.js";

export interface RequestOptions {
  /** JSON body for POST requests. */
  body?: unknown;
  /** Query string params (appended to the URL). */
  query?: Record<string, string | number | undefined>;
  /** Value for the `Idempotency-Key` header (safe retries on collect). */
  idempotencyKey?: string;
  /** HTTP method override for endpoints that use PATCH. Defaults per call. */
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

export interface PaylodClientOptions {
  backendBaseUrl: string;
  timeoutMs: number;
  /** The validated OAuth access token forwarded to the backend. */
  token: string;
  /** Scopes granted by that token (for tools like `authenticate`). */
  scopes: Set<string>;
}

export type HttpMethod = "GET" | "POST" | "PATCH";

export class PaylodClient {
  private readonly backendBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly token: string;
  readonly scopes: Set<string>;
  private readonly fetchImpl: FetchLike;

  constructor(opts: PaylodClientOptions, fetchImpl?: FetchLike) {
    this.backendBaseUrl = opts.backendBaseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs;
    this.token = opts.token;
    this.scopes = opts.scopes;
    this.fetchImpl = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    if (!this.fetchImpl) {
      throw new Error("No fetch implementation available. Use Node >= 18 or pass one explicitly.");
    }
  }

  /** Scopes this client's token was granted, as a sorted array. */
  grantedScopes(): string[] {
    return [...this.scopes].sort();
  }

  buildUrl(path: string, query?: RequestOptions["query"]): string {
    const clean = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.backendBaseUrl}${clean}`;
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  private buildHeaders(opts: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "paylod-mcp",
      // Forward the SAME OAuth token to the backend. Never to Daraja.
      Authorization: `Bearer ${this.token}`,
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    return headers;
  }

  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const headers = this.buildHeaders(opts);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        signal: controller.signal,
      });
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "AbortError"
          ? `Request to ${path} timed out after ${this.timeoutMs}ms`
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
