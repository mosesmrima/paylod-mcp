import { z } from "zod";
import type { ToolDef } from "./types.js";

export const reversalInput = {
  transactionId: z
    .string()
    .min(1)
    .max(64)
    .describe("The M-Pesa transaction ID (receipt) to reverse."),
  amount: z
    .number()
    .int("Amount must be a whole number of KES")
    .positive()
    .max(150000)
    .describe("Amount to reverse in KES."),
  remarks: z.string().max(100).optional().describe("Optional remarks (≤100 chars)."),
  occasion: z.string().max(100).optional().describe("Optional occasion note (≤100 chars)."),
} as const;

const schema = z.object(reversalInput);

export const reversalTool: ToolDef = {
  name: "reversal",
  title: "Reverse / refund a transaction",
  category: "reversal",
  description:
    "Reverse (refund) a completed M-Pesa transaction (POST paylod /reversal). Returns " +
    "{ disbursementId, conversationId, status: 'pending' } (HTTP 202); the final result arrives on the " +
    "merchant's results callback. MONEY-MOVING and sensitive — opt-in only (enable via --tools=reversal). " +
    "Requires initiator credentials and a provider that supports refunds. An mp_test_ key runs in sandbox.",
  inputSchema: reversalInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/reversal", { body });
  },
};
