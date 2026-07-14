import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField } from "./common.js";
import type { ToolDef } from "./types.js";

/**
 * Key MANAGEMENT — the other half of `mint_key`.
 *
 * A cold-test agent minted a key on a live demo and then had no way to see it or kill it:
 * `mint_key` existed, but nothing to list or revoke. A credential you cannot revoke is a
 * security defect, not a missing feature.
 *
 * Backed by the backend's /api-keys function:
 *   GET  /api-keys?applicationId=&env=&includeRevoked=  → { keys: [{ id, ... }] }   ← note: `id`
 *   POST /api-keys/:id/revoke                           → { revoked, apiKeyId, prefix }
 *
 * THE TWO BACKEND ROUTES DISAGREE WITH EACH OTHER: the list projection emits `id`, the revoke
 * response emits `apiKeyId`. An agent told to "list keys, then revoke one" reads `.apiKeyId` off a
 * listed key, gets `undefined`, and revoke_key's `z.string().uuid()` rejects the call — the advertised
 * workflow could not succeed. Until the backend is made self-consistent, `list_keys` NORMALIZES the
 * listed `id` to `apiKeyId` here, so that the field list_keys emits is exactly the field revoke_key
 * consumes. One word for one thing, across both tools. (Backend fix tracked separately; this mapping
 * is a superset — if GET later starts returning `apiKeyId` itself, the normalizer is a no-op.)
 *
 * Both require the `paylod:keys.mint` scope (key management IS key surface — see the
 * backend's note: a viewer must not enumerate an org's credential inventory).
 *
 * THE SECRET IS NEVER RETURNED. The backend selects only the `prefix` column and never the
 * `hash`; the plaintext key exists exactly once, in the mint_key response. Listing shows
 * prefixes so a human/agent can IDENTIFY a key in order to revoke it — nothing more.
 */

export const listKeysInput = {
  applicationId: applicationIdField,
  env: z
    .enum(["sandbox", "production"])
    .optional()
    .describe("Optional filter. Omit to list this application's keys in BOTH environments."),
  includeRevoked: z
    .boolean()
    .optional()
    .describe("Include already-revoked keys in the listing (default false — active keys only)."),
} as const;

const listSchema = z.object(listKeysInput);

/** The backend's GET /api-keys row: `id` plus the camelCase view columns. */
interface ListKeysResponse {
  keys?: unknown;
}

/**
 * Rename the backend's `id` to `apiKeyId` — the name revoke_key takes and the name this tool
 * advertises. Any row that already carries `apiKeyId` is passed through untouched.
 */
function normalizeKeyRow(row: unknown): unknown {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return row;
  const { id, ...rest } = row as Record<string, unknown> & { id?: unknown };
  if (!("id" in (row as object))) return row;
  return { apiKeyId: (rest as { apiKeyId?: unknown }).apiKeyId ?? id, ...rest };
}

export const listKeysTool: ToolDef = {
  name: "list_keys",
  title: "List an application's API keys",
  scope: SCOPES.keysMint,
  description:
    "List the paylod merchant API keys for an application (GET /api-keys), returning " +
    "{ keys: [{ apiKeyId, applicationId, env, prefix, name, lastUsedAt, revokedAt, createdAt, active }] }. " +
    "Only the key PREFIX is ever returned — the secret is shown exactly once, by mint_key, and can " +
    "never be read back. Use this to find the apiKeyId of a key you want to kill, then call revoke_key — " +
    "the apiKeyId here is exactly the value revoke_key takes. " +
    "Active keys only by default; pass includeRevoked to see the full history. Requires the keys.mint scope.",
  inputSchema: listKeysInput,
  handler: async (client, args) => {
    const input = listSchema.parse(args);
    const res = await client.request<ListKeysResponse>("GET", "/api-keys", {
      query: {
        applicationId: input.applicationId,
        ...(input.env ? { env: input.env } : {}),
        ...(input.includeRevoked ? { includeRevoked: "true" } : {}),
      },
    });
    if (!res || !Array.isArray(res.keys)) return res;
    return { ...res, keys: res.keys.map(normalizeKeyRow) };
  },
};

export const revokeKeyInput = {
  apiKeyId: z
    .string()
    .uuid("apiKeyId must be a UUID")
    .describe(
      "The apiKeyId (UUID) of the key to revoke — from list_keys. This is the ONLY argument: the key " +
        "knows which application it belongs to. NOT the key prefix and NOT the plaintext key.",
    ),
} as const;

const revokeSchema = z.object(revokeKeyInput);

export const revokeKeyTool: ToolDef = {
  name: "revoke_key",
  title: "Revoke an API key",
  scope: SCOPES.keysMint,
  description:
    "Immediately and permanently revoke a paylod merchant API key by its apiKeyId " +
    "(POST /api-keys/{apiKeyId}/revoke), returning { revoked: true, apiKeyId, prefix }. `apiKeyId` is the " +
    "ONLY argument — the key already knows its application, so you do not pass applicationId or env. " +
    "Any REST call using that key stops working at once. This is a soft delete (the audit trail is kept) " +
    "and it is IDEMPOTENT — revoking an already-revoked key succeeds with alreadyRevoked: true. Use this " +
    "to clean up a key you minted for a demo or a test. Requires the keys.mint scope.",
  inputSchema: revokeKeyInput,
  handler: async (client, args) => {
    const { apiKeyId } = revokeSchema.parse(args);
    return client.request("POST", `/api-keys/${apiKeyId}/revoke`);
  },
};
