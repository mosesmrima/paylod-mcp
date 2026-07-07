import type { FetchLike } from "../src/client.js";
import type { Config } from "../src/config.js";

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

export function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiKey: "mp_test_deadbeef",
    baseUrl: "https://paylod.dev/functions/v1",
    keyEnv: "sandbox",
    timeoutMs: 5000,
    ...overrides,
  };
}
