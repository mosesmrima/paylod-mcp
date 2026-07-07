import type { ZodRawShape } from "zod";
import type { PaylodClient } from "../client.js";

/**
 * Tool categories drive the allowlist. Everything except the money-moving /
 * elevated categories is enabled by default.
 */
export type ToolCategory =
  | "read" // GET-style reads, non-mutating
  | "local" // pure, offline (no network)
  | "qr" // stateless QR generation (no money movement, no ledger row)
  | "sandbox" // sandbox simulator (test-mode only)
  | "collect" // STK push — moves money on a live key (opt-in)
  | "payout" // B2C money-out (opt-in)
  | "reversal" // refund / reversal (opt-in)
  | "mint"; // mint API keys — elevated / destructive-ish (opt-in)

/** A JSON-serializable tool result. */
export type ToolResult = unknown;

export interface ToolDef {
  /** Stable tool name exposed to the MCP client (snake_case). */
  name: string;
  /** Short human title. */
  title: string;
  /** Category — controls allowlisting. */
  category: ToolCategory;
  /** Rich description; agents read this to decide when/how to call the tool. */
  description: string;
  /** Zod raw shape used as the MCP input schema. */
  inputSchema: ZodRawShape;
  /** Handler — receives the validated args and returns a JSON-serializable result. */
  handler: (client: PaylodClient, args: Record<string, unknown>) => Promise<ToolResult>;
}
