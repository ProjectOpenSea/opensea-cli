import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { loadCurrentToken, saveToken, oauthRefresh, OpenSeaOAuth } = vi.hoisted(
  () => ({
    loadCurrentToken: vi.fn(),
    saveToken: vi.fn(),
    oauthRefresh: vi.fn(),
    OpenSeaOAuth: vi.fn(() => ({ refresh: oauthRefresh })),
  }),
)

vi.mock("../../src/auth/store.js", () => ({
  clearTokens: vi.fn(),
  listTokens: vi.fn(() => []),
  loadCurrentToken,
  removeToken: vi.fn(),
  saveToken,
}))

vi.mock("@opensea/sdk", async importOriginal => {
  const actual = await importOriginal<typeof import("@opensea/sdk")>()
  return { ...actual, OpenSeaOAuth }
})

import { authCommand } from "../../src/commands/auth.js"
import { createCommandTestContext } from "../mocks.js"

const storedToken = {
  accessToken: "old-access",
  refreshToken: "old-refresh",
  expiresAt: "2030-01-01T00:00:00.000Z",
  scopes: ["read:eligibility"],
  address: "0xabc",
  authMethod: "oauth" as const,
}

describe("auth refresh", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    loadCurrentToken.mockReturnValue(storedToken)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    delete process.env.OPENSEA_OAUTH_CLIENT_ID
  })

  it("refreshes OAuth sessions through OIDC discovery", async () => {
    oauthRefresh.mockResolvedValue({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresAt: new Date("2031-01-01T00:00:00.000Z"),
      scopes: ["read:eligibility", "write:orders"],
    })
    const ctx = createCommandTestContext()
    const cmd = authCommand(
      () => undefined,
      ctx.getFormat,
      () => "https://auth.example.com",
    )

    await cmd.parseAsync(["refresh", "--client-id", "public-client"], {
      from: "user",
    })

    expect(OpenSeaOAuth).toHaveBeenCalledWith({
      clientId: "public-client",
      issuer: "https://auth.example.com",
    })
    expect(oauthRefresh).toHaveBeenCalledWith("old-refresh")
    expect(saveToken).toHaveBeenCalledWith({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresAt: "2031-01-01T00:00:00.000Z",
      scopes: ["read:eligibility", "write:orders"],
      address: "0xabc",
      authMethod: "oauth",
    })
  })

  it("refreshes SIWE sessions through the SIWE endpoint", async () => {
    loadCurrentToken.mockReturnValue({ ...storedToken, authMethod: "siwe" })
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "siwe-access",
          refresh_token: "siwe-refresh",
          expires_in: 3600,
          scopes: ["read:eligibility"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const ctx = createCommandTestContext()

    await authCommand(
      () => undefined,
      ctx.getFormat,
      () => "https://auth.example.com",
    ).parseAsync(["refresh"], { from: "user" })

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://auth.example.com/api/refresh",
      expect.any(Object),
    )
    expect(OpenSeaOAuth).not.toHaveBeenCalled()
    expect(saveToken).toHaveBeenCalledWith(
      expect.objectContaining({ authMethod: "siwe" }),
    )
  })

  it("surfaces OAuth token endpoint failures", async () => {
    oauthRefresh.mockRejectedValue(new Error("Token request failed (400)"))
    const ctx = createCommandTestContext()

    await expect(
      authCommand(() => undefined, ctx.getFormat).parseAsync(["refresh"], {
        from: "user",
      }),
    ).rejects.toThrow("Token request failed (400)")
  })
})
