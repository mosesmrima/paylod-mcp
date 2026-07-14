#!/usr/bin/env node
/**
 * Drift guard for `src/docs-bundle.ts`.
 *
 * That file is GENERATED from the paylod docs markdown (`mpesa/web/content/docs/**`) by
 * `mpesa/scripts/sync-agent-docs.mjs`. It must never be hand-edited — a hand-maintained copy of
 * the docs is precisely what left this server teaching raw `fetch` calls and a hand-rolled
 * polling loop long after `@paylod/node` shipped.
 *
 * Two checks, in order:
 *   1. The file's recorded `payload-sha256` must match its own body. Catches ANY hand-edit,
 *      from any machine, even one that cannot see the mpesa repo (CI, a fresh clone).
 *   2. If the mpesa repo IS beside us, re-run the generator in `--check` mode: catches the copy
 *      being stale relative to the docs, not just internally consistent.
 *
 * Runs on `prepublishOnly` and `npm test`. Exit 1 on drift.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "src/docs-bundle.ts");
const MPESA = resolve(ROOT, "..", "mpesa");
const MARKER = "// payload-sha256: ";

const src = readFileSync(FILE, "utf8");
const i = src.indexOf(MARKER);
if (i === -1) {
  console.error("✗ src/docs-bundle.ts has no payload-sha256 header — it is not the generated file.");
  process.exit(1);
}

const recorded = src.slice(i + MARKER.length, src.indexOf("\n", i)).trim();
const payload = src.slice(src.indexOf("\n", i) + 1);
const actual = createHash("sha256").update(payload).digest("hex");

if (recorded !== actual) {
  console.error("✗ DRIFT: src/docs-bundle.ts has been hand-edited.");
  console.error(`  recorded payload-sha256: ${recorded}`);
  console.error(`  actual   payload-sha256: ${actual}`);
  console.error("  This file is GENERATED. Fix the docs markdown in the mpesa repo");
  console.error("  (web/content/docs/**) and run: node scripts/sync-agent-docs.mjs");
  process.exit(1);
}

if (existsSync(join(MPESA, "scripts/sync-agent-docs.mjs"))) {
  const r = spawnSync("node", ["scripts/sync-agent-docs.mjs", "--check"], {
    cwd: MPESA,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(1);
} else {
  console.log("· mpesa repo not beside us — skipped the source comparison (hash check passed).");
}

console.log("✓ src/docs-bundle.ts matches its source.");
