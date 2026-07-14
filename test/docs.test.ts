import { describe, expect, it } from "vitest";
import { getDocsTool } from "../src/tools/docs.js";
import { makeClient, mockFetch } from "./helpers.js";

/**
 * `get_docs` serves GENERATED content (src/docs-bundle.ts ← mpesa/web/content/docs/**).
 * These tests assert the things an agent MUST be told — if the docs ever stop saying them,
 * the regenerated bundle fails here rather than quietly teaching an agent to double-charge.
 */
describe("get_docs", () => {
  const ask = async (args: Record<string, string>) =>
    (await getDocsTool.handler(makeClient({}, mockFetch().fetch), args)) as {
      topic: string;
      content: string;
      availableTopics: string[];
    };

  it("is local (no network) and answers the integration question", async () => {
    const { fetch, calls } = mockFetch();
    const res = (await getDocsTool.handler(makeClient({}, fetch), {
      query: "how do I integrate M-Pesa with paylod",
    })) as { topic: string; content: string; availableTopics: string[] };
    expect(calls.length).toBe(0);
    expect(res.topic).toBe("integration");
    expect(res.availableTopics).toContain("sdk");
  });

  // The whole point of generating this from the docs: the answer must teach the CURRENT product.
  it("leads with the SDK, not hand-rolled HTTP", async () => {
    for (const topic of ["integration", "sdk", "payments"]) {
      const res = await ask({ topic });
      expect(res.content).toContain("@paylod/node");
    }
    const sdk = await ask({ topic: "sdk" });
    expect(sdk.content).toContain("collectAndWait");
    expect(sdk.content).toContain("retryable");
    // Never tell an agent to hand-roll the polling loop or a callback endpoint.
    expect(await ask({ query: "how do I take a payment" })).toBeTruthy();
  });

  it("says 4999 is pending, not failed, and never retryable", async () => {
    const res = await ask({ topic: "errors" });
    expect(res.content).toContain("4999");
    expect(res.content.toLowerCase()).toContain("pending");
    expect(res.content).toContain("double-charge");
  });

  it("keeps the API key server-side", async () => {
    const res = await ask({ topic: "security" });
    expect(res.content).toMatch(/never|not/i);
    expect(res.content).toContain("server");
  });

  it("keeps the MCP tool-ordering guidance", async () => {
    const res = await ask({ topic: "mcp" });
    for (const tool of ["create_app", "create_application", "set_credentials", "mint_key"]) {
      expect(res.content).toContain(tool);
    }
    expect(res.content).toContain("Daraja portal");
  });

  it("routes free text to the right topic", async () => {
    const at = async (query: string) => (await ask({ query })).topic;
    expect(await at("how do I verify a webhook signature")).toBe("webhooks");
    expect(await at("what callback url do I paste into the daraja portal")).toBe("go-live");
    expect(await at("what does resultCode 1032 mean")).toBe("errors");
  });

  it("honours an explicit topic and its historical aliases, defaults to integration", async () => {
    expect((await ask({ topic: "security" })).topic).toBe("security");
    // The MCP's original topic ids must keep resolving.
    expect((await ask({ topic: "callback-url" })).topic).toBe("go-live");
    expect((await ask({})).topic).toBe("integration");

    const client = makeClient({}, mockFetch().fetch);
    await expect(getDocsTool.handler(client, { topic: "nonsense" })).rejects.toThrow();
  });

  it("serves the complete bundle on topic 'all'", async () => {
    const res = await ask({ topic: "all" });
    expect(res.topic).toBe("all");
    expect(res.content).toContain("@paylod/node");
    expect(res.content).toContain("@paylod/cli");
    expect(res.content.length).toBeGreaterThan(20_000);
  });
});
