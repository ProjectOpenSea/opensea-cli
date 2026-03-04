import { readFileSync } from "node:fs"
import { defineConfig } from "tsup"

const { version } = JSON.parse(readFileSync("package.json", "utf-8")) as {
  version: string
}

const define = { __VERSION__: JSON.stringify(version) }

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    clean: true,
    sourcemap: true,
    target: "node18",
    define,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    target: "node18",
    define,
  },
])
