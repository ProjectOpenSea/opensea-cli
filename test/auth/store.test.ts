import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
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
  requestedScopes: ["read:eligibility"],
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

  test.skipIf(process.platform === "win32")(
    "repairs permissive auth directory and file modes",
    () => {
      mkdirSync(`${testHome}/.opensea`, { recursive: true, mode: 0o755 })
      writeFileSync(
        `${testHome}/.opensea/auth.json`,
        JSON.stringify({ tokens: {} }),
      )
      chmodSync(`${testHome}/.opensea`, 0o755)
      chmodSync(`${testHome}/.opensea/auth.json`, 0o644)

      saveToken(baseToken)

      expect(statSync(`${testHome}/.opensea`).mode & 0o777).toBe(0o700)
      expect(statSync(`${testHome}/.opensea/auth.json`).mode & 0o777).toBe(
        0o600,
      )
    },
  )

  test.skipIf(process.platform === "win32")(
    "refuses to follow an auth file symlink",
    () => {
      const target = `${testHome}/target.json`
      mkdirSync(`${testHome}/.opensea`, { recursive: true })
      writeFileSync(target, "do not overwrite", { mode: 0o644 })
      symlinkSync(target, `${testHome}/.opensea/auth.json`)

      expect(() => saveToken(baseToken)).toThrow(
        "auth store path is not a regular file",
      )
      expect(readFileSync(target, "utf8")).toBe("do not overwrite")
      expect(statSync(target).mode & 0o777).toBe(0o644)
    },
  )

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

  test("stores the scoped token id used by SIWE revocation", () => {
    const siweToken = {
      ...baseToken,
      authMethod: "siwe" as const,
      scopedTokenId: "381768924447939181",
      sessionCookie: "access_token=session; refresh_token=refresh",
    }

    saveToken(siweToken)

    expect(loadCurrentToken()).toEqual(siweToken)
  })

  test("rejects SIWE stores without session management credentials", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mkdirSync(`${testHome}/.opensea`, { recursive: true })
    writeFileSync(
      `${testHome}/.opensea/auth.json`,
      JSON.stringify({
        currentAddress: "0xabc",
        tokens: {
          "0xabc": {
            ...baseToken,
            address: "0xabc",
            authMethod: "siwe",
            scopedTokenId: "pat-id",
          },
        },
      }),
    )

    expect(loadCurrentToken()).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("corrupted or incompatible"),
    )
  })

  test("rejects prerelease stores missing requested scopes", () => {
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
            authMethod: "oauth",
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
