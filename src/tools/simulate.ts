import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { phoneSchema } from "../phone.js";
import { MAX_ACCOUNT_REF_LEN, MAX_AMOUNT_KES } from "../limits.js";
import { applicationIdField } from "./common.js";
import type { ToolDef } from "./types.js";

/**
 * Sandbox simulator tools. Now OAuth-authed like every other tool — the backend
 * accepts the same forwarded access token (no manual PAYLOD_SESSION_TOKEN), which
 * is what unblocks agent-native testing (contract §6.1).
 */

export const simulateCollectInput = {
  applicationId: applicationIdField,
  phone: phoneSchema.describe("A test Safaricom number for the simulated STK push."),
  amount: z
    .number()
    .int()
    .positive()
    .max(MAX_AMOUNT_KES)
    .optional()
    .describe("Amount in KES (default 1). No real money moves — sandbox only."),
  accountRef: z
    .string()
    .min(1)
    .max(MAX_ACCOUNT_REF_LEN)
    .optional()
    .describe(`Account reference (1–${MAX_ACCOUNT_REF_LEN} chars). Default 'SIMULATED'.`),
} as const;

const collectSchema = z.object(simulateCollectInput);

export const simulateCollectTool: ToolDef = {
  name: "simulate_test_payment",
  title: "Simulate a test STK push (sandbox)",
  scope: SCOPES.paymentsSimulate,
  description:
    "Create a SIMULATED M-Pesa collection in the paylod sandbox (POST /simulate/collect). No real STK " +
    "prompt is sent and no money moves. Returns (HTTP 202) { paymentId, checkoutRequestId, " +
    "status: 'pending', provider, outcomes } where `outcomes` is an ARRAY OF OBJECTS, each " +
    "{ id, label, status } — NOT an array of strings. Pass an outcome's `id` (e.g. 'approve', " +
    "'wrong_pin', 'insufficient_funds', 'user_cancelled', 'timeout') as the `outcome` argument of " +
    "simulate_outcome to force that resolution; `label` is the human text and `status` the payment " +
    "status it settles to ('success' or 'failed'). Requires the payments.simulate scope.",
  inputSchema: simulateCollectInput,
  handler: async (client, args) => {
    const body = collectSchema.parse(args);
    return client.request("POST", "/simulate/collect", { body });
  },
};

export const simulateOutcomeInput = {
  paymentId: z
    .string()
    .uuid()
    .describe("The simulated paymentId returned by simulate_test_payment."),
  outcome: z
    .enum(["approve", "wrong_pin", "insufficient_funds", "user_cancelled", "timeout"])
    .describe(
      "Which resolution to force: approve (success), wrong_pin (2001), insufficient_funds (1), " +
        "user_cancelled (1032), or timeout (1037).",
    ),
} as const;

const outcomeSchema = z.object(simulateOutcomeInput);

export const simulateOutcomeTool: ToolDef = {
  name: "simulate_outcome",
  title: "Force the outcome of a simulated payment (sandbox)",
  scope: SCOPES.paymentsSimulate,
  description:
    "Resolve a pending SIMULATED payment to a chosen outcome (POST /simulate/outcome). Drives the exact " +
    "same settlement + webhook path a real payment would, so you can test success and every failure code " +
    "end-to-end. Only works on payments created by simulate_test_payment. Returns { paymentId, status, " +
    "resultCode, resultDesc, mpesaReceipt, webhookQueued }. Requires the payments.simulate scope.",
  inputSchema: simulateOutcomeInput,
  handler: async (client, args) => {
    const body = outcomeSchema.parse(args);
    return client.request("POST", "/simulate/outcome", { body });
  },
};
