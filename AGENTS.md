# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## What this is

`@paylod/mcp` is a Model Context Protocol (MCP) server that exposes paylod's
M-Pesa BaaS as tools an AI assistant can call. It talks to the paylod edge
functions at `https://paylod.dev/functions/v1/*` over HTTPS, authenticated by a
merchant API key.

## Project layout

```
src/
  index.ts          # stdio bin entrypoint (arg parsing + bootstrap)
  config.ts         # CLI/env → Config (API key, base URL, tool selection)
  client.ts         # PaylodClient — thin fetch wrapper (auth, idempotency, timeout)
  errors.ts         # PaylodApiError / PaylodNetworkError + message formatting
  error-catalog.ts  # vendored Daraja error catalog (pure decoder, no network)
  allowlist.ts      # Stripe-style tool selection + gating
  server.ts         # builds the McpServer and registers enabled tools
  tools/
    types.ts        # ToolDef contract + categories
    *.ts            # one file per tool (or pair, e.g. simulate)
    index.ts        # ALL_TOOLS registry
test/               # vitest specs (mock fetch, no live network)
```

## Conventions

- TypeScript strict, ESM (`"type": "module"`), Node >= 18. Import with `.js`
  extensions (NodeNext resolution).
- Every tool is a `ToolDef`: a Zod `inputSchema` (raw shape), a rich
  `description` (agents read it), a `category` (drives the allowlist), and a
  `handler(client, args)` returning JSON-serializable data.
- Validate every input with Zod inside the handler. Never trust args.
- Do not `console.log` — on stdio, stdout is the MCP transport. Diagnostics go to
  stderr only.
- Keep files small and focused. New endpoint → new file in `src/tools/`, then add
  it to `ALL_TOOLS` with the right category.

## Adding a tool

1. Confirm the real endpoint contract (path, method, body, response, AUTH model)
   against the paylod platform before wiring anything. Do not invent shapes.
2. Create `src/tools/<name>.ts` exporting a `ToolDef`.
3. Pick a category. Money-moving or elevated? Use `collect`/`payout`/`reversal`/
   `mint` so it is opt-in, not a default.
4. Register it in `src/tools/index.ts`.
5. Add tests in `test/` (input validation + request building via mock fetch).

## Auth models (important)

- **API-key tools** (default): `collect`, `status`, `account-balance`,
  `transaction-status`, `payout`, `reversal`, `qr-generate`. Bearer the merchant
  key.
- **Session-JWT tools**: `simulate_*` and `mint_api_key` are authenticated by a
  paylod **dashboard session JWT + org membership**, NOT an API key. They require
  `PAYLOD_SESSION_TOKEN`. This is a known limitation — see README "Sandbox
  simulator" for the backend change that would let a test-mode API key drive the
  simulator.

## Verify before you commit

```bash
npm install
npm run typecheck
npm test
npm run build
```

## How an assistant should use the tools at runtime

- Always pass a stable `idempotencyKey` to `request_stk_push` so retries never
  double-charge.
- Collections settle asynchronously — after `request_stk_push`, poll
  `get_payment_status` (or rely on the merchant's webhook). There is **no
  list-payments endpoint**, so keep the returned `paymentId`.
- On any non-zero `resultCode`, call `decode_mpesa_error` for a human-readable
  cause/fix and a customer-facing message.
- Money-moving tools move real funds only with an `mp_live_` key; an `mp_test_`
  key is sandbox and safe.
