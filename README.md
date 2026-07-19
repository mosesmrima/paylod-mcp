# @paylod/mcp

**Connect your AI agent to M-Pesa.** This package is the
[MCP](https://modelcontextprotocol.io) server for [paylod](https://paylod.dev),
the hosted M-Pesa Backend-as-a-Service. Give Claude Code, Claude Desktop, Cursor,
VS Code, Windsurf, Codex, or any other MCP client one URL. The client can then
set up an M-Pesa integration, send STK pushes, read payment status, decode Daraja
result codes, and run sandbox simulations. You write no backend code and no
Daraja boilerplate.

This server is remote, and it is OAuth-authenticated. It is **v0.2.0** — the old
v0.1.0 stdio + `PAYLOD_API_KEY` model is gone. You do not paste an API key into a
client config. The agent receives a **scoped OAuth token**. The agent never
receives your paylod API key, and it never receives your Daraja credentials.

The licence is MIT. The server uses the official `@modelcontextprotocol/sdk`, and
Zod validates every input.

---

## You do not install this server

paylod hosts the server for you. You install nothing, and you paste no key. Give
your client this one URL. Then approve the scopes in your browser one time:

```text
https://mcp.paylod.dev/mcp
```

The transport is `streamable-http`. The authentication is OAuth 2.1 against
`https://paylod.dev/oauth`. The flow is the authorization code flow with PKCE and
Dynamic Client Registration. Read the full setup guide at
**https://paylod.dev/docs/mcp**.

### Add the server to your client

**Claude Code** — run this one command. Then select `/mcp` → **paylod** to
authenticate:

```bash
claude mcp add --transport http --scope user paylod https://mcp.paylod.dev/mcp
```

**Claude Desktop** — open **Settings → Connectors → Add custom connector**. Paste
the URL, then select **Connect**. Leave the client ID and the client secret empty.
Dynamic Client Registration registers your client for you.

**Cursor** — add this block to `~/.cursor/mcp.json`, or to the per-project
`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "paylod": { "url": "https://mcp.paylod.dev/mcp" }
  }
}
```

**VS Code** — add this block to `.vscode/mcp.json`. The top-level key is `servers`:

```json
{
  "servers": {
    "paylod": { "type": "http", "url": "https://mcp.paylod.dev/mcp" }
  }
}
```

**Windsurf** — add this block to `~/.codeium/windsurf/mcp_config.json`. This client
uses `serverUrl`:

```json
{
  "mcpServers": {
    "paylod": { "serverUrl": "https://mcp.paylod.dev/mcp" }
  }
}
```

**Codex CLI** — add this block to `~/.codex/config.toml`. Then run
`codex mcp login paylod`:

```toml
[mcp_servers.paylod]
url = "https://mcp.paylod.dev/mcp"
```

**stdio-only clients** — use `mcp-remote` as a bridge. The bridge does the OAuth
flow for you:

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

### The first check to make

`decode_mpesa_error` is pure and offline. The tool needs no scope, no credentials,
and no network. Use the tool as a first check before you grant a scope. Ask your
agent this question:

> What does M-Pesa error 2001 mean?

A correct answer contains the cause, the fix, and a customer-facing message. The
cause of result code 2001 is a wrong PIN. The answer comes from the tool, and not
from the model.

---

## Tools

The OAuth access token authorizes every call. Each tool needs the scope in the
table. The server refuses the call if the token does not hold that scope.

> **These tools set up your integration, and they inspect your integration. These
> tools are not your runtime integration.** At runtime your application code must
> call the [Node SDK](https://paylod.dev/docs/sdk) (`@paylod/node`). Your
> application code must not call `request_stk_push`. MCP is a second entry point
> to the platform. Your server calls the same platform at `/functions/v1`.

### Management — set up the integration

| Tool | Scope | What it does |
| --- | --- | --- |
| `create_app` | `paylod:apps.write` | Create your organization and its first application, a paybill or a till. The tool returns the applicationId, the callback URL, and a one-time API key. |
| `create_application` | `paylod:apps.write` | Add another application to an organization that you have. |
| `get_callback_url` | `paylod:apps.write` | Get the hosted M-Pesa callback URL for the Daraja portal. Keep this URL secret. |
| `set_credentials` | `paylod:credentials.write` | Store or rotate the Daraja consumer key, the secret, the shortcode, and the passkey. The tool is write-only. No tool reads these values back. |
| `mint_key` | `paylod:keys.mint` | Mint a paylod API key (`mp_test_…` / `mp_live_…`) for your own server. The tool returns the key one time only. |
| `list_keys` | `paylod:keys.mint` | List the API keys of an application. The tool returns prefixes only, and it never returns the secret. |
| `revoke_key` | `paylod:keys.mint` | Revoke an API key by id. |
| `configure_webhook` | `paylod:webhooks.write` | Create or update a signed webhook endpoint. |
| `list_webhooks` | `paylod:webhooks.write` | List the webhook endpoints of an application. |
| `list_applications` | `paylod:team.read` | List the applications that you can access, with the environment and the configuration state. |
| `authenticate` | — | Show the owner of the token, and show the granted scopes. |

### Runtime — move and read money

> **Result code `4999` and result code `500.001.1001` mean that the STK push is
> live on the handset. The customer did not enter the PIN yet. The
> payment is IN FLIGHT, not failed. A pending payment is never retryable. A second
> collect call sends a second STK push, and it can charge the customer twice.**
> In MCP the collect call is `request_stk_push`. Poll `get_payment_status` until
> the payment settles.

| Tool | Scope | What it does |
| --- | --- | --- |
| `request_stk_push` | `paylod:payments.collect` | Send an STK push. Read the payment status before you retry. An interrupted call spends the idempotency key, and paylod answers `409` indeterminate. The `409` is a STOP signal, not a retry signal. If nothing occurred, start a new attempt with a NEW key. |
| `get_payment_status` | `paylod:payments.read` | Read one payment by id. If the payment is pending, the tool runs a live STK query and settles the payment. |
| `generate_qr` | `paylod:payments.collect` | Generate an M-Pesa QR code as a base64 PNG. The tool is stateless, and it moves no money. |
| `register_c2b` | `paylod:payments.collect` | Register the C2B validation URL and the C2B confirmation URL. These URLs receive paybill payments from outside your application. |
| `get_account_balance` | `paylod:payments.read` | Query the M-Pesa account balance. The tool is asynchronous. It returns a queryId, and the result arrives on your callback. |
| `get_transaction_status` | `paylod:payments.read` | Query a transaction by receipt. The tool is asynchronous, and it uses the same callback. |
| `payout` | `paylod:payments.payout` | Send money out with B2C. The transfer is irreversible on a live application. |
| `reversal` | `paylod:payments.payout` | Reverse or refund a transaction. |

### Sandbox and offline

| Tool | Scope | What it does |
| --- | --- | --- |
| `simulate_test_payment` | `paylod:payments.simulate` | Create a simulated collect call in sandbox. The simulator uses no handset and no real money. |
| `simulate_outcome` | `paylod:payments.simulate` | Force a simulated payment to succeed or to fail. Use this tool to test your failure paths. |
| `decode_mpesa_error` | — | Decode a Safaricom result code into a cause, a fix, and a customer-facing message. The tool is pure and offline. |
| `get_docs` | — | Fetch paylod documentation by topic. The tool is local. It needs no scope, no token, and no network. |

---

## How the OAuth flow works

Your client calls the server URL with no token. The server answers with a `401`.
The `401` carries a `WWW-Authenticate` header. This header contains the
protected-resource metadata URL:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://mcp.paylod.dev/.well-known/oauth-protected-resource"
```

The client then discovers the authorization server at `https://paylod.dev/oauth`.
The client registers itself dynamically, and it opens your browser. You sign in to
paylod. A consent screen then shows each capability that the agent requests. There
is one scope for each capability, and one checkbox for each scope.

The consent screen puts the three high-risk scopes in a separate flagged group.
These three scopes are `payments.payout` (send money out), `credentials.write`
(write your Daraja keys), and `keys.mint` (mint API keys). Every requested scope
is **checked by default**. Clear the checkbox of each scope that you do not want.
paylod grants only the scopes that stay checked.

If you clear these three scopes, the agent cannot call `payout`, `reversal`,
`set_credentials`, or `mint_key`. **The server enforces the scope.** The scope is
not a prompt that the model can ignore.

The audience of the access token is this server. Your client holds the token, and
the token never enters the conversation. Your Daraja consumer key and secret are
write-only. No tool reads them back.

---

## Self-hosting the server

Read this section only if you run your own paylod stack. The npm binary **is** the
server. The server listens over HTTP. Put a TLS-terminating reverse proxy such as
Caddy in front of the server at `https://<host>/mcp`. The server is OAuth-only.
There is no stdio transport, and there is no API-key mode.

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

The server writes all diagnostics to stderr. The server validates the ES256
signature and the audience of each token against the JWKS of the authorization
server. The server gates every tool on the scopes of the token.

---

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit (strict)
npm test            # vitest (mock fetch, no live network)
npm run build       # tsup → dist/
```

`prepublishOnly` runs `docs:check && typecheck && build && test`. The build
generates the docs bundle from `mpesa/web/content/docs/**`. The bundle must stay
in sync with the source documentation. Read [AGENTS.md](./AGENTS.md) before you
add a tool.

---

## Links

- paylod — https://paylod.dev
- MCP setup guide — https://paylod.dev/docs/mcp
- Model Context Protocol — https://modelcontextprotocol.io

## License

MIT © 2026 paylod / Moses Mrima. See [LICENSE](./LICENSE).
