import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { signalsCommand } from "../../src/commands/signals.js"
import {
  type CommandTestContext,
  createCommandTestContext,
  requestedPaths,
  resolveAllRequests,
} from "../mocks.js"

describe("signalsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("has get, list, create and delete, and no edit", () => {
    const cmd = signalsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("signals")
    expect(cmd.commands.map(c => c.name())).toEqual([
      "get",
      "list",
      "create",
      "delete",
    ])
  })

  it("get fetches one signal by ID", async () => {
    ctx.mockClient.get.mockResolvedValue({ signal_id: "sig_v1_a" })

    const cmd = signalsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "sig_v1_a"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/signals/sig_v1_a")
    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("sig_v1_a"),
    )
  })

  it("list sends an item subject and maps --next to cursor", async () => {
    ctx.mockClient.get.mockResolvedValue({ signals: [], next: null })

    const cmd = signalsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "list",
        "--chain",
        "base",
        "--contract",
        "0xc",
        "--token-id",
        "7",
        "--limit",
        "100",
        "--next",
        "c1",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/signals", {
      chain: "base",
      contract: "0xc",
      token_id: "7",
      collection: undefined,
      limit: 100,
      cursor: "c1",
    })
  })

  it("list sends a collection subject alone with the default limit", async () => {
    ctx.mockClient.get.mockResolvedValue({ signals: [], next: null })

    const cmd = signalsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["list", "--collection", "doodles"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/signals", {
      chain: undefined,
      contract: undefined,
      token_id: undefined,
      collection: "doodles",
      limit: 20,
      cursor: undefined,
    })
  })

  it("list rejects a non-numeric --limit before any request", async () => {
    const cmd = signalsCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["list", "--collection", "doodles", "--limit", "x"], {
        from: "user",
      }),
    ).rejects.toThrow("--limit")
    expect(ctx.mockClient.get).not.toHaveBeenCalled()
  })

  it("create posts the text, author and subject and prints the signal ID", async () => {
    ctx.mockClient.post.mockResolvedValue({ signal_id: "sig_v1_new" })

    const cmd = signalsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "create",
        "--text",
        "gm",
        "--chain",
        "base",
        "--contract",
        "0xc",
        "--author-address",
        "0xauthor",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.post).toHaveBeenCalledWith("/api/v2/signals", {
      text: "gm",
      author_address: "0xauthor",
      chain: "base",
      contract: "0xc",
      token_id: undefined,
      collection: undefined,
    })
    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("sig_v1_new"),
    )
  })

  it("create requires --text", async () => {
    const cmd = signalsCommand(ctx.getClient, ctx.getFormat)
    cmd.exitOverride()
    cmd.commands.find(c => c.name() === "create")?.exitOverride()
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    await expect(
      cmd.parseAsync(["create", "--collection", "doodles"], { from: "user" }),
    ).rejects.toThrow("--text")
    expect(ctx.mockClient.post).not.toHaveBeenCalled()
  })

  it("delete sends DELETE and prints a confirmation", async () => {
    ctx.mockClient.delete.mockResolvedValue(undefined)

    const cmd = signalsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["delete", "sig_v1_a"], { from: "user" })

    expect(ctx.mockClient.delete).toHaveBeenCalledWith(
      "/api/v2/signals/sig_v1_a",
    )
    const printed = JSON.parse(String(ctx.consoleSpy.mock.calls[0]?.[0]))
    expect(printed).toEqual({
      status: "ok",
      message: "Signal deleted",
      signal_id: "sig_v1_a",
    })
  })
})

describe("signalsCommand path arguments", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
    resolveAllRequests(ctx.mockClient)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each<[string[], string]>([
    [["get", "sig_v1_a/b"], "GET /api/v2/signals/sig_v1_a%2Fb"],
    [["delete", "sig_v1_a/b"], "DELETE /api/v2/signals/sig_v1_a%2Fb"],
  ])("%j encodes the signal ID", async (argv, request) => {
    const cmd = signalsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(argv, { from: "user" })
    expect(requestedPaths(ctx.mockClient)).toEqual([request])
  })
})
