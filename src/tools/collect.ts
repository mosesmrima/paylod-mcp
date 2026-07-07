import { z } from "zod";
import type { ToolDef } from "./types.js";

/** Kenyan MSISDN accepted by paylod (`/collect` normalizes it). */
const phoneSchema = z
  .string()
  .regex(/^(?:\+?254|0)?[17]\d{8}$/, "Must be a Kenyan Safaricom number, e.g. 254712345678 or 0712345678");

export const collectInput = {
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
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Arbitrary key/value metadata echoed back in the settlement webhook."),
} as const;

const schema = z.object(collectInput);

export const collectTool: ToolDef = {
  name: "request_stk_push",
  title: "Request STK Push (collect payment)",
  category: "collect",
  description:
    "Charge a customer via M-Pesa STK Push (a.k.a. create a collect request). Sends a POST to " +
    "paylod /collect, which prompts the customer's phone to approve the payment. Returns immediately " +
    "with a paymentId and status 'pending' (HTTP 202) — settlement is asynchronous; poll " +
    "get_payment_status or rely on your webhook for the final result. ALWAYS pass a stable " +
    "idempotencyKey so retries never double-charge. MONEY-MOVING: with an mp_live_ key this moves real " +
    "money, so it is opt-in (enable via --tools). An mp_test_ key runs in sandbox and moves no real funds.",
  inputSchema: collectInput,
  handler: async (client, args) => {
    const input = schema.parse(args);
    const { idempotencyKey, ...body } = input;
    return client.request("POST", "/collect", {
      body,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  },
};
