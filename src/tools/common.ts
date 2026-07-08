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

export const envField = z
  .enum(["sandbox", "production"])
  .describe("Which environment of the application to target: 'sandbox' or 'production'.");
