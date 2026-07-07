/**
 * paylod MCP server — stdio entrypoint.
 *
 * Run: `npx -y @paylod/mcp --api-key=mp_test_...`
 * or set PAYLOD_API_KEY and run `paylod-mcp`.
 *
 * IMPORTANT: on stdio, stdout is the MCP transport — never write logs there.
 * All diagnostics go to stderr.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

function printHelp(): void {
  process.stderr.write(
    `${SERVER_NAME} v${SERVER_VERSION} — MCP server for paylod (M-Pesa BaaS)\n\n` +
      `Usage:\n` +
      `  paylod-mcp --api-key=mp_test_xxx [options]\n\n` +
      `Options:\n` +
      `  --api-key=<key>        Merchant API key (mp_live_/mp_test_). Or set PAYLOD_API_KEY.\n` +
      `  --base-url=<url>       Edge functions base URL. Or PAYLOD_BASE_URL.\n` +
      `                         Default: https://paylod.dev/functions/v1\n` +
      `  --tools=<list>         Comma list of tool names / categories, or 'all' / 'default'.\n` +
      `                         Or PAYLOD_TOOLS. Default: read + local + qr + sandbox tools.\n` +
      `                         Money-moving tools (collect, payout, reversal, mint) are opt-in.\n` +
      `  --session-token=<jwt>  Supabase session JWT for the sandbox simulate_* tools and\n` +
      `                         mint_api_key. Or PAYLOD_SESSION_TOKEN.\n` +
      `  --timeout=<ms>         Network timeout in ms (default 30000). Or PAYLOD_TIMEOUT_MS.\n` +
      `  --help                 Show this help.\n`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  let config;
  try {
    config = loadConfig(argv, process.env as Record<string, string | undefined>);
  } catch (err) {
    process.stderr.write(`[paylod-mcp] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
    return;
  }

  const { server, enabledTools } = buildServer(config);

  process.stderr.write(
    `[paylod-mcp] starting (key env: ${config.keyEnv}, base: ${config.baseUrl})\n` +
      `[paylod-mcp] ${enabledTools.length} tools enabled: ${enabledTools.map((t) => t.name).join(", ")}\n`,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[paylod-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
