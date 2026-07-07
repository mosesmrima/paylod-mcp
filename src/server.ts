import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { selectTools } from "./allowlist.js";
import { PaylodClient } from "./client.js";
import type { Config } from "./config.js";
import { toMessage } from "./errors.js";
import { ALL_TOOLS, type ToolDef } from "./tools/index.js";

export const SERVER_NAME = "paylod-mcp";
export const SERVER_VERSION = "0.1.0";

export interface BuildServerResult {
  server: McpServer;
  /** The tools that were actually registered (post-allowlist). */
  enabledTools: ToolDef[];
}

/**
 * Build (but do not connect) an MCP server wired to paylod. The transport is
 * chosen by the caller (stdio in the CLI entrypoint).
 */
export function buildServer(config: Config, client?: PaylodClient): BuildServerResult {
  const paylod = client ?? new PaylodClient(config);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const enabledTools = selectTools(ALL_TOOLS, config.tools);

  for (const tool of enabledTools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = await tool.handler(paylod, args);
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

  return { server, enabledTools };
}
