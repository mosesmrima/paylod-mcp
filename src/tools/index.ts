import { accountBalanceTool } from "./account-balance.js";
import { collectTool } from "./collect.js";
import { decodeErrorTool } from "./decode-error.js";
import { mintKeyTool } from "./mint-key.js";
import { payoutTool } from "./payout.js";
import { qrTool } from "./qr.js";
import { reversalTool } from "./reversal.js";
import { simulateCollectTool, simulateOutcomeTool } from "./simulate.js";
import { statusTool } from "./status.js";
import { transactionStatusTool } from "./transaction-status.js";
import type { ToolDef } from "./types.js";

/** Every tool this server knows about, in a stable display order. */
export const ALL_TOOLS: readonly ToolDef[] = [
  // read
  statusTool,
  accountBalanceTool,
  transactionStatusTool,
  // local (pure, offline)
  decodeErrorTool,
  // qr (stateless)
  qrTool,
  // sandbox
  simulateCollectTool,
  simulateOutcomeTool,
  // opt-in / money-moving / elevated
  collectTool,
  payoutTool,
  reversalTool,
  mintKeyTool,
];

export type { ToolDef } from "./types.js";
