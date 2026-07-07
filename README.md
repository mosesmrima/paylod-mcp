# @paylod/mcp

**Point your AI agent at M-Pesa.** An [MCP](https://modelcontextprotocol.io)
server for [paylod](https://paylod.dev) — the hosted M-Pesa Backend-as-a-Service.
Give Claude Desktop, Cursor, Windsurf, or any MCP client an API key and it can
request STK pushes, check payment status, generate QR codes, decode cryptic
M-Pesa errors, and run sandbox simulations — no backend, no Daraja boilerplate.

MIT-licensed. Built on the official `@modelcontextprotocol/sdk` with Zod-validated
inputs. Zero heavy dependencies.

---

## The 60-second pitch

```jsonc
// Claude Desktop → Settings → Developer → Edit Config
{
  "mcpServers": {
    "paylod": {
      "command": "npx",
      "args": ["-y", "@paylod/mcp"],
      "env": { "PAYLOD_API_KEY": "mp_test_your_key_here" }
    }
  }
}
```

Restart Claude and ask:

> "Charge 250 shillings to 0712345678 for order #42, then tell me when it's paid."

Claude calls `request_stk_push`, the customer approves on their phone, and Claude
polls `get_payment_status` until it settles. If it fails, Claude calls
`decode_mpesa_error` and explains exactly why in plain English.

Start with a `mp_test_` key — everything runs in sandbox and **no real money
moves**.

---

## Install & configure

Runs via `npx` (no install needed), or install globally:

```bash
npm install -g @paylod/mcp
```

Get a merchant API key from your [paylod dashboard](https://paylod.dev):
`mp_test_...` for sandbox, `mp_live_...` for production.

### Claude Desktop

Config file:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "paylod": {
      "command": "npx",
      "args": ["-y", "@paylod/mcp"],
      "env": { "PAYLOD_API_KEY": "mp_test_your_key_here" }
    }
  }
}
```

To enable a money-moving tool, opt in explicitly:

```jsonc
{
  "mcpServers": {
    "paylod": {
      "command": "npx",
      "args": ["-y", "@paylod/mcp", "--tools=default,request_stk_push"],
      "env": { "PAYLOD_API_KEY": "mp_test_your_key_here" }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json` (or a project `.cursor/mcp.json`):

```jsonc
{
  "mcpServers": {
    "paylod": {
      "command": "npx",
      "args": ["-y", "@paylod/mcp"],
      "env": { "PAYLOD_API_KEY": "mp_test_your_key_here" }
    }
  }
}
```

Windsurf, Cline, and other MCP clients use the same `command`/`args`/`env` shape.

### CLI

```bash
npx -y @paylod/mcp --api-key=mp_test_xxx
# or
PAYLOD_API_KEY=mp_test_xxx paylod-mcp --help
```

| Flag | Env | Default |
| --- | --- | --- |
| `--api-key=<key>` | `PAYLOD_API_KEY` | _(required)_ |
| `--base-url=<url>` | `PAYLOD_BASE_URL` | `https://paylod.dev/functions/v1` |
| `--tools=<list>` | `PAYLOD_TOOLS` | read + local + qr + sandbox |
| `--session-token=<jwt>` | `PAYLOD_SESSION_TOKEN` | _(none)_ |
| `--timeout=<ms>` | `PAYLOD_TIMEOUT_MS` | `30000` |

---

## Tools

| Tool | Endpoint | Category | Default? | Auth | Notes |
| --- | --- | --- | :---: | --- | --- |
| `get_payment_status` | `GET /status/:id` | read | ✅ | API key | Look up one payment by id. Runs a lazy STK query + settle. |
| `get_account_balance` | `POST /account-balance` | read | ✅ | API key | Async — returns a `queryId`; balance arrives on the merchant callback. |
| `get_transaction_status` | `POST /transaction-status` | read | ✅ | API key | Async — same callback pattern. Needs initiator creds. |
| `decode_mpesa_error` | _(none — pure)_ | local | ✅ | — | Offline Daraja error decoder. No network, no key needed. |
| `generate_qr` | `POST /qr-generate` | qr | ✅ | API key | Stateless QR PNG (base64). No money moves, no ledger row. |
| `simulate_test_payment` | `POST /simulate/collect` | sandbox | ✅* | **session JWT** | Create a simulated collection. *Needs `PAYLOD_SESSION_TOKEN` — see below. |
| `simulate_outcome` | `POST /simulate/outcome` | sandbox | ✅* | **session JWT** | Force a simulated payment to approve / fail. *Needs session token. |
| `request_stk_push` | `POST /collect` | collect | ⛔ opt-in | API key | STK push (collect). Moves money on a live key. Pass an `idempotencyKey`. |
| `payout` | `POST /payout` | payout | ⛔ opt-in | API key | B2C send money. Irreversible on live. Needs initiator creds. |
| `reversal` | `POST /reversal` | reversal | ⛔ opt-in | API key | Refund / reverse. Needs initiator creds. |
| `mint_api_key` | `POST /mint-key` | mint | ⛔ opt-in | **session JWT** | Mint a new API key. Elevated. Needs session token. |

Async tools (`get_account_balance`, `get_transaction_status`, `payout`,
`reversal`) return an acknowledgement (`queryId`/`disbursementId`) immediately;
the final result is delivered to the merchant's paylod webhook/results callback,
not returned by the tool call.

> **No list-payments tool.** paylod exposes no endpoint that enumerates payments,
> so this server can only look up a payment you already have the `paymentId` for.
> A read/list endpoint on the platform would be needed to add a `list_payments`
> tool — it is intentionally **not** faked here.

---

## Tool allowlisting

Like Stripe's agent toolkit, you choose exactly which tools are exposed via
`--tools=` (or `PAYLOD_TOOLS`). The value is a comma list of **tool names** and/or
**category names**, or the keywords `all` / `default`.

- **Default (unset):** `read`, `local`, `qr`, `sandbox` — safe, non-money-moving.
- **Opt-in only:** `collect`, `payout`, `reversal`, `mint` (money-moving/elevated).

```bash
# Just the safe defaults (implicit)
paylod-mcp --api-key=mp_test_xxx

# Defaults plus STK push
paylod-mcp --api-key=mp_test_xxx --tools=default,request_stk_push

# Only balance + status reads
paylod-mcp --api-key=mp_test_xxx --tools=read

# Everything (use with care)
paylod-mcp --api-key=mp_live_xxx --tools=all
```

Categories: `read`, `local`, `qr`, `sandbox`, `collect`, `payout`, `reversal`,
`mint`.

---

## Security

- **Money-moving is opt-in.** `request_stk_push`, `payout`, `reversal`, and
  `mint_api_key` are never enabled unless you list them (by name or category).
- **Test-mode-safe by default.** An `mp_test_` key runs entirely in paylod's
  sandbox — even money-moving tools move no real funds. Develop and let agents
  experiment with a `mp_test_` key; switch to `mp_live_` only when you mean it.
- **Idempotency.** `request_stk_push` accepts an `idempotencyKey` (sent as the
  `Idempotency-Key` header) so a retrying agent never double-charges.
- **Secrets stay in env.** The key is read from `PAYLOD_API_KEY` / `--api-key`
  and is never logged. Keep it out of source control.
- **stdio hygiene.** All diagnostics go to stderr; stdout is the MCP transport.

---

## Sandbox simulator (known backend caveat)

The `simulate_test_payment` and `simulate_outcome` tools — and `mint_api_key` —
map to paylod endpoints that are currently authenticated by a **dashboard session
JWT + org membership**, _not_ by a merchant API key. So an agent holding only an
`mp_test_` API key **cannot** drive them yet: these tools require
`PAYLOD_SESSION_TOKEN` to be set to a valid Supabase user access token, and will
otherwise return a clear `401` telling you so (they are never silently broken).

**To make the simulator fully agent-native**, paylod should add an
**API-key-authed simulate path** — ideally **test-mode-key-only** — e.g.:

- Accept `Authorization: Bearer mp_test_...` on `POST /simulate/collect` and
  `POST /simulate/outcome`, resolving the tenant via `resolveByApiKey` (same as
  `/collect`).
- Reject `mp_live_` keys outright (sandbox simulator is test-mode only).
- Derive `applicationId`/`organizationId` from the resolved key instead of the
  body, dropping the session/membership check for that path.

With that one change, the two `simulate_*` tools work end-to-end with just a
`mp_test_` key and no session token — no other client changes needed.

---

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit (strict)
npm test            # vitest (mock fetch, no live network)
npm run build       # tsup → dist/
```

Adding a tool? See [AGENTS.md](./AGENTS.md).

---

## Links

- paylod — https://paylod.dev
- Daraja SDK (MIT) — https://github.com/paylod/daraja
- Model Context Protocol — https://modelcontextprotocol.io
- MCP Registry — https://registry.modelcontextprotocol.io

## License

MIT © 2026 paylod / Moses Mrima. See [LICENSE](./LICENSE).
