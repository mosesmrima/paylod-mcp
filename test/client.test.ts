import { describe, expect, it } from "vitest";
import { PaylodClient } from "../src/client.js";
import { PaylodApiError } from "../src/errors.js";
import { makeConfig, mockFetch } from "./helpers.js";

describe("PaylodClient", () => {
  it("sends the API key as a Bearer token and parses JSON", async () => {
    const { fetch, calls } = mockFetch({ json: { paymentId: "p1", status: "pending" } });
    const client = new PaylodClient(makeConfig({ apiKey: "mp_test_key" }), fetch);
    const res = await client.request("POST", "/collect", { body: { amount: 10 } });

    expect(res).toEqual({ paymentId: "p1", status: "pending" });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://paylod.dev/functions/v1/collect");
    expect(calls[0]!.headers.Authorization).toBe("Bearer mp_test_key");
    expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ amount: 10 });
  });

  it("attaches the Idempotency-Key header", async () => {
    const { fetch, calls } = mockFetch({ json: {} });
    const client = new PaylodClient(makeConfig(), fetch);
    await client.request("POST", "/collect", { body: {}, idempotencyKey: "abc-123" });
    expect(calls[0]!.headers["Idempotency-Key"]).toBe("abc-123");
  });

  it("appends query params for GET", async () => {
    const { fetch, calls } = mockFetch({ json: {} });
    const client = new PaylodClient(makeConfig(), fetch);
    await client.request("GET", "/status/p1", { query: { verbose: "1" } });
    expect(calls[0]!.url).toBe("https://paylod.dev/functions/v1/status/p1?verbose=1");
    expect(calls[0]!.body).toBeUndefined();
  });

  it("throws PaylodApiError with the API error message and Retry-After", async () => {
    const { fetch } = mockFetch({
      status: 429,
      json: { error: "rate limited" },
      headers: { "Retry-After": "30" },
    });
    const client = new PaylodClient(makeConfig(), fetch);
    await expect(client.request("POST", "/collect", { body: {} })).rejects.toMatchObject({
      status: 429,
      message: "rate limited",
      retryAfter: 30,
    });
  });

  it("uses the session token when useSessionToken is set", async () => {
    const { fetch, calls } = mockFetch({ json: {} });
    const client = new PaylodClient(makeConfig({ sessionToken: "jwt.abc" }), fetch);
    await client.request("POST", "/simulate/collect", { body: {}, useSessionToken: true });
    expect(calls[0]!.headers.Authorization).toBe("Bearer jwt.abc");
  });

  it("fails clearly when a session token is required but missing", async () => {
    const { fetch } = mockFetch({ json: {} });
    const client = new PaylodClient(makeConfig(), fetch);
    await expect(
      client.request("POST", "/simulate/collect", { body: {}, useSessionToken: true }),
    ).rejects.toBeInstanceOf(PaylodApiError);
  });
});
