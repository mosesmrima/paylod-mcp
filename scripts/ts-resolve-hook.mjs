/**
 * A 20-line resolver so plain `node` can import this package's TypeScript sources.
 *
 * Node ≥22.6 strips the types out of a `.ts` file happily, but it resolves specifiers literally.
 * Our TS is NodeNext, so it imports `"../docs-bundle.js"` — a file that does not exist on disk
 * until tsup runs. This hook retries such a specifier as `.ts`, which is exactly what tsc does.
 *
 * Used by scripts/check-docs-bundle.mjs to import the real `get_docs` tool definition and assert
 * its schema still derives from the generated bundle.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && specifier.endsWith(".js")) {
    const asTs = `${specifier.slice(0, -3)}.ts`;
    try {
      const candidate = await nextResolve(asTs, context);
      if (existsSync(fileURLToPath(candidate.url))) return candidate;
    } catch {
      // fall through to the default resolution below
    }
  }
  return nextResolve(specifier, context);
}
