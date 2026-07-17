import { afterEach, describe, expect, it, vi } from "vitest"
import {
  resolvePrivateKey,
  warnIfInlinePrivateKey,
} from "../../src/auth/private-key.js"

describe("resolvePrivateKey", () => {
  afterEach(() => {
    delete process.env.OPENSEA_PRIVATE_KEY
    vi.restoreAllMocks()
  })

  it("returns the inline option value and flags it as an argument", () => {
    const result = resolvePrivateKey("inline-key")
    expect(result.privateKey).toBe("inline-key")
    expect(result.source).toBe("argument")
  })

  it("falls back to OPENSEA_PRIVATE_KEY when the option is passed without a value", () => {
    process.env.OPENSEA_PRIVATE_KEY = "env-key"
    const result = resolvePrivateKey(true)
    expect(result.privateKey).toBe("env-key")
    expect(result.source).toBe("environment")
  })

  it("falls back to OPENSEA_PRIVATE_KEY when the option is omitted", () => {
    process.env.OPENSEA_PRIVATE_KEY = "env-key"
    const result = resolvePrivateKey(undefined)
    expect(result.privateKey).toBe("env-key")
    expect(result.source).toBe("environment")
  })

  it("throws when no private key is available", () => {
    expect(() => resolvePrivateKey(undefined)).toThrow(
      "Private key required. Set OPENSEA_PRIVATE_KEY or pass --private-key <key>.",
    )
  })
})

describe("warnIfInlinePrivateKey", () => {
  it("emits a stderr warning for inline arguments", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    warnIfInlinePrivateKey("argument")
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("insecure"))
    errSpy.mockRestore()
  })

  it("does not warn when the key comes from the environment", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    warnIfInlinePrivateKey("environment")
    expect(errSpy).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
