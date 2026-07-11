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

  it("creates command with all subcommands", () => {
    const ctx = createCommandTestContext()
    const cmd = authCommand(() => undefined, ctx.getFormat)
    const names = cmd.commands.map(c => c.name())
    expect(names).toContain("request-key")
    expect(names).toContain("login")
    expect(names).toContain("link-wallet")
    expect(names).toContain("status")
    expect(names).toContain("refresh")
    expect(names).toContain("revoke")
    expect(names).toContain("tokens")
    expect(names).toContain("scopes")
    expect(names).toContain("clear")
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

  it("scopes lists available scopes", async () => {
    const ctx = createCommandTestContext()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const cmd = authCommand(() => undefined, ctx.getFormat)
    await cmd.parseAsync(["scopes"], { from: "user" })

    expect(logSpy).toHaveBeenCalledTimes(1)
    const output = JSON.parse(logSpy.mock.calls[0][0] as string) as Array<{
      name: string
      description: string
    }>
    expect(output).toBeInstanceOf(Array)
    expect(output.length).toBeGreaterThan(0)
    expect(output[0]).toHaveProperty("name")
    expect(output[0]).toHaveProperty("description")

    logSpy.mockRestore()
  })

  it("status shows not_authenticated when no token stored", async () => {
    const ctx = createCommandTestContext()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const cmd = authCommand(() => undefined, ctx.getFormat)
    await cmd.parseAsync(["status"], { from: "user" })

    expect(logSpy).toHaveBeenCalledTimes(1)
    const output = JSON.parse(logSpy.mock.calls[0][0] as string) as {
      status: string
    }
    expect(output.status).toBe("not_authenticated")

    logSpy.mockRestore()
  })

  it("tokens shows empty list when no tokens stored", async () => {
    const ctx = createCommandTestContext()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const cmd = authCommand(() => undefined, ctx.getFormat)
    await cmd.parseAsync(["tokens"], { from: "user" })

    expect(logSpy).toHaveBeenCalledTimes(1)
    const output = JSON.parse(logSpy.mock.calls[0][0] as string) as {
      message: string
    }
    expect(output.message).toBe("No stored tokens")

    logSpy.mockRestore()
  })
})
