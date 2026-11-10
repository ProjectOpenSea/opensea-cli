import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest"
import { createProgram } from "../src/program.js"

let configDir: string
let fetchSpy: MockInstance<typeof fetch>

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "opensea-cli-api-key-test-"))
  vi.stubEnv("OPENSEA_CONFIG_DIR", configDir)
  vi.stubEnv("OPENSEA_API_KEY", "")
  vi.stubEnv("OPENSEA_AUTH_TOKEN", "")
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () => new Response(JSON.stringify({}), { status: 200 }),
    )
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  rmSync(configDir, { recursive: true, force: true })
})

function sentApiKey(): string | undefined {
  const init = fetchSpy.mock.calls[0][1] as RequestInit
  return (init.headers as Record<string, string>)["x-api-key"]
}

async function run(...argv: string[]): Promise<void> {
  await createProgram().parseAsync(argv, { from: "user" })
}

describe("API key resolution through the full program", () => {
  it("sends the cached key when neither --api-key nor the env var is set", async () => {
    mkdirSync(configDir, { recursive: true })
    writeFileSync(join(configDir, "api_key"), "cached-key\n")

    await run("collections", "get", "mfers")

    expect(sentApiKey()).toBe("cached-key")
  })

  it("sends --api-key over the env var and the cached key", async () => {
    vi.stubEnv("OPENSEA_API_KEY", "env-key")
    writeFileSync(join(configDir, "api_key"), "cached-key\n")

    await run("--api-key", "flag-key", "collections", "get", "mfers")

    expect(sentApiKey()).toBe("flag-key")
  })

  it("exits 2 and points at request-key --save when no key is found", async () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(process, "exit").mockImplementation(code => {
      throw new Error(`process.exit(${code})`)
    })

    await expect(run("collections", "get", "mfers")).rejects.toThrow(
      "process.exit(2)",
    )

    const message = stderr.mock.calls.flat().join("")
    expect(message).toContain("opensea auth request-key --save")
    expect(message).toContain(join(configDir, "api_key"))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
