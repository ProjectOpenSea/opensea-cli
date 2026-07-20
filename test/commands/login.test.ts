import { AUTH_SCOPES } from "@opensea/api-types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  loginWithLoopback,
  loginWithSiwe,
  saveToken,
  requestDeviceAuthorization,
  pollDeviceToken,
  OpenSeaOAuth,
  decodeJwtPayload,
} = vi.hoisted(() => {
  const requestDeviceAuthorization = vi.fn()
  const pollDeviceToken = vi.fn()
  return {
    loginWithLoopback: vi.fn(),
    loginWithSiwe: vi.fn(),
    saveToken: vi.fn(),
    requestDeviceAuthorization,
    pollDeviceToken,
    OpenSeaOAuth: vi.fn(() => ({
      requestDeviceAuthorization,
      pollDeviceToken,
    })),
    decodeJwtPayload: vi.fn(),
  }
})

// Use the real wallet-claim extractor while mocking the rest of the SDK, so
// the command's address requirement is exercised end-to-end.
vi.mock("@opensea/sdk", async importOriginal => {
  const actual = await importOriginal<typeof import("@opensea/sdk")>()
  return {
    OpenSeaOAuth,
    decodeJwtPayload,
    extractWalletAddress: actual.extractWalletAddress,
  }
})
vi.mock("../../src/auth/oauth-login.js", () => ({ loginWithLoopback }))
vi.mock("../../src/auth/siwe-login.js", () => ({ loginWithSiwe }))
vi.mock("../../src/auth/store.js", () => ({ saveToken }))

import { loginCommand } from "../../src/commands/login.js"
import type { OutputFormat } from "../../src/output.js"

const getFormat = () => "json" as OutputFormat

function token(overrides?: Partial<Record<string, unknown>>) {
  return {
    accessToken: "at",
    refreshToken: "rt",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    scopes: ["read:eligibility"],
    ...overrides,
  }
}

describe("loginCommand", () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    decodeJwtPayload.mockReturnValue({ wallet: "0xabc" })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    delete process.env.OPENSEA_OAUTH_CLIENT_ID
    delete process.env.OPENSEA_PRIVATE_KEY
  })

  it("runs the loopback flow, extracts the address, and saves the token", async () => {
    loginWithLoopback.mockResolvedValue(token())

    const cmd = loginCommand(getFormat)
    await cmd.parseAsync(
      ["--client-id", "public-client", "--scopes", "read:eligibility"],
      { from: "user" },
    )

    expect(OpenSeaOAuth).toHaveBeenCalledWith({
      clientId: "public-client",
      issuer: "https://auth.opensea.io",
    })
    expect(loginWithLoopback).toHaveBeenCalledTimes(1)
    const loopbackArgs = loginWithLoopback.mock.calls[0][1] as {
      scopes: string[]
    }
    expect(loopbackArgs.scopes).toEqual(["read:eligibility"])

    expect(saveToken).toHaveBeenCalledWith({
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: "2030-01-01T00:00:00.000Z",
      requestedScopes: ["read:eligibility"],
      scopes: ["read:eligibility"],
      address: "0xabc",
      authMethod: "oauth",
    })

    const output = JSON.parse(logSpy.mock.calls[0][0] as string) as {
      status: string
      address: string
    }
    expect(output.status).toBe("authenticated")
    expect(output.address).toBe("0xabc")
  })

  it("uses OPENSEA_OAUTH_CLIENT_ID when --client-id is omitted", async () => {
    process.env.OPENSEA_OAUTH_CLIENT_ID = "env-client"
    loginWithLoopback.mockResolvedValue(token())

    const cmd = loginCommand(getFormat)
    await cmd.parseAsync([], { from: "user" })

    expect(OpenSeaOAuth).toHaveBeenCalledWith({
      clientId: "env-client",
      issuer: "https://auth.opensea.io",
    })
    const loopbackArgs = loginWithLoopback.mock.calls[0][1] as {
      scopes: string[]
    }
    expect(loopbackArgs.scopes).toEqual(AUTH_SCOPES.map(({ name }) => name))
    expect(loopbackArgs.scopes).not.toContain("read:rewards")
  })

  it("distinguishes requested and broader granted scopes", async () => {
    loginWithLoopback.mockResolvedValue(
      token({
        scopes: ["read:favorites", "write:favorites", "write:drops"],
        scopeSource: "authorization_server",
      }),
    )

    const cmd = loginCommand(getFormat)
    await cmd.parseAsync(
      [
        "--client-id",
        "public-client",
        "--scopes",
        "read:favorites,write:favorites",
      ],
      { from: "user" },
    )

    const output = JSON.parse(logSpy.mock.calls[0][0] as string) as {
      requested_scopes: string[]
      granted_scopes: string[]
      scope_warning: { type: string; scopes: string[] }
    }
    expect(output.requested_scopes).toEqual([
      "read:favorites",
      "write:favorites",
    ])
    expect(output.granted_scopes).toEqual([
      "read:favorites",
      "write:favorites",
      "write:drops",
    ])
    expect(output.scope_warning).toEqual({
      type: "broader_than_requested",
      scopes: ["write:drops"],
    })
    expect(saveToken).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedScopes: ["read:favorites", "write:favorites"],
      }),
    )
    expect(errSpy).toHaveBeenCalledWith(
      "Warning: the authorization server granted scopes outside the requested set: write:drops",
    )
  })

  it("uses the device flow when --device is passed", async () => {
    requestDeviceAuthorization.mockResolvedValue({
      device_code: "dc",
      user_code: "WXYZ-1234",
      verification_uri: "https://auth.opensea.io/device",
      expires_in: 600,
      interval: 5,
    })
    pollDeviceToken.mockResolvedValue(token())

    const cmd = loginCommand(getFormat)
    await cmd.parseAsync(["--client-id", "public-client", "--device"], {
      from: "user",
    })

    expect(requestDeviceAuthorization).toHaveBeenCalledTimes(1)
    expect(pollDeviceToken).toHaveBeenCalledTimes(1)
    expect(loginWithLoopback).not.toHaveBeenCalled()
    expect(saveToken).toHaveBeenCalledTimes(1)
  })

  it("prints the authorization URL instead of opening a browser with --no-browser", async () => {
    loginWithLoopback.mockImplementation(
      (_oauth: unknown, opts: { openBrowser: (url: string) => void }) => {
        opts.openBrowser("https://auth.opensea.io/oauth/v2/authorize?x=1")
        return Promise.resolve(token())
      },
    )

    const cmd = loginCommand(getFormat)
    await cmd.parseAsync(["--client-id", "public-client", "--no-browser"], {
      from: "user",
    })

    expect(
      errSpy.mock.calls.some(call =>
        String(call[0]).includes("oauth/v2/authorize"),
      ),
    ).toBe(true)
  })

  it("rejects tokens with an account subject but no wallet claim", async () => {
    decodeJwtPayload.mockReturnValue({ sub: "account-42" })
    loginWithLoopback.mockResolvedValue(token())

    const cmd = loginCommand(getFormat)
    await expect(
      cmd.parseAsync(["--client-id", "public-client"], { from: "user" }),
    ).rejects.toThrow("missing the required wallet claim")

    expect(saveToken).not.toHaveBeenCalled()
  })

  it("rejects opaque access tokens instead of saving an unknown wallet", async () => {
    decodeJwtPayload.mockImplementation(() => {
      throw new Error("Not a JWT")
    })
    loginWithLoopback.mockResolvedValue(token({ accessToken: "opaque-token" }))

    const cmd = loginCommand(getFormat)
    await expect(
      cmd.parseAsync(["--client-id", "public-client"], { from: "user" }),
    ).rejects.toThrow("Not a JWT")

    expect(saveToken).not.toHaveBeenCalled()
  })

  it("falls back to the OpenSea public client id when none is provided", async () => {
    loginWithLoopback.mockResolvedValue(token())

    const cmd = loginCommand(getFormat)
    await cmd.parseAsync([], { from: "user" })

    expect(OpenSeaOAuth).toHaveBeenCalledWith({
      clientId: "379893200225068569",
      issuer: "https://auth.opensea.io",
    })
  })

  it("honors the getAuthBaseUrl override for the issuer", async () => {
    loginWithLoopback.mockResolvedValue(token())

    const cmd = loginCommand(
      getFormat,
      () => "https://auth.testnets.opensea.io",
    )
    await cmd.parseAsync(["--client-id", "public-client"], { from: "user" })

    expect(OpenSeaOAuth).toHaveBeenCalledWith({
      clientId: "public-client",
      issuer: "https://auth.testnets.opensea.io",
    })
  })

  it("uses SIWE when --private-key is provided", async () => {
    loginWithSiwe.mockResolvedValue({
      accessToken: "siwe-at",
      refreshToken: "siwe-rt",
      scopedTokenId: "siwe-id",
      sessionCookie: "access_token=session; refresh_token=refresh",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      requestedScopes: ["write:wallets"],
      scopes: ["write:wallets"],
      scopeSource: "token_creation" as const,
      address: "0xsiwe",
    })

    const cmd = loginCommand(
      getFormat,
      () => undefined,
      () => "https://testnets-api.opensea.io",
    )
    await cmd.parseAsync(
      ["--private-key", "test-key", "--scopes", "write:wallets"],
      { from: "user" },
    )

    expect(loginWithSiwe).toHaveBeenCalledWith({
      baseUrl: "https://testnets-api.opensea.io",
      privateKey: "test-key",
      scopes: ["write:wallets"],
    })
    expect(loginWithLoopback).not.toHaveBeenCalled()
    expect(saveToken).toHaveBeenCalledWith({
      accessToken: "siwe-at",
      refreshToken: "siwe-rt",
      scopedTokenId: "siwe-id",
      sessionCookie: "access_token=session; refresh_token=refresh",
      expiresAt: "2030-01-01T00:00:00.000Z",
      requestedScopes: ["write:wallets"],
      scopes: ["write:wallets"],
      scopeSource: "token_creation",
      address: "0xsiwe",
      authMethod: "siwe",
    })

    const output = JSON.parse(logSpy.mock.calls[0][0] as string) as {
      status: string
      address: string
      requested_scopes: string[]
      granted_scopes: string[]
    }
    expect(output.status).toBe("authenticated")
    expect(output.address).toBe("0xsiwe")
    expect(output.requested_scopes).toEqual(["write:wallets"])
    expect(output.granted_scopes).toEqual(["write:wallets"])
  })

  it("uses OAuth when OPENSEA_PRIVATE_KEY is set but --private-key is omitted", async () => {
    process.env.OPENSEA_PRIVATE_KEY = "env-private-key"
    loginWithLoopback.mockResolvedValue(token())

    const cmd = loginCommand(getFormat)
    await cmd.parseAsync(["--client-id", "public-client"], { from: "user" })

    expect(loginWithLoopback).toHaveBeenCalledTimes(1)
    expect(loginWithSiwe).not.toHaveBeenCalled()
  })

  it("uses OPENSEA_PRIVATE_KEY when --private-key is passed without a value", async () => {
    process.env.OPENSEA_PRIVATE_KEY = "env-private-key"
    loginWithSiwe.mockResolvedValue({
      accessToken: "siwe-at",
      refreshToken: "siwe-rt",
      scopedTokenId: "siwe-id",
      sessionCookie: "access_token=session; refresh_token=refresh",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      requestedScopes: ["read:eligibility"],
      scopes: ["read:eligibility"],
      scopeSource: "token_exchange" as const,
      address: "0xsiwe",
    })

    const cmd = loginCommand(getFormat)
    await cmd.parseAsync(["--private-key"], { from: "user" })

    expect(loginWithSiwe).toHaveBeenCalledWith({
      baseUrl: "https://api.opensea.io",
      privateKey: "env-private-key",
      scopes: AUTH_SCOPES.map(({ name }) => name),
    })
  })

  it("warns when a private key is passed as an inline argument", async () => {
    loginWithSiwe.mockResolvedValue({
      accessToken: "siwe-at",
      refreshToken: "siwe-rt",
      scopedTokenId: "siwe-id",
      sessionCookie: "access_token=session; refresh_token=refresh",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      requestedScopes: ["write:wallets"],
      scopes: ["write:wallets"],
      scopeSource: "token_creation" as const,
      address: "0xsiwe",
    })

    const cmd = loginCommand(
      getFormat,
      () => undefined,
      () => "https://testnets-api.opensea.io",
    )
    await cmd.parseAsync(
      ["--private-key", "inline-key", "--scopes", "write:wallets"],
      { from: "user" },
    )

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("insecure"))
  })

  it("warns when OAuth-only flags are passed with --private-key", async () => {
    loginWithSiwe.mockResolvedValue({
      accessToken: "siwe-at",
      refreshToken: "siwe-rt",
      scopedTokenId: "siwe-id",
      sessionCookie: "access_token=session; refresh_token=refresh",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      requestedScopes: ["write:wallets"],
      scopes: ["write:wallets"],
      scopeSource: "token_creation" as const,
      address: "0xsiwe",
    })

    const cmd = loginCommand(getFormat)
    await cmd.parseAsync(
      [
        "--private-key",
        "test-key",
        "--device",
        "--no-browser",
        "--client-id",
        "ignored",
        "--scopes",
        "write:wallets",
      ],
      { from: "user" },
    )

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("--device, --no-browser, --client-id"),
    )
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("ignored"))
  })
})
