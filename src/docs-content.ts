/**
 * paylod documentation, distilled for agents.
 *
 * SOURCE OF TRUTH — every statement here is taken from paylod's own published docs and
 * verified backend source. Do NOT add API behaviour that is not in one of these:
 *   - web/app/(public)/docs/page.tsx        (API reference: base URL, auth, /collect, /status,
 *                                            webhooks, secure-integration rules, beyond-STK surface)
 *   - web/app/(public)/docs/errors/page.tsx (error reference → mirrored by `decode_mpesa_error`)
 *   - web/app/(public)/docs/mcp/page.tsx    (MCP/agent surface)
 *   - supabase/functions/*                  (the endpoints themselves)
 *
 * Served offline by the `get_docs` tool: zero network calls, so an agent can read the manual
 * without leaving the tool surface.
 */

export interface DocTopic {
  readonly id: string;
  readonly title: string;
  /** Lowercase words that should route a free-text question to this topic. */
  readonly keywords: readonly string[];
  readonly body: string;
}

export const DOC_TOPICS: readonly DocTopic[] = [
  {
    id: "integration",
    title: "How to integrate M-Pesa with paylod (end-to-end)",
    keywords: [
      "integrate", "integration", "setup", "start", "quickstart", "getting", "started",
      "how", "daraja", "mpesa", "m-pesa", "onboard", "begin", "guide",
    ],
    body: `# Integrating M-Pesa with paylod

paylod holds your Daraja credentials, hosts the M-Pesa callback receiver, and gives you two
plain HTTPS endpoints. You never write callback-handling code and never put a shortcode,
passkey, or Daraja credential in a request.

## The full setup, in order

1. **Have an application.**
   - \`list_applications\` — if it returns anything, you are already onboarded.
   - Brand-new user → \`create_app\` (creates org + first app). Existing user → \`create_application\`
     (adds an app to an org you already have). \`create_app\` 409s "already onboarded" if you have an org.
2. **Store your Daraja credentials** → \`set_credentials\` (consumerKey, consumerSecret, passkey,
   shortcode, and partyB for a Till). They are AES-GCM-encrypted at rest and never returned.
3. **Get your callback URL** → \`get_callback_url\`. **Paste this into the Safaricom Daraja portal**
   as the CallbackURL / ResultURL / ValidationURL / ConfirmationURL of your Daraja app. This step is
   what makes M-Pesa able to tell paylod the payment result. Without it, payments never resolve.
4. **Mint an API key** → \`mint_key\`. \`mp_test_…\` (sandbox) / \`mp_live_…\` (production). Shown once.
   Your server uses it as \`Authorization: Bearer …\`. The MCP server itself never needs one.
5. **Optionally register a webhook** → \`configure_webhook\` with your own HTTPS URL, so paylod pushes
   the settled result to you. Skip it and poll \`get_payment_status\` instead — every payment is
   recorded either way.
6. **Take a payment** → \`request_stk_push\` (POST /collect). The customer gets the M-Pesa PIN prompt;
   funds settle to your till.
7. **Read the result** → \`get_payment_status\` (GET /status/:id), or the webhook. Decode any non-zero
   resultCode with \`decode_mpesa_error\`.

## What you do NOT have to do
- No callback endpoint of your own (paylod hosts it).
- No shortcode/passkey/credentials over the wire — the API key alone identifies the application
  and environment.
- No Daraja OAuth token juggling.`,
  },
  {
    id: "callback-url",
    title: "The M-Pesa callback URL (Daraja portal setup)",
    keywords: [
      "callback", "callbackurl", "resulturl", "validationurl", "confirmationurl", "portal",
      "url", "token", "cbk", "safaricom", "daraja",
    ],
    body: `# The callback URL

Safaricom delivers every payment RESULT to a callback URL. paylod hosts that receiver for you.

- Get it with **\`get_callback_url\`** ({ applicationId, env }). It returns
  \`https://<origin>/functions/v1/callback/cbk_<random>\`.
- **Paste it into the Safaricom Daraja portal** — it is the CallbackURL (STK Push), and also serves
  as the ResultURL / ValidationURL / ConfirmationURL where a Daraja product asks for one.
- There is exactly **one URL per (application, environment)**. Sandbox and production differ. It is
  minted on demand the first time you ask, and stable afterwards.

## Treat it as a secret
The random \`cbk_…\` token in the path both ROUTES and AUTHENTICATES the callback (Safaricom does not
sign callbacks). Anyone holding the URL could POST a forged result. Keep it server-side: never log
it, never expose it client-side. That is why reading it requires the \`paylod:apps.write\` scope and a
write role — it is a credential, not a public identifier.`,
  },
  {
    id: "auth",
    title: "Authentication, base URL, and idempotency",
    keywords: [
      "auth", "authentication", "api", "key", "bearer", "token", "base", "url", "idempotency",
      "idempotent", "mp_live", "mp_test", "429", "rate", "limit",
    ],
    body: `# Authentication

- Every REST request: \`Authorization: Bearer mp_live_… | mp_test_…\`. Mint with \`mint_key\`.
- Keys are **environment-scoped**: \`mp_test_…\` = sandbox, \`mp_live_…\` = production. The key
  determines which application (till/paybill) and environment the request runs against — so you
  never send a shortcode or credentials over the wire.
- All REST paths live under \`/functions/v1\` on your paylod origin.
- Keys are **server-only secrets**. A key embedded in a browser or mobile app is fully compromised.

# Idempotency

Pass an \`Idempotency-Key\` header (or \`idempotencyKey\` in the body) on \`/collect\`. A retry with the
same key AND an identical body replays the original response instead of triggering a second STK
push. Reusing a key with a *different* body is rejected with **409**. Use one key per logical order.

# Rate limits

\`/collect\` is rate-limited per API key and per phone number. Expect **429 Too Many Requests** under
bursts, and back off — retrying with the same Idempotency-Key is safe.`,
  },
  {
    id: "payments",
    title: "Taking a payment: /collect and /status",
    keywords: [
      "collect", "stk", "push", "payment", "pay", "charge", "status", "poll", "amount", "phone",
      "checkout", "receipt",
    ],
    body: `# POST /functions/v1/collect — STK Push

Initiates an STK Push: the customer gets an M-Pesa prompt on their handset and funds settle to your
till. Returns immediately; the final result arrives via the hosted callback.

Body: \`amount\` (integer, whole KES 1–150000 — M-Pesa rejects decimals), \`phone\` (e.g.
254712345678), \`accountReference\`, \`description\`, \`metadata\` (free-form object).
Headers: \`Authorization\` (required), \`Idempotency-Key\` (recommended).

    HTTP/1.1 202 Accepted
    { "paymentId": "e69e5c00-…", "status": "pending", "checkoutRequestId": "ws_CO_…" }

MCP tool: \`request_stk_push\`.

# GET /functions/v1/status/:id — read the result

    HTTP/1.1 200 OK
    { "id": "e69e5c00-…", "status": "success", "mpesaReceipt": "UG1F3A1U7J",
      "resultCode": 0, "resultDesc": "The service request is processed successfully." }

MCP tool: \`get_payment_status\`. Poll this if you do not want to run a webhook receiver.`,
  },
  {
    id: "webhooks",
    title: "Webhooks: signed delivery of the settled result",
    keywords: [
      "webhook", "webhooks", "signature", "hmac", "signing", "secret", "event", "delivery",
      "verify", "endpoint",
    ],
    body: `# Webhooks

Optional push delivery. Register an endpoint (\`configure_webhook\`) and paylod POSTs a signed event
the moment a payment settles. If you'd rather not run a receiver, skip webhooks and poll
\`get_payment_status\` — every payment is recorded either way.

## Delivery headers
- \`x-webhook-event\` — \`payment.success\` or \`payment.failed\`
- \`x-webhook-id\` — unique delivery id; use it to dedupe retries
- \`x-webhook-signature\` — \`t=<unix>,v1=<hex>\`

## Verifying
The signature is an **HMAC-SHA256 over \`\${t}.\${rawBody}\`**, keyed by the endpoint's signing secret
(shown once when you add the endpoint). Compute it over the **raw** body, constant-time compare
against \`v1\`, and reject deliveries whose \`t\` is older than ~5 minutes to blunt replay.
Respond \`2xx\` to acknowledge; a non-2xx is retried with backoff.

## Body
\`{ type, created, data: { paymentId, applicationId, env, status, amount, phone, accountRef,
mpesaReceipt, checkoutRequestId, resultCode, resultDesc } }\`

The webhook always carries the **TRUE settled amount** — check it before fulfilling.`,
  },
  {
    id: "security",
    title: "Secure integration — the six rules",
    keywords: [
      "security", "secure", "safe", "amount", "tamper", "proxy", "undercut", "fulfil", "fulfill",
      "best", "practice",
    ],
    body: `# Secure integration

Could a payer intercept your checkout in a proxy and lower the amount? Under a correct integration,
no. The API key that calls \`/collect\` authenticates **you, the merchant** — not the payer. Only
\`amount\` and \`phone\` come from the request body; your shortcode, passkey and Daraja credentials are
pulled from encrypted storage server-side and never travel over the wire.

The one way to be undercut is to hand the payer control of BOTH the key and the amount — i.e. call
\`/collect\` straight from a browser or mobile app with a client-supplied amount.

## The six rules
1. **Keys are server-only secrets.** Never in a browser, mobile app, or any client.
2. **Your server owns the amount.** Derive it from your own order/price record; never pass a
   client-supplied amount straight through.
3. **Verify, then check the amount, before fulfilling.** Verify \`x-webhook-signature\` first, then
   confirm \`data.amount === yourExpectedOrderAmount\` AND \`status === "success"\`. Never fulfil on
   \`status\` alone.
4. **Treat callback/mint tokens as secrets.** Don't log them or expose them client-side.
5. **One Idempotency-Key per logical order.** Retries then never double-charge.
6. **Expect rate limits.** Handle \`429\` and back off.`,
  },
  {
    id: "errors",
    title: "M-Pesa error and result codes",
    keywords: [
      "error", "errors", "code", "resultcode", "failed", "failure", "decode", "1032", "2001",
      "1037", "1001", "insufficient", "cancelled", "pin", "timeout", "debug",
    ],
    body: `# Error codes

Every Safaricom M-Pesa result/error code is decoded by the **\`decode_mpesa_error\`** tool — a pure,
offline lookup (no network, no key). Call it on ANY non-zero \`resultCode\`.

It returns \`{ code, title, cause, fix, category, retryable, customerMessage }\`:
- \`category\` — who is at fault: customer | balance | limit | credentials | network | mpesa_system |
  success | **pending**
- \`retryable\` — **SAFE TO CHARGE AGAIN** (we know no money moved). It does NOT mean "the user could
  try again". If \`retryable\` is false, do not re-charge: the payment may still be live, and charging
  again would double-charge a real customer.
- \`customerMessage\` — a friendly line you can show the payer

## \`4999\` is NOT a failure

\`4999\` ("still under processing") and \`500.001.1001\` mean the STK prompt is **still live on the
customer's phone and they have not entered their PIN yet**. The payment can still succeed. Decode
them as \`category: "pending"\`, \`retryable: false\` — keep polling \`get_payment_status\`, do not show
the customer a failure, and do not retry (a retry sends a second prompt and can double-charge).

Frequently seen: \`0\` success · \`1\` insufficient balance · \`1001\` a transaction is already in
process · \`1019\` transaction expired · \`1032\` request cancelled by the user · \`1037\` timeout, user
could not be reached · \`2001\` **wrong M-Pesa PIN** (a customer error, NOT a credentials problem) ·
\`4999\`/\`500.001.1001\` **still waiting for the customer's PIN — pending, not failed** ·
\`1025\`/\`9999\` error sending push / system error · \`17\`/\`26\` M-Pesa system busy.

The full searchable reference is at /docs/errors.`,
  },
  {
    id: "endpoints",
    title: "Beyond STK Push — the rest of the Daraja surface",
    keywords: [
      "qr", "c2b", "b2c", "payout", "reversal", "refund", "balance", "transaction", "register",
      "simulate", "sandbox", "endpoints", "reference",
    ],
    body: `# Beyond STK Push

The same hosted, credential-abstracted model backs the rest of the Daraja surface. All live under
\`/functions/v1\` and authenticate with the same bearer API key.

| What | REST | MCP tool |
|---|---|---|
| STK Push (money in) | POST /collect | \`request_stk_push\` |
| Payment status | GET /status/:id | \`get_payment_status\` |
| Dynamic QR | POST /qr-generate | \`generate_qr\` |
| C2B register URLs | POST /c2b-register | \`register_c2b\` |
| Transaction status | POST /transaction-status | \`get_transaction_status\` |
| Account balance | POST /account-balance | \`get_account_balance\` |
| B2C payout (money out) | POST /payout | \`payout\` |
| Reversal / refund | POST /reversal | \`reversal\` |

Sandbox helpers: \`simulate_test_payment\` and \`simulate_outcome\` drive a payment through success or
a specific failure without touching Safaricom — use them to test your webhook/fulfilment path.

Management: \`list_applications\`, \`create_app\` (first-time onboarding only), \`create_application\`
(every app after that), \`get_callback_url\`, \`set_credentials\`, \`mint_key\`, \`configure_webhook\`,
\`list_webhooks\`.`,
  },
];

/** Topic ids, for the tool's enum + the "no match" hint. */
export const DOC_TOPIC_IDS: readonly string[] = DOC_TOPICS.map((t) => t.id);

function topicById(id: string): DocTopic | undefined {
  return DOC_TOPICS.find((t) => t.id === id);
}

/** Score a topic against a free-text question (keyword + title overlap). */
function score(topic: DocTopic, terms: readonly string[]): number {
  let n = 0;
  const title = topic.title.toLowerCase();
  for (const term of terms) {
    if (topic.keywords.includes(term)) n += 2;
    if (title.includes(term)) n += 1;
  }
  return n;
}

export interface DocsAnswer {
  readonly topic: string;
  readonly title: string;
  readonly content: string;
  readonly availableTopics: readonly string[];
}

/**
 * Resolve a docs request. An explicit `topic` wins; otherwise a free-text `query` is keyword-
 * matched. With neither (or no match) we return the integration overview, which is the single
 * most useful answer to "how do I integrate M-Pesa with paylod".
 */
export function lookupDocs(opts: { topic?: string; query?: string }): DocsAnswer {
  const explicit = opts.topic ? topicById(opts.topic) : undefined;
  let chosen = explicit;

  if (!chosen && opts.query) {
    const terms = opts.query
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter((t) => t.length > 1);
    const ranked = DOC_TOPICS.map((t) => ({ t, s: score(t, terms) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);
    chosen = ranked[0]?.t;
  }

  const topic = chosen ?? topicById("integration")!;
  return {
    topic: topic.id,
    title: topic.title,
    content: topic.body,
    availableTopics: DOC_TOPIC_IDS,
  };
}
