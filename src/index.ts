/**
 * paylod MCP server — OAuth-authenticated remote Streamable-HTTP entrypoint.
 *
 * Run: `paylod-mcp --port=8787` (behind Caddy at https://mcp.paylod.dev/mcp).
 * OAuth-only — there is no stdio transport and no API-key dev mode.
 *
 * All diagnostics go to stderr.
 */

import { loadConfig } from "./config.js";
import { createServer } from "./http/server.js";
import { SERVER_NAME, SERVER_VERSION } from "./server.js";

function printHelp(): void {
  process.stderr.write(
    `${SERVER_NAME} v${SERVER_VERSION} — OAuth remote MCP server for paylod (M-Pesa BaaS)\n\n` +
      `Usage:\n` +
      `  paylod-mcp [options]\n\n` +
      `Options:\n` +
      `  --port=<n>             HTTP port to listen on (default 8787). Or MCP_PORT.\n` +
      `  --base-url=<url>       paylod backend base URL. Or PAYLOD_BASE_URL.\n` +
      `                         Default: https://paylod.dev/functions/v1\n` +
      `  --canonical-uri=<url>  Canonical resource URI (token aud). Or MCP_CANONICAL_URI.\n` +
      `                         Default: https://mcp.paylod.dev/mcp\n` +
      `  --as-issuer=<url>      Authorization-server issuer. Or AS_ISSUER.\n` +
      `                         Default: https://paylod.dev/oauth\n` +
      `  --as-jwks-uri=<url>    AS JWKS endpoint (ES256). Or AS_JWKS_URI. Only needed\n` +
      `                         if the JWKS is not served under the issuer.\n` +
      `                         Default: <as-issuer>/.well-known/jwks.json\n` +
      `  --timeout=<ms>         Backend network timeout in ms (default 30000).\n` +
      `  --help                 Show this help.\n`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const config = loadConfig(argv, process.env as Record<string, string | undefined>);
  const server = createServer(config);

  server.listen(config.port, () => {
    process.stderr.write(
      `[paylod-mcp] listening on :${config.port}\n` +
        `[paylod-mcp] resource=${config.canonicalUri} issuer=${config.asIssuer}\n` +
        `[paylod-mcp] backend=${config.backendBaseUrl}\n`,
    );
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(
    `[paylod-mcp] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
