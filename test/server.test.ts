import { describe, expect, it } from "vitest";
import { buildMcpServer, requiredScopeFor, toolByName } from "../src/server.js";
import { SCOPES } from "../src/scopes.js";
import { makeClient } from "./helpers.js";

describe("buildMcpServer", () => {
  it("returns a connectable McpServer with all 21 tools registered", () => {
    const server = buildMcpServer(makeClient());
    expect(typeof server.connect).toBe("function");
  });
});

describe("requiredScopeFor", () => {
  it("returns the scope for a scoped tool", () => {
    expect(requiredScopeFor("payout")).toBe(SCOPES.paymentsPayout);
    expect(requiredScopeFor("request_stk_push")).toBe(SCOPES.paymentsCollect);
  });

  it("returns undefined for public tools and unknown names", () => {
    expect(requiredScopeFor("decode_mpesa_error")).toBeUndefined();
    expect(requiredScopeFor("authenticate")).toBeUndefined();
    expect(requiredScopeFor("no_such_tool")).toBeUndefined();
  });
});

describe("toolByName", () => {
  it("resolves a known tool", () => {
    expect(toolByName("mint_key")?.name).toBe("mint_key");
    expect(toolByName("nope")).toBeUndefined();
  });
});
