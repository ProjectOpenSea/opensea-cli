import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { afterEach, describe, expect, test, vi } from "vitest"

const { testHome } = vi.hoisted(() => ({
  testHome: "/tmp/opensea-cli-auth-store-test",
}))

vi.mock("node:os", () => ({ homedir: () => testHome }))

import {
  listTokens,
  loadCurrentToken,
  loadToken,
  saveToken,
} from "../../src/auth/store.js"

const baseToken = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: "2030-01-01T00:00:00.000Z",
  scopes: ["read:eligibility"],
  address: "0xAbC",
  authMethod: "oauth" as const,
}

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe("auth store", () => {
  test("stores EVM addresses case-insensitively", () => {
    saveToken(baseToken)

    expect(loadCurrentToken()).toEqual(baseToken)
    expect(loadToken("0xabc")).toEqual(baseToken)
    expect(loadToken("0xABC")).toEqual(baseToken)
    expect(loadToken("0XABC")).toEqual(baseToken)
  })

  test("preserves case-sensitive Solana addresses", () => {
    const solanaToken = {
      ...baseToken,
      address: "SoLanaCaseSensitiveAddress123",
    }
    saveToken(solanaToken)

    expect(loadCurrentToken()).toEqual(solanaToken)
    expect(loadToken("SoLanaCaseSensitiveAddress123")).toEqual(solanaToken)
    expect(loadToken("solanacasesensitiveaddress123")).toBeUndefined()
  })

  test("lists tokens without deriving or rewriting persisted scopes", () => {
    saveToken(baseToken)
    saveToken({
      ...baseToken,
      address: "0xdef",
      scopes: ["write:orders"],
    })

    expect(listTokens().map(token => token.scopes)).toEqual([
      ["read:eligibility"],
      ["write:orders"],
    ])
  })

  test("rejects prerelease stores missing required token fields", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mkdirSync(`${testHome}/.opensea`, { recursive: true })
    writeFileSync(
      `${testHome}/.opensea/auth.json`,
      JSON.stringify({
        currentAddress: "0xabc",
        tokens: {
          "0xabc": {
            accessToken: "access",
            refreshToken: "refresh",
            expiresAt: "2030-01-01T00:00:00.000Z",
            scopes: ["read:eligibility"],
            address: "0xabc",
          },
        },
      }),
    )

    expect(loadCurrentToken()).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("corrupted or incompatible"),
    )
  })

  test("rejects stores whose key does not match the token address", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mkdirSync(`${testHome}/.opensea`, { recursive: true })
    writeFileSync(
      `${testHome}/.opensea/auth.json`,
      JSON.stringify({
        currentAddress: "0xdef",
        tokens: { "0xdef": baseToken },
      }),
    )

    expect(loadCurrentToken()).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
