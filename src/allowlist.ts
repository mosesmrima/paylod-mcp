/**
 * Tool allowlisting — mirrors the ergonomics of Stripe's agent toolkit.
 *
 * Selection is a comma list of tool NAMES and/or CATEGORY names, or the literal
 * `all`, or `default`. When no selection is provided, only the safe default
 * categories are enabled; money-moving and elevated tools require explicit
 * opt-in.
 */

import type { ToolCategory, ToolDef } from "./tools/types.js";

/** Categories enabled when the operator does not pass `--tools`. */
export const DEFAULT_CATEGORIES: readonly ToolCategory[] = ["read", "local", "qr", "sandbox"];

/** Categories that require explicit opt-in (move money or are elevated). */
export const OPT_IN_CATEGORIES: readonly ToolCategory[] = ["collect", "payout", "reversal", "mint"];

const ALL_CATEGORIES: readonly ToolCategory[] = [...DEFAULT_CATEGORIES, ...OPT_IN_CATEGORIES];

export interface Selection {
  /** Whether every tool is selected. */
  all: boolean;
  /** Explicitly selected category names. */
  categories: Set<ToolCategory>;
  /** Explicitly selected tool names. */
  names: Set<string>;
  /** Whether the default-safe set is included (implicitly or via `default`). */
  includeDefaults: boolean;
}

function isCategory(token: string): token is ToolCategory {
  return (ALL_CATEGORIES as readonly string[]).includes(token);
}

/**
 * Parse a raw `--tools` value into a {@link Selection}. `undefined`/empty means
 * "the safe defaults".
 */
export function parseSelection(raw: string | undefined): Selection {
  const sel: Selection = {
    all: false,
    categories: new Set<ToolCategory>(),
    names: new Set<string>(),
    includeDefaults: false,
  };

  if (!raw || raw.trim().length === 0) {
    sel.includeDefaults = true;
    return sel;
  }

  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    sel.includeDefaults = true;
    return sel;
  }

  for (const token of tokens) {
    if (token === "all" || token === "*") {
      sel.all = true;
    } else if (token === "default" || token === "defaults") {
      sel.includeDefaults = true;
    } else if (isCategory(token)) {
      sel.categories.add(token);
    } else {
      sel.names.add(token);
    }
  }
  return sel;
}

/** Decide whether a given tool is enabled under a selection. */
export function isEnabled(tool: ToolDef, sel: Selection): boolean {
  if (sel.all) return true;
  if (sel.names.has(tool.name)) return true;
  if (sel.categories.has(tool.category)) return true;
  if (sel.includeDefaults && DEFAULT_CATEGORIES.includes(tool.category)) return true;
  return false;
}

/** Filter a list of tools down to the enabled set. */
export function selectTools(tools: readonly ToolDef[], raw: string | undefined): ToolDef[] {
  const sel = parseSelection(raw);
  return tools.filter((t) => isEnabled(t, sel));
}
