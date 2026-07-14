import { z } from "zod";
import { decodeDarajaResult } from "../error-catalog.js";
import type { ToolDef } from "./types.js";

export const decodeErrorInput = {
  resultCode: z
    .union([z.number(), z.string()])
    .describe("The M-Pesa/Daraja ResultCode to decode, e.g. 1032, 2001, or '1037'."),
  resultDesc: z
    .string()
    .optional()
    .describe("The raw ResultDesc, used as context when the code is not in the catalog."),
} as const;

const schema = z.object(decodeErrorInput);

export const decodeErrorTool: ToolDef = {
  name: "decode_mpesa_error",
  title: "Decode an M-Pesa error code",
  // No scope, no token, no network — pure/local (contract §2.1).
  description:
    "Turn a cryptic M-Pesa/Daraja ResultCode into a plain-English explanation. PURE and OFFLINE — no " +
    "network call, no API key needed. Returns { code, title, cause, fix, category, retryable, " +
    "customerMessage }. 'category' says who is at fault: customer/balance/limit/credentials/network/" +
    "mpesa_system/success, plus PENDING — and pending is NOT a failure. Codes 4999 and 500.001.1001 " +
    "mean the STK prompt is still live on the customer's phone and they have not entered their PIN " +
    "yet; the payment can still succeed, so keep polling get_payment_status and do NOT tell the " +
    "customer it failed. 'retryable' means SAFE TO CHARGE AGAIN (we know no money moved), NOT merely " +
    "'the user could try again' — never re-charge a payment when retryable is false, because a " +
    "pending or indeterminate payment may still complete and you would double-charge a real person. " +
    "'customerMessage' is a friendly line you can show the payer. Use this whenever a payment has a " +
    "non-zero resultCode.",
  inputSchema: decodeErrorInput,
  // Not async in spirit, but the ToolDef contract is a Promise — resolve immediately.
  handler: async (_client, args) => {
    const { resultCode, resultDesc } = schema.parse(args);
    return decodeDarajaResult(resultCode, resultDesc);
  },
};
