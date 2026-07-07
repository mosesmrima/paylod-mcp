import { z } from "zod";
import type { ToolDef } from "./types.js";

export const statusInput = {
  paymentId: z
    .string()
    .min(1)
    .describe("The paymentId returned by request_stk_push (the /collect response)."),
} as const;

const schema = z.object(statusInput);

export const statusTool: ToolDef = {
  name: "get_payment_status",
  title: "Get payment status",
  category: "read",
  description:
    "Look up a single M-Pesa collection by its paymentId (GET paylod /status/:id). paylod lazily runs " +
    "an STK Query and settles the payment if it is still pending, then returns { id, status, " +
    "mpesaReceipt, resultCode, resultDesc }. If resultCode is non-zero, pass it to decode_mpesa_error " +
    "for a human-readable explanation. Note: paylod has no list-payments endpoint — you must know the " +
    "paymentId (there is no way to enumerate payments through this server).",
  inputSchema: statusInput,
  handler: async (client, args) => {
    const { paymentId } = schema.parse(args);
    return client.request("GET", `/status/${encodeURIComponent(paymentId)}`);
  },
};
