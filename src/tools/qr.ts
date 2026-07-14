import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

export const qrInput = {
  applicationId: applicationIdField,
  env: envField,
  amount: z.number().positive().describe("Amount in KES to encode into the QR code."),
  refNo: z.string().min(1).max(64).optional().describe("Payment reference (1–64 chars). Default 'QR'."),
  merchantName: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("Merchant name shown to the payer. Defaults to the tenant shortcode."),
  trxCode: z
    .enum(["BG", "PB", "WA", "SB", "SM"])
    .optional()
    .describe(
      "Transaction type: BG BuyGoods, PB Paybill, WA Withdrawal, SB SendBusiness, SM SendMoney (default BG).",
    ),
  cpi: z
    .string()
    .min(1)
    .optional()
    .describe("Credit Party Identifier (till/paybill/phone). Defaults to the tenant shortcode."),
  // NOTE: no `size` — provider-ops POST /qr does not model it (it was silently dropped).
} as const;

const schema = z.object(qrInput);

export const qrTool: ToolDef = {
  name: "generate_qr",
  title: "Generate an M-Pesa QR code",
  scope: SCOPES.paymentsCollect,
  description:
    "Generate a scannable M-Pesa QR code (POST /provider-ops/qr) and return { qrBase64 } — a base64 PNG " +
    "the customer can scan to pay. No money moves at generation time. Requires the payments.collect scope.",
  inputSchema: qrInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/provider-ops/qr", { body });
  },
};
