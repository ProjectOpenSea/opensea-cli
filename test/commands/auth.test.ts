import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authCommand } from "../../src/commands/auth.js"
import { createCommandTestContext } from "../mocks.js"

describe("authCommand", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with request-key subcommand", () => {
    const ctx = createCommandTestContext()
    const cmd = authCommand(() => undefined, ctx.getFormat)
    expect(cmd.name()).toBe("auth")
    expect(cmd.commands.map(c => c.name())).toContain("request-key")
  })

  it("request-key POSTs to /api/v2/auth/keys without auth header", async () => {
    const ctx = createCommandTestContext()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ api_key: "k-123" }), { status: 201 }),
    )

    const cmd = authCommand(() => undefined, ctx.getFormat)
    await cmd.parseAsync(["request-key"], { from: "user" })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    expect(url).toBe("https://api.opensea.io/api/v2/auth/keys")
    expect(init.method).toBe("POST")
    // No api-key header in any casing — endpoint is unauthenticated.
    const headerKeys = Object.keys(init.headers).map(k => k.toLowerCase())
    expect(headerKeys).not.toContain("x-api-key")

    logSpy.mockRestore()
  })

  it("request-key uses --base-url override", async () => {
    const ctx = createCommandTestContext()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    fetchSpy.mockResolvedValue(new Response("{}", { status: 201 }))

    const cmd = authCommand(
      () => "https://testnets-api.opensea.io",
      ctx.getFormat,
    )
    await cmd.parseAsync(["request-key"], { from: "user" })

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toBe("https://testnets-api.opensea.io/api/v2/auth/keys")

    logSpy.mockRestore()
  })
})
