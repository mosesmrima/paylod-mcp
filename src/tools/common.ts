import { z } from "zod";

/**
 * Shared input fragments for tenant-scoped tools. Every tenant tool takes an
 * explicit `applicationId` (contract T-1 / §3.3) — org is resolved per-call
 * from it at the backend, never from a token claim.
 */

export const applicationIdField = z
  .string()
  .uuid()
  .describe("The paylod application UUID this call operates on (from list_applications).");

/**
 * `env` is REQUIRED wherever it selects a credential set, and that is deliberate — not
 * boilerplate we forgot to trim.
 *
 * An application does NOT have an environment. The `applications` table has no `env` column;
 * env lives on `credentials`, keyed UNIQUE (application_id, env), so ONE application can hold
 * BOTH a sandbox and a production credential set at the same time. There is therefore nothing
 * unambiguous to derive it from. (`list_applications` returns an env *hint*, but it PREFERS
 * production when both exist — silently defaulting to that would mean an omitted field fires a
 * live STK push at a real phone. That is exactly the blast radius we refuse to take.)
 *
 * So: derive env where it is unambiguous (get_payment_status reads it off the payment row),
 * default it to the SAFE literal where the backend already does (mint_key → 'sandbox'), and
 * keep it explicit everywhere it picks the credentials that move money.
 */
export const envField = z
  .enum(["sandbox", "production"])
  .describe(
    "Required. Which credential set to use: 'sandbox' or 'production'. This is NOT inferable — one " +
      "application can hold both — and 'production' moves REAL money, so it must be stated explicitly.",
  );
