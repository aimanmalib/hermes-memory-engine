import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

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
    define: {
      __PKG_VERSION__: JSON.stringify(version),
    },
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
