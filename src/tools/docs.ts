import { z } from "zod";
import { DOC_TOPICS, DOCS_FULL, type DocTopic } from "../docs-bundle.js";
import type { ToolDef } from "./types.js";

/**
 * `get_docs` — paylod's own documentation, served offline.
 *
 * The prose is NOT written here. `src/docs-bundle.ts` is generated from the docs markdown that
 * renders https://paylod.dev/docs and https://paylod.dev/llms-full.txt, so this tool cannot
 * teach anything the website does not (see scripts/check-docs-bundle.mjs — the build fails if
 * the copy drifts). This file only routes a question to a topic.
 */

/** The canonical topic ids an answer advertises. */
export const DOC_TOPIC_IDS: readonly string[] = [...DOC_TOPICS.map((t) => t.id), "all"];

/** What the tool's enum accepts: the ids, plus the historical aliases ('callback-url', …). */
export const ACCEPTED_TOPIC_IDS: readonly string[] = [
  ...DOC_TOPIC_IDS,
  ...DOC_TOPICS.flatMap((t) => t.aliases),
];

function topicById(id: string): DocTopic | undefined {
  return DOC_TOPICS.find((t) => t.id === id || t.aliases.includes(id));
}

/** Score a topic against a free-text question (keyword + title overlap). */
function score(topic: DocTopic, terms: readonly string[]): number {
  let n = 0;
  const title = topic.title.toLowerCase();
  for (const term of terms) {
    if (topic.keywords.includes(term)) n += 2;
    if (title.includes(term)) n += 1;
  }
  return n;
}

export interface DocsAnswer {
  readonly topic: string;
  readonly title: string;
  readonly content: string;
  readonly availableTopics: readonly string[];
}

/**
 * Resolve a docs request. An explicit `topic` wins (`all` = the complete bundle); otherwise a
 * free-text `query` is keyword-matched. With neither (or no match) we return the end-to-end
 * integration guide — the single most useful answer to "how do I integrate M-Pesa with paylod".
 */
export function lookupDocs(opts: { topic?: string; query?: string }): DocsAnswer {
  if (opts.topic === "all") {
    return {
      topic: "all",
      title: "The complete paylod documentation",
      content: DOCS_FULL,
      availableTopics: DOC_TOPIC_IDS,
    };
  }

  let chosen = opts.topic ? topicById(opts.topic) : undefined;

  if (!chosen && opts.query) {
    const terms = opts.query
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter((t) => t.length > 1);
    const ranked = DOC_TOPICS.map((t) => ({ t, s: score(t, terms) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);
    chosen = ranked[0]?.t;
  }

  const topic = chosen ?? topicById("integration")!;
  return {
    topic: topic.id,
    title: topic.title,
    content: topic.content,
    availableTopics: DOC_TOPIC_IDS,
  };
}

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
    .enum(ACCEPTED_TOPIC_IDS as unknown as [string, ...string[]])
    .optional()
    .describe(
      "Ask for one topic directly instead of searching: " +
        "'integration' (end-to-end setup — the default), 'sdk' (@paylod/node, what application " +
        "code should use), 'auth' (API keys, environments, idempotency, rate limits), " +
        "'payments' (taking an STK Push), 'results' (polling, waiting, the PaymentOutcome), " +
        "'webhooks' (signed delivery + HMAC verification), 'errors' (M-Pesa result codes), " +
        "'security' (where the API key may and may not go), 'sandbox' (testing the failure " +
        "paths), 'go-live' (the Daraja callback URL + production checklist), 'mcp' (these tools " +
        "and the order to call them in), 'cli', 'endpoints' (payouts, reversals, QR, C2B), or " +
        "'all' (the complete docs in one answer — same bytes as https://paylod.dev/llms-full.txt).",
    ),
} as const;

const schema = z.object(getDocsInput);

export const getDocsTool: ToolDef = {
  name: "get_docs",
  title: "Read the paylod documentation",
  // No scope, no token, no network — pure/local, like decode_mpesa_error.
  description:
    "Read paylod's OWN documentation — the same pages published at https://paylod.dev/docs, " +
    "bundled at build time from that source so it can never be out of date. Covers: installing " +
    "@paylod/node and taking a payment with `collectAndWait()`, the renderable PaymentOutcome " +
    "(render `message`; offer a retry only when `retryable`), API keys (server-side only — a key " +
    "in a browser lets a payer set their own price), webhooks, result codes (4999 is PENDING, " +
    "not failed), the CLI, the REST surface, and the order to call these MCP tools in. PURE and " +
    "OFFLINE — no network call, no key. Pass a free-text `query`, an explicit `topic`, or " +
    "`topic: 'all'` for everything. With neither, returns the end-to-end integration guide. " +
    "Returns { topic, title, content (markdown), availableTopics }. Read this BEFORE writing any " +
    "M-Pesa code — do not hand-roll fetch calls or a polling loop; the SDK already has them.",
  inputSchema: getDocsInput,
  handler: async (_client, args) => {
    const { query, topic } = schema.parse(args);
    return lookupDocs({ query, topic });
  },
};
