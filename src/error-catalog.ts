/**
 * Daraja error catalog + decoder — re-export shim.
 *
 * The table and the decoder live in `daraja-catalog.ts` / `daraja-error-codes.json`, which are
 * GENERATED copies of the canonical files in the paylod backend repo
 * (`supabase/functions/_shared/daraja/`) — the same code table and the same classifier the
 * payment engine itself uses. Regenerate with `node scripts/sync-daraja-catalog.mjs` there.
 *
 * This file used to hold a SECOND, hand-maintained copy of the code table, kept in step by a
 * "KEEP IN SYNC" comment. It drifted, exactly as comments always do: it was forked before the
 * engine learned that Daraja's `4999` means "the customer has not entered their PIN yet". With
 * no `4999` entry it fell through to the generic failure fallback, so `decode_mpesa_error(4999)`
 * told developers and AI agents that a live, mid-PIN-entry payment had FAILED and was
 * RETRYABLE — a false failure shown to a paying customer, and an invitation to retry an
 * in-flight charge (i.e. double-charge them). Never hand-maintain this table again.
 */

export {
  ALL_ENTRIES,
  type CatalogEntry,
  classifyStkResult,
  type DarajaCategory,
  type DarajaFamily,
  decodeDarajaResult,
  type DecodedError,
  ERROR_CATALOG,
  isPendingError,
  PENDING_RESULT_CODES,
  type StkOutcome,
} from "./daraja-catalog.js";
