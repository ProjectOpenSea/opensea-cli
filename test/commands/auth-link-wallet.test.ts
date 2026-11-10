import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { linkWalletWithSiwx } = vi.hoisted(() => ({
  linkWalletWithSiwx: vi.fn(async () => ({ linkedWalletAddress: "0xabc" })),
}))

vi.mock("@opensea/sdk", async importOriginal => {
  const actual = await importOriginal<typeof import("@opensea/sdk")>()
  return { ...actual, linkWalletWithSiwx }
})

vi.mock("@opensea/wallet-adapters", async importOriginal => {
  const actual =
    await importOriginal<typeof import("@opensea/wallet-adapters")>()
  return {
    ...actual,
    PrivateKeyAdapter: vi.fn(() => ({
      getAddress: async () => "0xabc",
      signMessage: async () => "0xsig",
    })),
  }
})

import { authCommand } from "../../src/commands/auth.js"
import { createCommandTestContext } from "../mocks.js"

describe("auth link-wallet API key", () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "opensea-link-wallet-test-"))
    vi.stubEnv("OPENSEA_CONFIG_DIR", configDir)
    vi.stubEnv("OPENSEA_API_KEY", "")
    vi.stubEnv("OPENSEA_AUTH_TOKEN", "wallet-jwt")
    vi.stubEnv("OPENSEA_PRIVATE_KEY", "fixture-private-key")
    linkWalletWithSiwx.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(configDir, { recursive: true, force: true })
  })

  async function linkWallet(...args: string[]): Promise<void> {
    const ctx = createCommandTestContext()
    await authCommand(() => undefined, ctx.getFormat).parseAsync(
      ["link-wallet", ...args],
      { from: "user" },
    )
  }

  function sentApiKey(): unknown {
    const call = linkWalletWithSiwx.mock.calls[0] as unknown as [
      unknown,
      { apiKey?: string },
    ]
    return call[1].apiKey
  }

  it("uses the cached key when neither --api-key nor the env var is set", async () => {
    writeFileSync(join(configDir, "api_key"), "cached-key\n")

    await linkWallet()

    expect(sentApiKey()).toBe("cached-key")
  })

  it("prefers --api-key over the cached key", async () => {
    writeFileSync(join(configDir, "api_key"), "cached-key\n")

    await linkWallet("--api-key", "flag-key")

    expect(sentApiKey()).toBe("flag-key")
  })
})
