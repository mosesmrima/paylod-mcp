import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { PaylodClient } from "../src/client.js";
import { ALL_TOOLS } from "../src/tools/index.js";
import { makeConfig, mockFetch } from "./helpers.js";

describe("buildServer", () => {
  it("registers only the default-safe tools when no selection is given", () => {
    const client = new PaylodClient(makeConfig(), mockFetch().fetch);
    const { enabledTools } = buildServer(makeConfig(), client);
    const names = enabledTools.map((t) => t.name);
    expect(names).toContain("get_payment_status");
    expect(names).toContain("decode_mpesa_error");
    expect(names).not.toContain("payout");
    expect(names).not.toContain("request_stk_push");
  });

  it("registers every tool with --tools=all", () => {
    const client = new PaylodClient(makeConfig({ tools: "all" }), mockFetch().fetch);
    const { enabledTools } = buildServer(makeConfig({ tools: "all" }), client);
    expect(enabledTools.length).toBe(ALL_TOOLS.length);
  });

  it("returns a connectable McpServer instance", () => {
    const client = new PaylodClient(makeConfig(), mockFetch().fetch);
    const { server } = buildServer(makeConfig(), client);
    expect(typeof server.connect).toBe("function");
  });
});
