import { readFileSync } from "node:fs"
import { defineConfig } from "vitest/config"

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as {
  version: string
}

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/types/**"],
    },
  },
})
