import type { ZodRawShape } from "zod";
import type { PaylodClient } from "../client.js";
import type { Scope } from "../scopes.js";

/** A JSON-serializable tool result. */
export type ToolResult = unknown;

export interface ToolDef {
  /** Stable tool name exposed to the MCP client (snake_case). */
  name: string;
  /** Short human title. */
  title: string;
  /**
   * OAuth scope required to invoke this tool (contract §2.2). `undefined` means
   * no scope is required — `decode_mpesa_error` (pure/local) and `authenticate`.
   */
  scope?: Scope;
  /** Rich description; agents read this to decide when/how to call the tool. */
  description: string;
  /** Zod raw shape used as the MCP input schema. */
  inputSchema: ZodRawShape;
  /** Handler — receives the request-scoped client + validated args. */
  handler: (client: PaylodClient, args: Record<string, unknown>) => Promise<ToolResult>;
}
