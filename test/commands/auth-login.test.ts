import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { getAddress, loadCurrentToken, removeToken, saveToken, signMessage } =
  vi.hoisted(() => ({
    getAddress: vi.fn(async () => "0xfBa662e1a8e91a350702cF3b87D0C2d2Fb4BA57F"),
    loadCurrentToken: vi.fn(),
    removeToken: vi.fn(),
    saveToken: vi.fn(),
    signMessage: vi.fn(function (this: { getAddress?: unknown }) {
      if (!this?.getAddress) throw new Error("wallet adapter binding lost")
      return Promise.resolve("0xsigned")
    }),
  }))

vi.mock("../../src/auth/store.js", () => ({
  clearTokens: vi.fn(),
  listTokens: vi.fn(() => []),
  loadCurrentToken,
  removeToken,
  saveToken,
}))

vi.mock("@opensea/wallet-adapters", () => ({
  createWalletFromEnv: vi.fn(),
  PrivateKeyAdapter: vi.fn(() => ({ getAddress, signMessage })),
}))

import { authCommand } from "../../src/commands/auth.js"
import { createCommandTestContext } from "../mocks.js"

describe("auth login", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    delete process.env.OPENSEA_AUTH_TOKEN
    delete process.env.OPENSEA_PRIVATE_KEY
  })

  it("links a wallet with OPENSEA_PRIVATE_KEY and preserves adapter binding", async () => {
    process.env.OPENSEA_AUTH_TOKEN = "wallet-jwt"
    process.env.OPENSEA_PRIVATE_KEY = "fixture-private-key"
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nonce: "abcd1234efgh5678" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            linkedWalletAddress: "0xfBa662e1a8e91a350702cF3b87D0C2d2Fb4BA57F",
          }),
          { status: 200 },
        ),
      )

    await authCommand(
      () => undefined,
      createCommandTestContext().getFormat,
    ).parseAsync(["link-wallet", "--api-key", "api-key"], {
      from: "user",
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(signMessage).toHaveBeenCalledOnce()
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"status": "linked"'),
    )
  })

  it("uses the current SIWE and scoped-token endpoints", async () => {
    const sessionHeaders = new Headers()
    sessionHeaders.append(
      "set-cookie",
      "access_token=session-access; Path=/; HttpOnly",
    )
    sessionHeaders.append(
      "set-cookie",
      "refresh_token=session-refresh; Path=/; HttpOnly",
    )
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nonce: "abcd1234efgh5678" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response("{}", { status: 200, headers: sessionHeaders }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "381768924447939181",
            token: "pat-value",
            scopes: ["write:wallets"],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "wallet-jwt",
            expiresIn: 3600,
            tokenScopes: ["write:wallets"],
          }),
          { status: 200 },
        ),
      )

    await authCommand(
      () => undefined,
      createCommandTestContext().getFormat,
    ).parseAsync(
      ["login", "--private-key", "test-key", "--scopes", "write:wallets"],
      { from: "user" },
    )

    expect(fetchSpy).toHaveBeenCalledTimes(4)
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://api.opensea.io/api/v2/auth/siwe/nonce",
    )
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: "POST" })

    const [verifyUrl, verifyInit] = fetchSpy.mock.calls[1] as [
      string,
      RequestInit,
    ]
    expect(verifyUrl).toBe("https://api.opensea.io/api/v2/auth/siwe/verify")
    const verifyBody = JSON.parse(verifyInit.body as string) as {
      message: { accountType: string }
      chainArch: string
    }
    expect(verifyBody.message.accountType).toBe("Ethereum")
    expect(verifyBody.chainArch).toBe("EVM")

    const [createUrl, createInit] = fetchSpy.mock.calls[2] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    expect(createUrl).toBe("https://api.opensea.io/api/v2/auth/tokens")
    expect(createInit.headers.Cookie).toContain("access_token=session-access")
    expect(createInit.headers.Cookie).toContain("refresh_token=session-refresh")
    expect(JSON.parse(createInit.body as string)).toMatchObject({
      scopes: ["write:wallets"],
      expiresInDays: 1,
    })

    const [exchangeUrl, exchangeInit] = fetchSpy.mock.calls[3] as [
      string,
      RequestInit,
    ]
    expect(exchangeUrl).toBe(
      "https://api.opensea.io/api/v2/auth/tokens/exchange",
    )
    expect(JSON.parse(exchangeInit.body as string)).toEqual({
      subjectToken: "pat-value",
      subjectTokenType: "ACCESS_TOKEN",
    })
    expect(saveToken).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "wallet-jwt",
        refreshToken: "pat-value",
        scopedTokenId: "381768924447939181",
        requestedScopes: ["write:wallets"],
        scopes: ["write:wallets"],
        authMethod: "siwe",
      }),
    )
  })

  it("revokes a newly created scoped token when exchange fails", async () => {
    const sessionHeaders = new Headers()
    sessionHeaders.append(
      "set-cookie",
      "access_token=session-access; Path=/; HttpOnly",
    )
    sessionHeaders.append(
      "set-cookie",
      "refresh_token=session-refresh; Path=/; HttpOnly",
    )
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nonce: "abcd1234efgh5678" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response("{}", { status: 200, headers: sessionHeaders }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "381768924447939181",
            token: "pat-value",
            scopes: ["write:wallets"],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("exchange failed", { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(
      authCommand(
        () => undefined,
        createCommandTestContext().getFormat,
      ).parseAsync(
        ["login", "--private-key", "test-key", "--scopes", "write:wallets"],
        { from: "user" },
      ),
    ).rejects.toThrow("Token exchange failed (502): exchange failed")

    expect(fetchSpy).toHaveBeenCalledTimes(5)
    expect(fetchSpy.mock.calls[4]).toEqual([
      "https://api.opensea.io/api/v2/auth/tokens/381768924447939181",
      {
        method: "DELETE",
        headers: {
          Cookie: "access_token=session-access; refresh_token=session-refresh",
        },
      },
    ])
    expect(saveToken).not.toHaveBeenCalled()
  })

  it("revokes the scoped token through the current API", async () => {
    loadCurrentToken.mockReturnValue({
      accessToken: "wallet-jwt",
      refreshToken: "pat-value",
      scopedTokenId: "381768924447939181",
      expiresAt: "2030-01-01T00:00:00.000Z",
      requestedScopes: ["write:wallets"],
      scopes: ["write:wallets"],
      address: "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f",
      authMethod: "siwe",
    })
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }))

    await authCommand(
      () => undefined,
      createCommandTestContext().getFormat,
    ).parseAsync(["revoke"], { from: "user" })

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.opensea.io/api/v2/auth/tokens/381768924447939181",
      {
        method: "DELETE",
        headers: { Authorization: "Bearer wallet-jwt" },
      },
    )
    expect(removeToken).toHaveBeenCalledWith(
      "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f",
    )
  })
})
