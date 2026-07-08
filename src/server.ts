import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PaylodClient } from "./client.js";
import { toMessage } from "./errors.js";
import { ALL_TOOLS, type ToolDef } from "./tools/index.js";

export const SERVER_NAME = "paylod-mcp";
export const SERVER_VERSION = "0.2.0";

const TOOLS_BY_NAME: ReadonlyMap<string, ToolDef> = new Map(
  ALL_TOOLS.map((t) => [t.name, t]),
);

/** Look up a tool definition by its MCP name. */
export function toolByName(name: string): ToolDef | undefined {
  return TOOLS_BY_NAME.get(name);
}

/**
 * The scope required to invoke a tool, or `undefined` if the tool is public
 * (`decode_mpesa_error`, `authenticate`) or the name is unknown. The HTTP layer
 * uses this to enforce scope on `tools/call` before dispatch.
 */
export function requiredScopeFor(toolName: string): string | undefined {
  return TOOLS_BY_NAME.get(toolName)?.scope;
}

/**
 * Build a request-scoped MCP server bound to one validated access token. All 18
 * tools are registered so `tools/list` is complete for discovery; per-tool scope
 * is enforced at the HTTP layer (403) before a `tools/call` reaches here.
 */
export function buildMcpServer(client: PaylodClient): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = await tool.handler(client, args);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: toMessage(err) }],
          };
        }
      },
    );
  }

  return server;
}
