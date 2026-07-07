import { describe, expect, it } from "vitest";
import { parseSelection, selectTools, DEFAULT_CATEGORIES, OPT_IN_CATEGORIES } from "../src/allowlist.js";
import { ALL_TOOLS } from "../src/tools/index.js";

const namesOf = (raw: string | undefined) => new Set(selectTools(ALL_TOOLS, raw).map((t) => t.name));

describe("parseSelection", () => {
  it("defaults to the safe set when empty", () => {
    const sel = parseSelection(undefined);
    expect(sel.includeDefaults).toBe(true);
    expect(sel.all).toBe(false);
  });

  it("recognizes 'all'", () => {
    expect(parseSelection("all").all).toBe(true);
  });

  it("separates categories from tool names", () => {
    const sel = parseSelection("payout,request_stk_push");
    expect(sel.categories.has("payout")).toBe(true);
    expect(sel.names.has("request_stk_push")).toBe(true);
    expect(sel.includeDefaults).toBe(false);
  });
});

describe("selectTools gating", () => {
  it("default excludes all money-moving / elevated tools", () => {
    const names = namesOf(undefined);
    // Safe tools present
    expect(names.has("get_payment_status")).toBe(true);
    expect(names.has("decode_mpesa_error")).toBe(true);
    expect(names.has("generate_qr")).toBe(true);
    expect(names.has("simulate_test_payment")).toBe(true);
    // Opt-in tools absent
    expect(names.has("request_stk_push")).toBe(false);
    expect(names.has("payout")).toBe(false);
    expect(names.has("reversal")).toBe(false);
    expect(names.has("mint_api_key")).toBe(false);
  });

  it("'all' enables every tool", () => {
    expect(namesOf("all").size).toBe(ALL_TOOLS.length);
  });

  it("opting into a single tool name adds only that tool (no defaults)", () => {
    const names = namesOf("payout");
    expect(names.has("payout")).toBe(true);
    expect(names.has("get_payment_status")).toBe(false);
  });

  it("'default,payout' keeps defaults and adds payout", () => {
    const names = namesOf("default,payout");
    expect(names.has("payout")).toBe(true);
    expect(names.has("get_payment_status")).toBe(true);
    expect(names.has("reversal")).toBe(false);
  });

  it("category selection enables the whole category", () => {
    const names = namesOf("read");
    expect(names.has("get_payment_status")).toBe(true);
    expect(names.has("get_account_balance")).toBe(true);
    expect(names.has("get_transaction_status")).toBe(true);
    expect(names.has("generate_qr")).toBe(false);
  });

  it("categories are partitioned into default vs opt-in with no overlap", () => {
    for (const c of DEFAULT_CATEGORIES) expect(OPT_IN_CATEGORIES).not.toContain(c);
  });
});
