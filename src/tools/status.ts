import { z } from "zod";
import { SCOPES } from "../scopes.js";
import type { PaylodClient } from "../client.js";
import type { ToolDef } from "./types.js";

/**
 * `get_payment_status` — paymentId is the ONLY required input.
 *
 * A paymentId is a UUID that uniquely identifies a payment, and the payment row already
 * knows its own `application_id` and `env`. Making the caller restate both was pure
 * boilerplate — and worse, a *wrong* `env` was a silent trap: POST /provider-ops/status
 * looks the payment up by (applicationId, paymentId) WITHOUT filtering on env, so a
 * mismatched env still FOUND the row, then failed to load credentials for that env and
 * quietly returned the STALE `pending` view instead of running the STK Query. The caller
 * saw "pending" for a payment that may well have succeeded. We now reject a mismatch loudly.
 *
 * RESOLUTION + OWNERSHIP (read this before changing anything here):
 *   Step 1 — GET /payments/:id. This is the TENANCY GATE. The backend authenticates the
 *   token, requires `paylod:payments.read`, reads the row, then asserts the row's
 *   `organization_id` is one of the CALLER'S OWN org memberships and returns the SAME 404
 *   as a non-existent payment otherwise (no existence oracle, so UUID enumeration leaks
 *   nothing). It returns the authoritative { applicationId, env }.
 *
 *   Step 2 — POST /provider-ops/status with those RESOLVED values, for the lazy STK-Query
 *   settle of a still-pending payment. Its own `verifyAccess(applicationId)` re-runs the
 *   app -> org -> membership check.
 *
 *   Ownership is therefore enforced SERVER-SIDE, twice, and this tool never widens it: it
 *   only ever forwards values it read back out of a payment the backend already confirmed
 *   the caller may see. Do NOT "optimize away" step 1 — it is the authorization check.
 */

export const statusInput = {
  paymentId: z
    .string()
    .uuid("paymentId must be a UUID")
    .describe("The paymentId (UUID) returned by request_stk_push. This is all you need."),
  applicationId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Optional. Resolved from the payment when omitted. Pass it only to ASSERT which application " +
        "the payment belongs to — a value that contradicts the stored payment is rejected.",
    ),
  env: z
    .enum(["sandbox", "production"])
    .optional()
    .describe(
      "Optional. Resolved from the payment when omitted (a payment was made in exactly one " +
        "environment). Pass it only to ASSERT the environment — a mismatch is rejected.",
    ),
} as const;

const schema = z.object(statusInput);

/** The subset of GET /payments/:id we rely on to resolve the payment's own tenancy. */
const resolvedPaymentSchema = z.object({
  payment: z.object({
    id: z.string(),
    applicationId: z.string().uuid(),
    env: z.enum(["sandbox", "production"]),
  }),
});

export const statusTool: ToolDef = {
  name: "get_payment_status",
  title: "Get payment status",
  scope: SCOPES.paymentsRead,
  description:
    "Look up a single M-Pesa collection by its paymentId. `paymentId` is the ONLY required argument — " +
    "the payment already knows which application and environment it belongs to, so you do NOT need to " +
    "pass applicationId or env. The backend lazily runs an STK Query and settles the payment if it is " +
    "still pending, then returns { id, status, mpesaReceipt, resultCode, resultDesc }. If resultCode is " +
    "non-zero, pass it to decode_mpesa_error for a human-readable explanation. You MAY optionally pass " +
    "applicationId and/or env to ASSERT the payment's tenancy; if they contradict the stored payment the " +
    "call fails loudly rather than returning a misleading result. You can only read payments belonging to " +
    "an organization you are a member of. Requires the payments.read scope.",
  inputSchema: statusInput,
  handler: async (client: PaylodClient, args) => {
    const input = schema.parse(args);

    // Step 1 — authorization + resolution in ONE call. A payment in an org the caller is not a
    // member of 404s here exactly like a payment that does not exist.
    const raw = await client.request("GET", `/payments/${input.paymentId}`);
    const { payment } = resolvedPaymentSchema.parse(raw);

    // Step 2 — a supplied applicationId/env is an ASSERTION, not a selector. Contradiction = error.
    if (input.applicationId && input.applicationId !== payment.applicationId) {
      throw new Error(
        `applicationId mismatch: payment ${payment.id} belongs to application ` +
          `${payment.applicationId}, not ${input.applicationId}. Omit applicationId — it is ` +
          `resolved from the payment.`,
      );
    }
    if (input.env && input.env !== payment.env) {
      throw new Error(
        `env mismatch: payment ${payment.id} was made in '${payment.env}', not '${input.env}'. ` +
          `Omit env — it is resolved from the payment.`,
      );
    }

    // Step 3 — settle with AUTHORITATIVE values only. Never the caller's.
    return client.request("POST", "/provider-ops/status", {
      body: {
        applicationId: payment.applicationId,
        env: payment.env,
        paymentId: input.paymentId,
      },
    });
  },
};
