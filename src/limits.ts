/**
 * Authoritative input bounds for the paylod MCP tools — the single place the tool JSON
 * schemas draw their numeric/length limits from.
 *
 * These MUST match the backend's zod (the real 422 boundary), because an MCP schema that is
 * LOOSER than the backend lets an agent pass a value the tool accepts and the backend then
 * rejects — "validation passed" followed by a silent failure (TD-08). The SDK does not export
 * these as constants, so they are re-declared here and pinned to the backend source of truth:
 *
 *   MAX_AMOUNT_KES        supabase/functions/provider-ops/index.ts  (.int().positive().max(150_000))
 *                         + paylod-sdk/src/client.ts MAX_AMOUNT
 *   MAX_ACCOUNT_REF_LEN   supabase/functions/_shared/payments/account-ref.ts (Daraja's hard cap)
 *   MAX_DESCRIPTION_LEN   supabase/functions/_shared/schemas/collect.ts (.max(64))
 *   MAX_QR_REF_LEN /      supabase/functions/provider-ops/index.ts  (/qr refNo + merchantName .max(64))
 *   MAX_MERCHANT_NAME_LEN
 *
 * If the backend changes a bound, change it here too (and in backend-contract.test.ts).
 */

/** Whole KES only; M-Pesa caps a single STK/QR/payout at 150,000. */
export const MAX_AMOUNT_KES = 150_000;

/** Daraja's hard cap on AccountReference — Safaricom rejects longer values. */
export const MAX_ACCOUNT_REF_LEN = 12;

/** Backend `/collect` description cap. */
export const MAX_DESCRIPTION_LEN = 64;

/** Backend `/qr` refNo cap. */
export const MAX_QR_REF_LEN = 64;

/** Backend `/qr` merchantName cap. */
export const MAX_MERCHANT_NAME_LEN = 64;
