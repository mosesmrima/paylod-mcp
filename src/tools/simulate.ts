import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField } from "./common.js";
import type { ToolDef } from "./types.js";

/**
 * Sandbox simulator tools. Now OAuth-authed like every other tool — the backend
 * accepts the same forwarded access token (no manual PAYLOD_SESSION_TOKEN), which
 * is what unblocks agent-native testing (contract §6.1).
 */

const phoneSchema = z
  .string()
  .regex(/^(?:\+?254|0)?[17]\d{8}$/, "Must be a Kenyan Safaricom number, e.g. 254712345678");

export const simulateCollectInput = {
  applicationId: applicationIdField,
  phone: phoneSchema.describe("A test Safaricom number for the simulated STK push."),
  amount: z
    .number()
    .int()
    .positive()
    .max(150000)
    .optional()
    .describe("Amount in KES (default 1). No real money moves — sandbox only."),
  accountRef: z
    .string()
    .min(1)
    .max(32)
    .optional()
    .describe("Account reference (1–32 chars). Default 'SIMULATED'."),
} as const;

const collectSchema = z.object(simulateCollectInput);

export const simulateCollectTool: ToolDef = {
  name: "simulate_test_payment",
  title: "Simulate a test STK push (sandbox)",
  scope: SCOPES.paymentsSimulate,
  description:
    "Create a SIMULATED M-Pesa collection in the paylod sandbox (POST /simulate/collect). No real STK " +
    "prompt is sent and no money moves. Returns { paymentId, checkoutRequestId, status: 'pending', " +
    "provider, outcomes[] } where outcomes[] lists the resolutions you can force next via simulate_outcome " +
    "(approve, wrong_pin, insufficient_funds, user_cancelled, timeout). Requires the payments.simulate scope.",
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
