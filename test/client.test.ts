import { describe, expect, it } from "vitest";
import { PaylodApiError } from "../src/errors.js";
import { makeClient, mockFetch } from "./helpers.js";

describe("PaylodClient", () => {
  it("forwards the OAuth access token as a Bearer and parses JSON", async () => {
    const { fetch, calls } = mockFetch({ json: { paymentId: "p1", status: "pending" } });
    const client = makeClient({ token: "oauth.jwt.token" }, fetch);
    const res = await client.request("POST", "/provider-ops/collect", { body: { amount: 10 } });

    expect(res).toEqual({ paymentId: "p1", status: "pending" });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://paylod.dev/functions/v1/provider-ops/collect");
    expect(calls[0]!.headers.Authorization).toBe("Bearer oauth.jwt.token");
    expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ amount: 10 });
  });

  it("attaches the Idempotency-Key header", async () => {
    const { fetch, calls } = mockFetch({ json: {} });
    const client = makeClient({}, fetch);
    await client.request("POST", "/provider-ops/collect", { body: {}, idempotencyKey: "abc-123" });
    expect(calls[0]!.headers["Idempotency-Key"]).toBe("abc-123");
  });

  it("appends query params for GET", async () => {
    const { fetch, calls } = mockFetch({ json: {} });
    const client = makeClient({}, fetch);
    await client.request("GET", "/webhook-endpoints", { query: { applicationId: "app-1" } });
    expect(calls[0]!.url).toBe("https://paylod.dev/functions/v1/webhook-endpoints?applicationId=app-1");
    expect(calls[0]!.body).toBeUndefined();
  });

  it("supports PATCH", async () => {
    const { fetch, calls } = mockFetch({ json: {} });
    const client = makeClient({}, fetch);
    await client.request("PATCH", "/webhook-endpoints/w1", { body: { active: false } });
    expect(calls[0]!.method).toBe("PATCH");
  });

  it("throws PaylodApiError with the API error message and Retry-After", async () => {
    const { fetch } = mockFetch({
      status: 429,
      json: { error: "Too many requests" },
      headers: { "Retry-After": "30" },
    });
    const client = makeClient({}, fetch);
    await expect(client.request("POST", "/provider-ops/collect", { body: {} })).rejects.toMatchObject({
      status: 429,
      message: "Too many requests",
      retryAfter: 30,
    });
  });

  it("surfaces a 403 forbidden from the backend as a PaylodApiError", async () => {
    const { fetch } = mockFetch({
      status: 403,
      json: { error: "forbidden: you do not own this application" },
    });
    const client = makeClient({}, fetch);
    await expect(
      client.request("POST", "/provider-ops/collect", { body: {} }),
    ).rejects.toBeInstanceOf(PaylodApiError);
  });

  it("exposes granted scopes sorted", () => {
    const client = makeClient({ scopes: new Set(["paylod:payments.read", "paylod:apps.write"]) });
    expect(client.grantedScopes()).toEqual(["paylod:apps.write", "paylod:payments.read"]);
  });
});
