import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    outDir: "dist",
  },
  {
    entry: ["src/cli/index.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: true,
    splitting: false,
    outDir: "dist/cli",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
