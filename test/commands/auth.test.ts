import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { MockInstance } from "vitest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authCommand } from "../../src/commands/auth.js"
import {
  createCommandTestContext,
  requestedPaths,
  resolveAllRequests,
} from "../mocks.js"

describe("authCommand", () => {
  let fetchSpy: MockInstance<typeof fetch>

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
    expect(names).toContain("unlink-wallet")
  })

  it("unlink-wallet deletes the wallet via the client", async () => {
    const ctx = createCommandTestContext()
    ctx.mockClient.delete.mockResolvedValue({ success: true })

    const cmd = authCommand(
      () => undefined,
      ctx.getFormat,
      () => undefined,
      ctx.getClient,
    )
    await cmd.parseAsync(["unlink-wallet", "0xabc"], { from: "user" })

    expect(ctx.mockClient.delete).toHaveBeenCalledWith(
      "/api/v2/accounts/wallets/0xabc",
    )
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

  it("request-key identifies itself with the CLI user agent", async () => {
    // Of the three callers of this endpoint the SDK sends x-app-id, the skill
    // script sends its own User-Agent, and this one used to send neither, so
    // CLI-minted keys were indistinguishable from an anonymous script. The
    // endpoint records User-Agent (it becomes the http.user_agent span
    // attribute), which is why this is the header worth sending.
    const ctx = createCommandTestContext()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ api_key: "k-123" }), { status: 201 }),
    )

    const cmd = authCommand(() => undefined, ctx.getFormat)
    await cmd.parseAsync(["request-key"], { from: "user" })

    const init = fetchSpy.mock.calls[0][1] as RequestInit & {
      headers: Record<string, string>
    }
    expect(init.headers["User-Agent"]).toMatch(/^opensea-cli\/\d+\.\d+\.\d+/)

    logSpy.mockRestore()
  })

  it("request-key prints the raw wire body rather than camelizing it", async () => {
    // Every other command prints the API's snake_case keys. Routing this one
    // through OpenSeaAPI.requestInstantApiKey would rename api_key to apiKey
    // and break anyone piping --format json into a script, so the wire casing
    // is pinned here on purpose.
    const ctx = createCommandTestContext()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ api_key: "k-123", expires_at: "2026-01-01" }),
        { status: 201 },
      ),
    )

    const cmd = authCommand(() => undefined, ctx.getFormat)
    await cmd.parseAsync(["request-key"], { from: "user" })

    const printed = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >
    expect(printed).toEqual({ api_key: "k-123", expires_at: "2026-01-01" })
    expect(printed).not.toHaveProperty("apiKey")

    logSpy.mockRestore()
  })

  it("request-key bounds the request with a timeout signal", async () => {
    // Without a signal a hung connection hangs the CLI forever, while every
    // request that goes through OpenSeaClient aborts at --timeout.
    const ctx = createCommandTestContext()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    fetchSpy.mockResolvedValue(new Response("{}", { status: 201 }))

    const cmd = authCommand(
      () => undefined,
      ctx.getFormat,
      () => undefined,
      undefined,
      () => ({ timeout: 1234 }),
    )
    await cmd.parseAsync(["request-key"], { from: "user" })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)

    logSpy.mockRestore()
  })

  it("request-key aborts once the timeout elapses", async () => {
    const ctx = createCommandTestContext()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    // A server that never answers. The only thing that ends this call is the
    // signal, so the assertion fails rather than hangs if the signal is gone.
    fetchSpy.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal
          signal?.addEventListener("abort", () =>
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            ),
          )
        }),
    )

    const cmd = authCommand(
      () => undefined,
      ctx.getFormat,
      () => undefined,
      undefined,
      () => ({ timeout: 10 }),
    )

    await expect(
      cmd.parseAsync(["request-key"], { from: "user" }),
    ).rejects.toThrow(/abort/i)

    logSpy.mockRestore()
  })

  it("request-key logs the request under --verbose", async () => {
    const ctx = createCommandTestContext()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    fetchSpy.mockResolvedValue(new Response("{}", { status: 201 }))

    const cmd = authCommand(
      () => undefined,
      ctx.getFormat,
      () => undefined,
      undefined,
      () => ({ verbose: true }),
    )
    await cmd.parseAsync(["request-key"], { from: "user" })

    expect(errSpy).toHaveBeenCalledWith(
      "[verbose] POST https://api.opensea.io/api/v2/auth/keys",
    )

    errSpy.mockRestore()
    logSpy.mockRestore()
  })

  it("request-key stays quiet without --verbose", async () => {
    const ctx = createCommandTestContext()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    fetchSpy.mockResolvedValue(new Response("{}", { status: 201 }))

    const cmd = authCommand(() => undefined, ctx.getFormat)
    await cmd.parseAsync(["request-key"], { from: "user" })

    expect(errSpy).not.toHaveBeenCalled()

    errSpy.mockRestore()
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

describe("authCommand path arguments", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function unlinkWalletCommand(
    ctx: ReturnType<typeof createCommandTestContext>,
  ) {
    return authCommand(
      () => undefined,
      ctx.getFormat,
      () => undefined,
      ctx.getClient,
    )
  }

  it("unlink-wallet encodes the wallet", async () => {
    const ctx = createCommandTestContext()
    resolveAllRequests(ctx.mockClient)
    await unlinkWalletCommand(ctx).parseAsync(["unlink-wallet", "0xa/1"], {
      from: "user",
    })
    expect(requestedPaths(ctx.mockClient)).toEqual([
      "DELETE /api/v2/accounts/wallets/0xa%2F1",
    ])
  })

  it.each([
    ".",
    "..",
  ])("unlink-wallet rejects %j before any request", async segment => {
    const ctx = createCommandTestContext()
    resolveAllRequests(ctx.mockClient)
    await expect(
      unlinkWalletCommand(ctx).parseAsync(["unlink-wallet", segment], {
        from: "user",
      }),
    ).rejects.toThrow(`Invalid path segment: "${segment}"`)
    expect(requestedPaths(ctx.mockClient)).toEqual([])
  })
})

describe("auth request-key --save", () => {
  const instantKey = {
    api_key: "instant-key-value",
    expires_at: "2026-01-01T00:00:00Z",
    name: "instant",
  }
  let configDir: string
  let logSpy: MockInstance<typeof console.log> | undefined
  let errorSpy: MockInstance<typeof console.error>

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "opensea-request-key-test-"))
    vi.stubEnv("OPENSEA_CONFIG_DIR", configDir)
    vi.stubEnv("OPENSEA_API_KEY", "")
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(configDir, { recursive: true, force: true })
  })

  function respondWith(body: unknown): void {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: 201 }),
    )
  }

  function stdoutText(): string {
    return (logSpy?.mock.calls ?? []).flat().join("")
  }

  async function run(...args: string[]): Promise<void> {
    const ctx = createCommandTestContext()
    logSpy = ctx.consoleSpy
    await authCommand(() => undefined, ctx.getFormat).parseAsync(
      ["request-key", ...args],
      { from: "user" },
    )
  }

  it.skipIf(process.platform === "win32")(
    "writes the key to api_key with mode 0600",
    async () => {
      respondWith(instantKey)

      await run("--save")

      const file = join(configDir, "api_key")
      expect(readFileSync(file, "utf-8")).toBe("instant-key-value\n")
      expect(statSync(file).mode & 0o777).toBe(0o600)
    },
  )

  it("prints the rest of the body and the path, never the key", async () => {
    respondWith(instantKey)

    await run("--save")

    const stdout = stdoutText()
    const stderr = errorSpy.mock.calls.flat().join("")
    expect(JSON.parse(stdout)).toEqual({
      expires_at: "2026-01-01T00:00:00Z",
      name: "instant",
      saved_to: join(configDir, "api_key"),
    })
    expect(stdout).not.toContain("instant-key-value")
    expect(stderr).not.toContain("instant-key-value")
  })

  it("notes on stderr when OPENSEA_API_KEY will override the saved key", async () => {
    vi.stubEnv("OPENSEA_API_KEY", "env-key")
    respondWith(instantKey)

    await run("--save")

    expect(errorSpy.mock.calls.flat().join("")).toContain(
      "OPENSEA_API_KEY is set and takes precedence",
    )
  })

  it("exits 1 without writing when the response has no api_key", async () => {
    respondWith({ expires_at: "2026-01-01T00:00:00Z" })
    vi.spyOn(process, "exit").mockImplementation(code => {
      throw new Error(`process.exit(${code})`)
    })

    await expect(run("--save")).rejects.toThrow("process.exit(1)")

    expect(errorSpy.mock.calls.flat().join("")).toContain("no api_key")
    expect(existsSync(join(configDir, "api_key"))).toBe(false)
  })

  it("--if-missing skips the request when OPENSEA_API_KEY is set", async () => {
    vi.stubEnv("OPENSEA_API_KEY", "env-key")
    respondWith(instantKey)

    await run("--save", "--if-missing")

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(existsSync(join(configDir, "api_key"))).toBe(false)
    expect(JSON.parse(stdoutText())).toMatchObject({
      status: "skipped",
      reason: "OPENSEA_API_KEY is set",
    })
  })

  it("--if-missing skips the request when a key is already saved", async () => {
    writeFileSync(join(configDir, "api_key"), "cached-key\n")
    respondWith(instantKey)

    await run("--save", "--if-missing")

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(readFileSync(join(configDir, "api_key"), "utf-8")).toBe(
      "cached-key\n",
    )
    expect(stdoutText()).not.toContain("cached-key")
    expect(JSON.parse(stdoutText())).toMatchObject({
      status: "skipped",
      reason: "a key is already saved",
    })
  })

  it("--if-missing fetches when the env var and cache are only whitespace", async () => {
    vi.stubEnv("OPENSEA_API_KEY", "  ")
    writeFileSync(join(configDir, "api_key"), " \n")
    respondWith(instantKey)

    await run("--save", "--if-missing")

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(readFileSync(join(configDir, "api_key"), "utf-8")).toBe(
      "instant-key-value\n",
    )
  })

  it("--if-missing without --save exits 1 before any request", async () => {
    respondWith(instantKey)
    vi.spyOn(process, "exit").mockImplementation(code => {
      throw new Error(`process.exit(${code})`)
    })

    await expect(run("--if-missing")).rejects.toThrow("process.exit(1)")

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls.flat().join("")).toContain(
      "--if-missing requires --save",
    )
  })

  it("does not write anything without --save", async () => {
    respondWith(instantKey)

    await run()

    expect(existsSync(join(configDir, "api_key"))).toBe(false)
    expect(JSON.parse(stdoutText())).toEqual(instantKey)
  })
})
