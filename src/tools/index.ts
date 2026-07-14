import { accountBalanceTool } from "./account-balance.js";
import { createApplicationTool, getCallbackUrlTool } from "./applications.js";
import { listApplicationsTool } from "./apps.js";
import { authenticateTool } from "./authenticate.js";
import { registerC2bTool } from "./c2b.js";
import { collectTool } from "./collect.js";
import { setCredentialsTool } from "./credentials.js";
import { decodeErrorTool } from "./decode-error.js";
import { getDocsTool } from "./docs.js";
import { listKeysTool, revokeKeyTool } from "./keys.js";
import { mintKeyTool } from "./mint-key.js";
import { payoutTool } from "./payout.js";
import { createAppTool } from "./provision.js";
import { qrTool } from "./qr.js";
import { reversalTool } from "./reversal.js";
import { simulateCollectTool, simulateOutcomeTool } from "./simulate.js";
import { statusTool } from "./status.js";
import { transactionStatusTool } from "./transaction-status.js";
import type { ToolDef } from "./types.js";
import { configureWebhookTool, listWebhooksTool } from "./webhooks.js";

/**
 * The full 23-tool surface (contract §2.2 / §6), in a stable display order.
 * Every tool authenticates with the OAuth access token; access is gated by the
 * per-tool `scope` at dispatch, not by an allowlist.
 *
 * `create_app` (POST /provision) bootstraps the FIRST org+app only — it 409s for an
 * existing user — so `create_application` (POST /applications) is the tool for every app
 * after that. `get_callback_url` returns the Daraja portal URL, without which an M-Pesa
 * setup cannot be completed.
 */
export const ALL_TOOLS: readonly ToolDef[] = [
  // session
  authenticateTool,
  // discovery / management
  listApplicationsTool,
  createAppTool,
  createApplicationTool,
  getCallbackUrlTool,
  setCredentialsTool,
  mintKeyTool,
  listKeysTool,
  revokeKeyTool,
  configureWebhookTool,
  listWebhooksTool,
  // payments — money-in / read
  collectTool,
  statusTool,
  qrTool,
  registerC2bTool,
  accountBalanceTool,
  transactionStatusTool,
  // payments — money-out
  payoutTool,
  reversalTool,
  // sandbox
  simulateCollectTool,
  simulateOutcomeTool,
  // local (pure, offline — no scope, no network)
  decodeErrorTool,
  getDocsTool,
];

export type { ToolDef } from "./types.js";
