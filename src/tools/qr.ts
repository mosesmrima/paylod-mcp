import { z } from "zod";
import type { ToolDef } from "./types.js";

export const qrInput = {
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
  size: z.string().min(1).optional().describe("Requested QR image size in pixels (as a string)."),
} as const;

const schema = z.object(qrInput);

export const qrTool: ToolDef = {
  name: "generate_qr",
  title: "Generate an M-Pesa QR code",
  category: "qr",
  description:
    "Generate a scannable M-Pesa QR code (POST paylod /qr-generate) and return { qrBase64 } — a base64 " +
    "PNG the customer can scan to pay. Stateless: no money moves, no ledger row is created, no callback " +
    "fires. Safe to call freely; enabled by default.",
  inputSchema: qrInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/qr-generate", { body });
  },
};
