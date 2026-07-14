import { z } from "zod";
import { DOC_TOPIC_IDS, lookupDocs } from "../docs-content.js";
import type { ToolDef } from "./types.js";

export const getDocsInput = {
  query: z
    .string()
    .min(2)
    .optional()
    .describe(
      "A free-text question, e.g. 'how do I integrate M-Pesa with paylod' or 'how do I verify a " +
        "webhook signature'. Routed to the closest topic.",
    ),
  topic: z
    .enum(DOC_TOPIC_IDS as unknown as [string, ...string[]])
    .optional()
    .describe(
      "Ask for one topic directly instead of searching: " +
        "'integration' (end-to-end M-Pesa setup), 'callback-url' (the Daraja portal URL), " +
        "'auth' (API keys, base URL, idempotency, rate limits), 'payments' (/collect + /status), " +
        "'webhooks' (signed delivery + HMAC verification), 'security' (the six integration rules), " +
        "'errors' (M-Pesa result codes), 'endpoints' (the full REST + tool surface).",
    ),
} as const;

const schema = z.object(getDocsInput);

export const getDocsTool: ToolDef = {
  name: "get_docs",
  title: "Read the paylod documentation",
  // No scope, no token, no network — pure/local, like decode_mpesa_error.
  description:
    "Look up paylod's own documentation: how to integrate M-Pesa end to end, the Daraja callback URL, " +
    "API-key auth, /collect + /status, webhook signature verification, the secure-integration rules, " +
    "error codes, and the full endpoint/tool reference. PURE and OFFLINE — no network call, no key. " +
    "Pass a free-text `query` (e.g. 'how do I integrate M-Pesa with paylod') or an explicit `topic`. " +
    "With neither, returns the end-to-end integration guide. Returns { topic, title, content (markdown), " +
    "availableTopics }. Read this BEFORE guessing at paylod's API shape.",
  inputSchema: getDocsInput,
  handler: async (_client, args) => {
    const { query, topic } = schema.parse(args);
    return lookupDocs({ query, topic });
  },
};
