# Changelog

All notable changes to `@paylod/mcp` are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-07-17

Remote OAuth rework. **Breaking:** the server is now an OAuth-authenticated remote
Streamable-HTTP service, not a local stdio process.

### Changed (breaking)

- **Transport:** stdio → **Streamable HTTP**. The server listens on a port
  (`--port` / `MCP_PORT`, default 8787) behind a TLS proxy at
  `https://mcp.paylod.dev/mcp`. There is no stdio transport.
- **Auth:** merchant API key (`PAYLOD_API_KEY` / `--api-key`) → **OAuth 2.1**
  (authorization code + PKCE + Dynamic Client Registration) against
  `https://paylod.dev/oauth`. Clients no longer hold a paylod API key; each tool
  is gated on an OAuth scope the user consents to. `--api-key`, `PAYLOD_API_KEY`,
  `PAYLOD_SESSION_TOKEN`, and `--tools=` allowlisting are removed — scope-based
  consent replaces client-side tool gating.
- **Tool input bounds** pinned to the backend's authoritative limits (amount
  `≤150000` whole-shilling, description `≤64`, accountRef `≤12`), with a
  contract test asserting the bounds.

### Added

- Onboarding/management tools: `create_app`, `create_application`,
  `get_callback_url`, `set_credentials`, `configure_webhook`, `list_webhooks`,
  `list_applications`, `register_c2b`, `authenticate` — an agent can go from
  nothing to a live integration over MCP.
- `mint_key` (was `mint_api_key`), now scope-gated (`paylod:keys.mint`).
- `prepublishOnly` now runs the full gate: `docs:check && typecheck && build &&
  test` (previously skipped tests).
- Docs bundle generated from `mpesa/web/content/docs/**` with a `docs:check`
  drift guard.

## [0.1.0] - 2026-07-07

Initial release.

### Added

- MCP server (stdio transport) for paylod, built on the official
  `@modelcontextprotocol/sdk` with Zod-validated tool inputs.
- Thin, dependency-free `fetch` client for the paylod edge functions, with
  API-key auth, `Idempotency-Key` support, timeouts, and decoded API errors.
- Tools:
  - `request_stk_push` — STK push / collect (money-moving, opt-in).
  - `get_payment_status` — look up a payment by id.
  - `get_account_balance` — async M-Pesa balance query.
  - `get_transaction_status` — async transaction status query.
  - `generate_qr` — stateless M-Pesa QR generation.
  - `decode_mpesa_error` — pure, offline Daraja error-code decoder.
  - `simulate_test_payment` / `simulate_outcome` — sandbox simulator
    (session-token authed; see README for the backend caveat).
  - `payout` — B2C send money (money-moving, opt-in).
  - `reversal` — refund / reverse (money-moving, opt-in).
  - `mint_api_key` — mint an API key (elevated, opt-in; session-token authed).
- Stripe-style tool allowlisting via `--tools=` / `PAYLOD_TOOLS`
  (names, categories, `all`, `default`). Safe defaults: read + local + qr +
  sandbox. Money-moving and elevated tools require explicit opt-in.
- `server.json` + `mcpName` prepared for the official MCP Registry.
- Vitest test suite (config, allowlist, pure decoder, client request building,
  tool validation, server registration) and GitHub Actions CI (Node 18/20/22).
