#!/usr/bin/env node
/**
 * Drift guard for `src/docs-bundle.ts`.
 *
 * That file is GENERATED from the paylod docs markdown (`mpesa/web/content/docs/**`) by
 * `mpesa/scripts/sync-agent-docs.mjs`. It must never be hand-edited — a hand-maintained copy of
 * the docs is precisely what left this server teaching raw `fetch` calls and a hand-rolled
 * polling loop long after `@paylod/node` shipped.
 *
 * Three checks, in order:
 *   1. The file's recorded `payload-sha256` must match its own body. Catches ANY hand-edit,
 *      from any machine, even one that cannot see the mpesa repo (CI, a fresh clone).
 *   2. The `get_docs` TOOL SCHEMA must still be derived from that bundle — its `topic` enum has to
 *      equal {every topic id} ∪ {every alias} ∪ {"all"}, exactly. This is check (1)'s twin, and it
 *      exists because the bundle was regenerated for months while the enum was left hand-written:
 *      the published schema kept offering a `callback-url` topic that no longer existed and never
 *      offered `sdk` at all, so an agent that trusted the enum could not find the SDK doc and
 *      hand-rolled the fetch + polling loop the SDK exists to delete. Paste a literal list in
 *      place of the derivation and the build now fails here.
 *   3. If the mpesa repo IS beside us, re-run the generator in `--check` mode: catches the copy
 *      being stale relative to the docs, not just internally consistent.
 *
 * Runs on `npm run build`, `prepublishOnly` and `npm test`. Exit 1 on drift.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Lets `node` follow the NodeNext ".js" specifiers in our TS sources (../docs-bundle.js → .ts).
register("./ts-resolve-hook.mjs", import.meta.url);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "src/docs-bundle.ts");
// The docs repo. Defaults to a sibling checkout; MPESA_REPO points it at an explicit tree, which is
// how you verify against a clean `git archive HEAD` export while someone else's work is uncommitted
// in the working copy (see DEPLOYMENT.md L1 — never ship a dirty tree).
const MPESA = process.env.MPESA_REPO
  ? resolve(process.env.MPESA_REPO)
  : resolve(ROOT, "..", "mpesa");
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

// ---------------------------------------------------------------------------
// (2) The published tool schema must still BE the bundle, not a copy of it.
// ---------------------------------------------------------------------------

const { DOC_TOPICS } = await import(pathToFileURL(join(ROOT, "src/docs-bundle.ts")).href);
const { getDocsTool } = await import(pathToFileURL(join(ROOT, "src/tools/docs.ts")).href);

/** What the enum MUST be, straight from the generated bundle. */
const wantTopics = [
  ...DOC_TOPICS.map((t) => t.id),
  "all",
  ...DOC_TOPICS.flatMap((t) => t.aliases),
].sort();

// The zod enum as an MCP client sees it after schema generation. `topic` is `.optional()`, so it
// is a ZodOptional wrapping the ZodEnum — unwrap before reading `.options`.
const topicField = getDocsTool.inputSchema.topic;
const enumField = typeof topicField.unwrap === "function" ? topicField.unwrap() : topicField;
const haveTopics = [...enumField.options].sort();

const missing = wantTopics.filter((t) => !haveTopics.includes(t));
const extra = haveTopics.filter((t) => !wantTopics.includes(t));

if (missing.length || extra.length) {
  console.error("✗ DRIFT: get_docs's `topic` enum does not match the docs bundle.");
  if (missing.length) console.error(`  the schema does NOT offer: ${missing.join(", ")}`);
  if (extra.length) console.error(`  the schema offers, but no such topic: ${extra.join(", ")}`);
  console.error("  The enum is DERIVED (src/tools/docs.ts → ACCEPTED_TOPIC_IDS). Do not paste a");
  console.error("  literal list in — that is the bug this check exists to prevent. Add/rename the");
  console.error("  topic in mpesa/web/lib/docs/bundle.ts and run: node scripts/sync-agent-docs.mjs");
  process.exit(1);
}

// The prose must advertise every topic too — an enum nobody is told about is barely better.
const description = getDocsTool.inputSchema.topic.description ?? "";
const unadvertised = DOC_TOPICS.map((t) => t.id).filter((id) => !description.includes(`'${id}'`));
if (unadvertised.length) {
  console.error(`✗ DRIFT: get_docs's topic description never mentions: ${unadvertised.join(", ")}`);
  console.error("  It is rendered from DOC_TOPICS (src/tools/docs.ts → TOPIC_DESCRIPTION).");
  process.exit(1);
}

console.log(`✓ get_docs advertises all ${wantTopics.length} topics + aliases, derived from the bundle`);

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
