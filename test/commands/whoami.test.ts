import { afterEach, describe, expect, it, vi } from "vitest"

const { loadCurrentToken } = vi.hoisted(() => ({
  loadCurrentToken: vi.fn(),
}))

vi.mock("../../src/auth/store.js", () => ({ loadCurrentToken }))

import { whoamiCommand } from "../../src/commands/whoami.js"
import { createCommandTestContext } from "../mocks.js"

function jwt(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `header.${encoded}.signature`
}

describe("whoamiCommand", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it("reports when no token is stored", async () => {
    loadCurrentToken.mockReturnValue(undefined)
    const ctx = createCommandTestContext()

    await whoamiCommand(ctx.getFormat).parseAsync([], { from: "user" })

    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      JSON.stringify(
        { status: "not_authenticated", message: "No stored token" },
        null,
        2,
      ),
    )
  })

  it("reports expired tokens", async () => {
    loadCurrentToken.mockReturnValue({
      accessToken: jwt({ wallet: "0xabc" }),
      refreshToken: "refresh-token",
      expiresAt: "2020-01-01T00:00:00.000Z",
      scopes: [],
      address: "0xabc",
      authMethod: "oauth",
    })
    const ctx = createCommandTestContext()

    await whoamiCommand(ctx.getFormat).parseAsync([], { from: "user" })

    const output = JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string) as {
      status: string
      expired: boolean
    }
    expect(output.status).toBe("expired")
    expect(output.expired).toBe(true)
  })

  it("reports malformed JWTs only in diagnostic output", async () => {
    loadCurrentToken.mockReturnValue({
      accessToken: "opaque-token",
      refreshToken: "refresh-token",
      expiresAt: "2030-01-01T00:00:00.000Z",
      scopes: [],
      address: "0xabc",
      authMethod: "oauth",
    })
    const ctx = createCommandTestContext()

    await whoamiCommand(ctx.getFormat).parseAsync(["--diagnostic"], {
      from: "user",
    })

    const output = JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string) as {
      diagnostic: { jwt_error: string }
    }
    expect(output.diagnostic.jwt_error).toBe("Not a JWT")
    expect(ctx.consoleSpy.mock.calls[0][0]).not.toContain("opaque-token")
  })

  it("keeps default output provider-neutral", async () => {
    loadCurrentToken.mockReturnValue({
      accessToken: jwt({
        wallet: "0xabc",
        opensea_scopes: ["read:eligibility", "write:drops"],
        "urn:zitadel:iam:org:project:roles": {
          agents: ["member"],
        },
      }),
      refreshToken: "refresh-token",
      expiresAt: "2030-01-01T00:00:00.000Z",
      scopes: ["read:eligibility"],
      address: "0xabc",
      authMethod: "oauth",
    })
    const ctx = createCommandTestContext()

    await whoamiCommand(ctx.getFormat).parseAsync([], { from: "user" })

    const output = JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string) as {
      scopes: string[]
      scope_source: string
      diagnostic?: unknown
    }
    expect(output.scopes).toEqual(["read:eligibility"])
    expect(output.scope_source).toBe("unknown")
    expect(output.diagnostic).toBeUndefined()
    expect(ctx.consoleSpy.mock.calls[0][0]).not.toContain("zitadel")
  })

  it("shows unverified JWT diagnostics only when requested", async () => {
    loadCurrentToken.mockReturnValue({
      accessToken: jwt({
        wallet: "0xabc",
        opensea_scopes: ["read:eligibility", "write:drops"],
        "urn:zitadel:iam:org:project:roles": {
          agents: ["member"],
        },
      }),
      refreshToken: "refresh-token",
      expiresAt: "2030-01-01T00:00:00.000Z",
      scopes: ["read:eligibility"],
      scopeSource: "token_exchange",
      address: "0xabc",
      authMethod: "siwe",
    })
    const ctx = createCommandTestContext()

    await whoamiCommand(ctx.getFormat).parseAsync(["--diagnostic"], {
      from: "user",
    })

    const output = JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string) as {
      scope_source: string
      diagnostic: {
        unverified: boolean
        jwt: {
          project_roles: Record<string, string[]>
        }
        scope_difference: {
          only_in_jwt: string[]
        }
      }
    }
    expect(output.scope_source).toBe("token_exchange")
    expect(output.diagnostic.unverified).toBe(true)
    expect(output.diagnostic.jwt.project_roles).toEqual({
      agents: ["member"],
    })
    expect(output.diagnostic.scope_difference.only_in_jwt).toEqual([
      "write:drops",
    ])
  })
})
