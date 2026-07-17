/**
 * Kenyan MSISDN validation + normalisation — the MCP's single source of truth.
 *
 * These are separate npm packages, so a shared module is impossible — keep this byte-identical
 * with the copies (a divergence is a real bug):
 *   - paylod-sdk/src/phone.ts          (reference impl)
 *   - paylod-cli/src/lib/phone.ts
 *   - mpesa _shared/daraja/primitives.ts (canonical backend copy)
 *
 * Two shapes: MSISDN_INPUT_RE validates RAW input; normalizeMsisdn strips non-digits and emits
 * the wire form matching /^254[17]\d{8}$/. The MCP only validates locally (the backend
 * re-normalizes), so `phoneSchema` / isValidMsisdn is what the tools use — normalizeMsisdn is
 * exported for parity with the sibling packages.
 */

import { z } from "zod";

/** Validates RAW user input in any accepted Kenyan form (before normalization). */
export const MSISDN_INPUT_RE = /^(?:\+?254|0)?[17]\d{8}$/;

/** True if `input` is an acceptable Kenyan MSISDN form. Does not throw. */
export function isValidMsisdn(input: string): boolean {
  return typeof input === "string" && MSISDN_INPUT_RE.test(input.trim());
}

/** Shared zod field for a Kenyan Safaricom number. Add `.describe()` per tool. */
export const phoneSchema = z
  .string()
  .regex(MSISDN_INPUT_RE, "Must be a Kenyan Safaricom number, e.g. 254712345678 or 0712345678");

/**
 * Normalize a Kenyan phone number to the `2547XXXXXXXX` / `2541XXXXXXXX` wire form.
 * @throws if the input cannot be resolved to a valid 12-digit MSISDN.
 */
export function normalizeMsisdn(input: string): string {
  const digits = input.replace(/\D+/g, "");

  let msisdn: string;
  if (digits.startsWith("254")) {
    msisdn = digits;
  } else if (digits.startsWith("0")) {
    msisdn = `254${digits.slice(1)}`;
  } else if (digits.startsWith("7") || digits.startsWith("1")) {
    msisdn = `254${digits}`;
  } else {
    throw new Error(`normalizeMsisdn: unrecognized Kenyan phone format: ${input}`);
  }

  if (!/^254[17]\d{8}$/.test(msisdn)) {
    throw new Error(`normalizeMsisdn: not a valid Kenyan MSISDN: ${input}`);
  }
  return msisdn;
}
