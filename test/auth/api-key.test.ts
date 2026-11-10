import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  getApiKeyFile,
  loadCachedApiKey,
  resolveApiKey,
  saveApiKey,
} from "../../src/auth/api-key.js"

let root: string
let configDir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "opensea-api-key-test-"))
  configDir = join(root, "config")
  vi.stubEnv("OPENSEA_CONFIG_DIR", configDir)
  vi.stubEnv("OPENSEA_API_KEY", "")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

function writeCache(contents: string): void {
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, "api_key"), contents)
}

describe("getApiKeyFile", () => {
  test("is api_key inside OPENSEA_CONFIG_DIR", () => {
    expect(getApiKeyFile()).toBe(join(configDir, "api_key"))
  })
})

describe("loadCachedApiKey", () => {
  test("reads the file the shell helper writes (key plus newline)", () => {
    writeCache("cached-key\n")
    expect(loadCachedApiKey()).toBe("cached-key")
  })

  test("returns undefined when the file is missing", () => {
    expect(loadCachedApiKey()).toBeUndefined()
  })

  test("returns undefined when the file is empty", () => {
    writeCache("")
    expect(loadCachedApiKey()).toBeUndefined()
  })

  test("returns undefined when the file is only whitespace", () => {
    writeCache(" \n\t\n")
    expect(loadCachedApiKey()).toBeUndefined()
  })

  test("warns and returns undefined when the path is not a file", () => {
    mkdirSync(join(configDir, "api_key"), { recursive: true })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(loadCachedApiKey()).toBeUndefined()
    expect(warn.mock.calls.flat().join("")).toContain("not a regular file")
  })

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "warns and returns undefined when the file is unreadable",
    () => {
      writeCache("cached-key\n")
      chmodSync(join(configDir, "api_key"), 0o000)
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      expect(loadCachedApiKey()).toBeUndefined()
      expect(warn.mock.calls.flat().join("")).toContain("could not read")
      expect(warn.mock.calls.flat().join("")).not.toContain("cached-key")
    },
  )
})

describe("resolveApiKey", () => {
  test("prefers the flag over the environment and the cache", () => {
    vi.stubEnv("OPENSEA_API_KEY", "env-key")
    writeCache("cached-key\n")
    expect(resolveApiKey("flag-key")).toBe("flag-key")
  })

  test("prefers the environment over the cache", () => {
    vi.stubEnv("OPENSEA_API_KEY", "env-key")
    writeCache("cached-key\n")
    expect(resolveApiKey(undefined)).toBe("env-key")
  })

  test("falls back to the cache when flag and environment are unset", () => {
    writeCache("cached-key\n")
    expect(resolveApiKey(undefined)).toBe("cached-key")
  })

  test("treats an empty flag and whitespace environment as unset", () => {
    vi.stubEnv("OPENSEA_API_KEY", "  ")
    writeCache("cached-key\n")
    expect(resolveApiKey("")).toBe("cached-key")
  })

  test("returns undefined when no source has a key", () => {
    writeCache("\n")
    expect(resolveApiKey(undefined)).toBeUndefined()
  })
})

describe.skipIf(process.platform === "win32")("saveApiKey", () => {
  test("creates the directory 0700 and the file 0600 in the helper's format", () => {
    const path = saveApiKey("new-key")

    expect(path).toBe(join(configDir, "api_key"))
    expect(statSync(configDir).mode & 0o777).toBe(0o700)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(readFileSync(path, "utf-8")).toBe("new-key\n")
    expect(loadCachedApiKey()).toBe("new-key")
  })

  test("replaces an existing permissive file with a 0600 one", () => {
    writeCache("old-key\n")
    chmodSync(join(configDir, "api_key"), 0o644)

    saveApiKey("new-key")

    const path = join(configDir, "api_key")
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(readFileSync(path, "utf-8")).toBe("new-key\n")
  })

  test("leaves no temporary file behind", () => {
    saveApiKey("new-key")
    expect(readdirSync(configDir)).toEqual(["api_key"])
  })

  test("cleans up and throws when the target cannot be replaced", () => {
    mkdirSync(join(configDir, "api_key", "child"), { recursive: true })

    expect(() => saveApiKey("new-key")).toThrow(/Failed to write API key/)
    expect(readdirSync(configDir)).toEqual(["api_key"])
  })

  test("refuses an empty or whitespace key", () => {
    expect(() => saveApiKey(" \n")).toThrow(/empty API key/)
    expect(() => statSync(configDir)).toThrow()
  })
})
