import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

/** Kenyan MSISDN accepted by paylod (the backend normalizes it). */
const phoneSchema = z
  .string()
  .regex(/^(?:\+?254|0)?[17]\d{8}$/, "Must be a Kenyan Safaricom number, e.g. 254712345678 or 0712345678");

export const collectInput = {
  applicationId: applicationIdField,
  env: envField,
  amount: z
    .number()
    .int("Amount must be a whole number of KES")
    .positive()
    .max(150000, "M-Pesa STK push caps at 150,000 KES")
    .describe("Amount to charge in Kenyan Shillings (KES), whole number, 1–150000."),
  phone: phoneSchema.describe(
    "Customer's Safaricom M-Pesa number. Accepts 2547XXXXXXXX, 07XXXXXXXX, or +2547XXXXXXXX.",
  ),
  accountReference: z
    .string()
    .min(1)
    .max(12)
    .optional()
    .describe("Short account/order reference the customer sees (1–12 chars). Defaults to 'collect'."),
  description: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("Short payment description (1–64 chars). Defaults to 'Payment'."),
  idempotencyKey: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Idempotency key: reuse the SAME key to safely retry without double-charging. " +
        "Sent as the Idempotency-Key header. A duplicate key with a different body is rejected (409).",
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
    "payments.collect scope. With env 'production' this moves real money.",
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
