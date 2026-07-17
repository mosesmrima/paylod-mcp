import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { phoneSchema } from "../phone.js";
import { MAX_ACCOUNT_REF_LEN, MAX_AMOUNT_KES, MAX_DESCRIPTION_LEN } from "../limits.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

export const collectInput = {
  applicationId: applicationIdField,
  env: envField,
  amount: z
    .number()
    .int("Amount must be a whole number of KES")
    .positive()
    .max(MAX_AMOUNT_KES, `M-Pesa STK push caps at ${MAX_AMOUNT_KES} KES`)
    .describe(`Amount to charge in Kenyan Shillings (KES), whole number, 1–${MAX_AMOUNT_KES}.`),
  phone: phoneSchema.describe(
    "Customer's Safaricom M-Pesa number. Accepts 2547XXXXXXXX, 07XXXXXXXX, or +2547XXXXXXXX.",
  ),
  // accountReference: 12, and the reason matters, because three limits disagree.
  //
  //   Daraja `AccountReference`               — max 12. THE hard limit. Safaricom rejects longer.
  //   paylod POST /collect (API key / SDK)    — z.string().max(12)   ← enforces the Daraja limit
  //   paylod POST /provider-ops/collect (us)  — z.string().max(64)   ← does NOT; it just forwards
  //
  // provider-ops' 64 is not permission, it is a missing guard: a 40-char reference sails through
  // paylod's zod and is rejected by Safaricom, one round-trip later, as an opaque Daraja error. So
  // the tool advertises the value that is true everywhere — 12 — matching the SDK, the docs, and
  // what actually reaches the handset. (provider-ops should be tightened to 12 as well; that is a
  // backend change, and 12 is a strict subset of what it accepts, so this is safe either way.)
  accountReference: z
    .string()
    .min(1)
    .max(MAX_ACCOUNT_REF_LEN)
    .optional()
    .describe(
      "Your correlation id for this payment (1–12 chars — Safaricom's hard limit on " +
        "AccountReference; longer values are rejected by Daraja). Returned as `accountRef` on the " +
        "status read and on the webhook, so use it to tie the payment to your order. It is NOT a " +
        "message to the customer: the payer sees it only on a Paybill, never on a Till. Defaults " +
        "to a reference derived from the paymentId. Use `description` for what reaches the STK prompt.",
    ),
  description: z
    .string()
    .min(1)
    .max(MAX_DESCRIPTION_LEN)
    .optional()
    .describe(`Short payment description (1–${MAX_DESCRIPTION_LEN} chars). Defaults to 'Payment'.`),
  idempotencyKey: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Idempotency key: reuse the SAME key to safely retry without double-charging. Sent as the " +
        "Idempotency-Key header; the backend replays the original 202 response instead of pushing a " +
        "second STK. Reusing a key with a DIFFERENT body is rejected (409).",
    ),
} as const;

const schema = z.object(collectInput);

export const collectTool: ToolDef = {
  name: "request_stk_push",
  title: "Request STK Push (collect payment)",
  scope: SCOPES.paymentsCollect,
  description:
    "Charge a customer via M-Pesa STK Push (POST /provider-ops/collect), which prompts the customer's " +
    "phone to approve the payment. Returns immediately with { paymentId, status, checkoutRequestId } " +
    "(HTTP 202) — settlement is asynchronous; poll get_payment_status or rely on your webhook for the " +
    "final result. ALWAYS pass a stable idempotencyKey so retries never double-charge. Requires the " +
    "payments.collect scope. With env 'production' this moves real money. NOTE: the SDK's " +
    "`collect()` takes a `metadata` object; this tool deliberately does not — POST /provider-ops/collect " +
    "does not model it and would silently drop it. Use `accountReference` to correlate, or the SDK / " +
    "POST /collect if you need metadata echoed back on the webhook.",
  inputSchema: collectInput,
  handler: async (client, args) => {
    const input = schema.parse(args);
    const { idempotencyKey, ...body } = input;
    return client.request("POST", "/provider-ops/collect", {
      body,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  },
};
