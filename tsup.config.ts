import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  platform: "node",
  outDir: "dist",
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: true,
  // Preserve the shebang so `npx @paylod/mcp` and the `paylod-mcp` bin are executable.
  banner: { js: "#!/usr/bin/env node" },
});
