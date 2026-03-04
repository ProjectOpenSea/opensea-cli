import { readFileSync } from "node:fs"
import { defineConfig } from "vitest/config"

const { version } = JSON.parse(readFileSync("package.json", "utf-8")) as {
  version: string
}

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(version),
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
