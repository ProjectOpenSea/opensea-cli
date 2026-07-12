import { rmSync } from "node:fs"
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

function jwt(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString("base64url")
    .replace(/=+$/, "")
  return `header.${encoded}.signature`
}

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true })
})

describe("auth store", () => {
  test("derives missing stored scopes from the OpenSea JWT claim", () => {
    const token = {
      accessToken: jwt({
        opensea_scopes:
          "write:orders read:eligibility read:rewards unknown:scope",
      }),
      refreshToken: "refresh",
      expiresAt: "2030-01-01T00:00:00.000Z",
      scopes: [],
      address: "0xAbC",
    }
    saveToken(token)

    expect(loadCurrentToken()?.scopes).toEqual([
      "read:eligibility",
      "write:orders",
    ])
    expect(loadToken("0xabc")?.scopes).toEqual([
      "read:eligibility",
      "write:orders",
    ])
    expect(listTokens()[0]?.scopes).toEqual([
      "read:eligibility",
      "write:orders",
    ])
  })

  test("preserves a non-empty stored scope list", () => {
    saveToken({
      accessToken: jwt({ opensea_scopes: "write:orders" }),
      refreshToken: "refresh",
      expiresAt: "2030-01-01T00:00:00.000Z",
      scopes: ["read:favorites"],
      address: "0xabc",
    })

    expect(loadCurrentToken()?.scopes).toEqual(["read:favorites"])
  })

  test("lists mixed stored and derived scope states", () => {
    saveToken({
      accessToken: jwt({ opensea_scopes: "write:orders" }),
      refreshToken: "refresh-1",
      expiresAt: "2030-01-01T00:00:00.000Z",
      scopes: [],
      address: "0xabc",
    })
    saveToken({
      accessToken: jwt({ opensea_scopes: "write:orders" }),
      refreshToken: "refresh-2",
      expiresAt: "2030-01-01T00:00:00.000Z",
      scopes: ["read:favorites"],
      address: "0xdef",
    })

    expect(listTokens().map(token => token.scopes)).toEqual([
      ["write:orders"],
      ["read:favorites"],
    ])
  })

  test("leaves scopes empty for a malformed access token", () => {
    saveToken({
      accessToken: "not-a-jwt",
      refreshToken: "refresh",
      expiresAt: "2030-01-01T00:00:00.000Z",
      scopes: [],
      address: "0xabc",
    })

    expect(loadCurrentToken()?.scopes).toEqual([])
  })
})
