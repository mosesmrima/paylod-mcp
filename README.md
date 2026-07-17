# @paylod/mcp

**Point your AI agent at M-Pesa.** The [MCP](https://modelcontextprotocol.io)
server for [paylod](https://paylod.dev) — the hosted M-Pesa Backend-as-a-Service.
Give Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Codex, or any MCP
client one URL and it can set up an M-Pesa integration, request STK pushes, read
payment status, decode cryptic Daraja errors, and run sandbox simulations — no
backend, no Daraja boilerplate.

This is a **remote, OAuth-authenticated** server. It is **v0.2.0** — the old
v0.1.0 stdio + `PAYLOD_API_KEY` model is gone. Nobody pastes an API key into a
client config anymore: the agent gets a **scoped OAuth token**, never your paylod
API key and never your Daraja credentials.

MIT-licensed. Built on the official `@modelcontextprotocol/sdk` with Zod-validated
inputs.

---

## You probably don't install this

paylod hosts the server for you. There is **nothing to install and no key to
paste** — you give your client one URL and approve scopes in your browser once:

```text
https://mcp.paylod.dev/mcp
```

Transport: `streamable-http`. Auth: OAuth 2.1 (authorization code + PKCE, with
Dynamic Client Registration) against `https://paylod.dev/oauth`. Full setup guide:
**https://paylod.dev/docs/mcp**.

### Add it to your client

**Claude Code** — one command, then `/mcp` → **paylod** to authenticate:

```bash
claude mcp add --transport http --scope user paylod https://mcp.paylod.dev/mcp
```

**Claude Desktop** — **Settings → Connectors → Add custom connector**, paste the
URL, **Connect**. Leave client-ID/secret blank (DCR registers your client for you).

**Cursor** — `~/.cursor/mcp.json` (or per-project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "paylod": { "url": "https://mcp.paylod.dev/mcp" }
  }
}
```

**VS Code** — `.vscode/mcp.json` (top-level key is `servers`):

```json
{
  "servers": {
    "paylod": { "type": "http", "url": "https://mcp.paylod.dev/mcp" }
  }
}
```

**Windsurf** — `~/.codeium/windsurf/mcp_config.json` uses `serverUrl`:

```json
{
  "mcpServers": {
    "paylod": { "serverUrl": "https://mcp.paylod.dev/mcp" }
  }
}
```

**Codex CLI** — add to `~/.codex/config.toml`, then `codex mcp login paylod`:

```toml
[mcp_servers.paylod]
url = "https://mcp.paylod.dev/mcp"
```

**stdio-only clients** — bridge with `mcp-remote` (handles the OAuth flow itself):

```json
{
  "mcpServers": {
    "paylod": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.paylod.dev/mcp"]
    }
  }
}
```

### First thing to try

`decode_mpesa_error` is pure and offline — no scopes, no credentials, no network —
so it's the ideal smoke test before you grant anything. Ask your agent:

> What does M-Pesa error 2001 mean?

A good answer comes back with the cause (wrong PIN), the fix, and a
customer-facing message — that's the tool, not the model guessing.

---

## Tools

Every call is authorized by the OAuth access token and gated on the scope shown
next to it — a token without the scope cannot invoke the tool.

### Management — set the integration up

| Tool | Scope | What it does |
| --- | --- | --- |
| `create_app` | `paylod:apps.write` | First-run onboarding: create your organization and its first application (paybill or till). Returns the applicationId, callback URL, and a one-time API key. |
| `create_application` | `paylod:apps.write` | Add another application to an organization you already have. |
| `get_callback_url` | `paylod:apps.write` | Get the hosted M-Pesa callback URL to paste into the Daraja portal. Treat it as a secret. |
| `set_credentials` | `paylod:credentials.write` | Store or rotate the Daraja consumer key, secret, shortcode, passkey. Write-only — never read back. |
| `mint_key` | `paylod:keys.mint` | Mint a paylod API key (`mp_test_…` / `mp_live_…`) for your own backend. Returned once. |
| `list_keys` | `paylod:keys.mint` | List an application's API keys (prefixes only — the secret is never read back). |
| `revoke_key` | `paylod:keys.mint` | Revoke an API key by id. |
| `configure_webhook` | `paylod:webhooks.write` | Create or update a signed webhook endpoint. |
| `list_webhooks` | `paylod:webhooks.write` | List an application's webhook endpoints. |
| `list_applications` | `paylod:team.read` | List the applications you can access, with env + config state. |
| `authenticate` | — | Show who the token belongs to and which scopes were granted. |

### Runtime — move and read money

| Tool | Scope | What it does |
| --- | --- | --- |
| `request_stk_push` | `paylod:payments.collect` | Send an STK Push. Accepts an idempotency key; an interrupted call spends the key and returns `409` *indeterminate* — read status, then retry with a **new** key. |
| `get_payment_status` | `paylod:payments.read` | Look up one payment by id. If pending, runs a live STK query and settles on the spot. |
| `generate_qr` | `paylod:payments.collect` | Generate an M-Pesa QR (base64 PNG). Stateless — no money moves. |
| `register_c2b` | `paylod:payments.collect` | Register C2B validation/confirmation URLs for paybill payments made outside your app. |
| `get_account_balance` | `paylod:payments.read` | Query M-Pesa account balance. Async — returns a queryId; result arrives on your callback. |
| `get_transaction_status` | `paylod:payments.read` | Query a transaction by receipt. Async, same callback pattern. |
| `payout` | `paylod:payments.payout` | Send money out (B2C). Irreversible on a live application. |
| `reversal` | `paylod:payments.payout` | Reverse or refund a transaction. |

### Sandbox & offline

| Tool | Scope | What it does |
| --- | --- | --- |
| `simulate_test_payment` | `paylod:payments.simulate` | Create a simulated collection in sandbox — no handset, no real money. |
| `simulate_outcome` | `paylod:payments.simulate` | Force a simulated payment to succeed or fail, to exercise failure paths. |
| `decode_mpesa_error` | — | Decode any Safaricom result code / Daraja error into cause, fix, and a customer-facing message. Pure and offline. |
| `get_docs` | — | Fetch paylod documentation by topic. Pure/local — no scope, no token, no network. |

> **The tools set the integration up and inspect it — they are not your runtime
> integration.** Your application code should call the [Node SDK](https://paylod.dev/docs/sdk)
> (`@paylod/node`), not `request_stk_push`, at runtime. MCP is a second front
> door onto the same platform your backend talks to at `/functions/v1`.

> **`4999` is a *pending* payment, not a failed one** — the customer hasn't
> entered their PIN yet. It is not retryable: a second `request_stk_push` sends a
> second prompt and can double-charge. Keep polling `get_payment_status`.

---

## How the OAuth flow works

Your client hits the server URL with no token and gets a `401` carrying a
`WWW-Authenticate` header pointing at the protected-resource metadata:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://mcp.paylod.dev/.well-known/oauth-protected-resource"
```

From there the client discovers the authorization server at
`https://paylod.dev/oauth`, registers itself dynamically, and opens your browser.
You sign in to paylod and land on a consent screen listing exactly which
capabilities the agent is asking for — one scope per capability, each with its own
checkbox.

The three high-risk scopes — `payments.payout` (send money out),
`credentials.write` (write your Daraja keys), and `keys.mint` (mint API keys) —
are broken into their own flagged group. Every requested scope is **checked by
default**; you untick what you don't want, and only what stays ticked is granted.
Untick those three and the agent cannot call `payout`, `reversal`,
`set_credentials`, or `mint_key` at all — **the server enforces the scope**, so
it's not a prompt you have to trust the model to respect.

The access token is bound to this server as its audience, held by your client, and
never pasted into the conversation. Your Daraja consumer key and secret are
write-only — no tool reads them back.

---

## Self-hosting the server

You only need this if you're running your own paylod stack. The npm binary **is**
the server — it listens over HTTP and expects a TLS-terminating reverse proxy
(Caddy) in front at `https://<host>/mcp`. It is OAuth-only: there is no stdio
transport and no API-key mode.

```bash
npm install -g @paylod/mcp
paylod-mcp --port=8787
```

| Flag | Env | Default |
| --- | --- | --- |
| `--port=<n>` | `MCP_PORT` | `8787` |
| `--base-url=<url>` | `PAYLOD_BASE_URL` | `https://paylod.dev/functions/v1` |
| `--canonical-uri=<url>` | `MCP_CANONICAL_URI` | `https://mcp.paylod.dev/mcp` |
| `--as-issuer=<url>` | `AS_ISSUER` | `https://paylod.dev/oauth` |
| `--as-jwks-uri=<url>` | `AS_JWKS_URI` | `https://paylod.dev/oauth/.well-known/jwks.json` |
| `--timeout=<ms>` | — | `30000` |

All diagnostics go to stderr. The server validates each incoming token's
signature (ES256) and audience against the authorization server's JWKS, and gates
every tool on the token's scopes.

---

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit (strict)
npm test            # vitest (mock fetch, no live network)
npm run build       # tsup → dist/
```

`prepublishOnly` runs `docs:check && typecheck && build && test` — the docs bundle
is generated from `mpesa/web/content/docs/**` and must stay in sync. Adding a
tool? See [AGENTS.md](./AGENTS.md).

---

## Links

- paylod — https://paylod.dev
- MCP setup guide — https://paylod.dev/docs/mcp
- Model Context Protocol — https://modelcontextprotocol.io

## License

MIT © 2026 paylod / Moses Mrima. See [LICENSE](./LICENSE).
