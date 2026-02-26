import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { searchCommand } from "../../src/commands/search.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("searchCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct name", () => {
    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("search")
  })

  it("calls GET /api/v2/search with query and default limit", async () => {
    ctx.mockClient.get.mockResolvedValue({
      results: [{ type: "collection", collection: { collection: "mfers" } }],
    })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["mfers"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/search",
      expect.objectContaining({ query: "mfers", limit: 20 }),
    )
    expect(ctx.consoleSpy).toHaveBeenCalled()
  })

  it("passes types option as asset_types param", async () => {
    ctx.mockClient.get.mockResolvedValue({ results: [] })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["ape", "--types", "collection,nft"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/search",
      expect.objectContaining({
        query: "ape",
        asset_types: "collection,nft",
      }),
    )
  })

  it("passes chains option", async () => {
    ctx.mockClient.get.mockResolvedValue({ results: [] })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["ape", "--chains", "ethereum,base"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/search",
      expect.objectContaining({
        query: "ape",
        chains: "ethereum,base",
      }),
    )
  })

  it("passes custom limit", async () => {
    ctx.mockClient.get.mockResolvedValue({ results: [] })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["eth", "--limit", "5"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/search",
      expect.objectContaining({ query: "eth", limit: 5 }),
    )
  })

  it("does not include asset_types or chains when not specified", async () => {
    ctx.mockClient.get.mockResolvedValue({ results: [] })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["test"], { from: "user" })

    const params = ctx.mockClient.get.mock.calls[0][1]
    expect(params.asset_types).toBeUndefined()
    expect(params.chains).toBeUndefined()
  })

  it("outputs in table format when getFormat returns table", async () => {
    ctx.mockClient.get.mockResolvedValue({
      results: [
        {
          type: "collection",
          collection: { collection: "test", name: "Test" },
        },
      ],
    })
    ctx.getFormat = () => "table"

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["test"], { from: "user" })

    expect(ctx.consoleSpy).toHaveBeenCalled()
    const output = ctx.consoleSpy.mock.calls[0][0] as string
    expect(output).toContain("type")
  })

  it("passes all options together", async () => {
    ctx.mockClient.get.mockResolvedValue({ results: [] })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "bored ape",
        "--types",
        "collection,nft",
        "--chains",
        "ethereum",
        "--limit",
        "10",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/search", {
      query: "bored ape",
      asset_types: "collection,nft",
      chains: "ethereum",
      limit: 10,
    })
  })
})
