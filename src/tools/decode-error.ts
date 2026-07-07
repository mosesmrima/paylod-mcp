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
  category: "local",
  description:
    "Turn a cryptic M-Pesa/Daraja ResultCode into a plain-English explanation. PURE and OFFLINE — no " +
    "network call, no API key needed. Returns { code, title, cause, fix, category, retryable, " +
    "customerMessage }: 'category' says who is at fault (customer/balance/limit/credentials/network/" +
    "mpesa_system/success), 'retryable' whether retrying may help, and 'customerMessage' is a friendly " +
    "line you can show the payer. Use this whenever a payment has a non-zero resultCode.",
  inputSchema: decodeErrorInput,
  // Not async in spirit, but the ToolDef contract is a Promise — resolve immediately.
  handler: async (_client, args) => {
    const { resultCode, resultDesc } = schema.parse(args);
    return decodeDarajaResult(resultCode, resultDesc);
  },
};
