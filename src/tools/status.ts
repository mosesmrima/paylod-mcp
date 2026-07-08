import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

export const statusInput = {
  applicationId: applicationIdField,
  env: envField,
  paymentId: z
    .string()
    .min(1)
    .describe("The paymentId returned by request_stk_push."),
} as const;

const schema = z.object(statusInput);

export const statusTool: ToolDef = {
  name: "get_payment_status",
  title: "Get payment status",
  scope: SCOPES.paymentsRead,
  description:
    "Look up a single M-Pesa collection by its paymentId (POST /provider-ops/status). The backend lazily " +
    "runs an STK Query and settles the payment if still pending, then returns { id, status, mpesaReceipt, " +
    "resultCode, resultDesc }. If resultCode is non-zero, pass it to decode_mpesa_error for a " +
    "human-readable explanation. Requires the payments.read scope.",
  inputSchema: statusInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/provider-ops/status", { body });
  },
};
