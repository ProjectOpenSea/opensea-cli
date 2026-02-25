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

  it("creates command with correct name and subcommands", () => {
    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("search")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("collections")
    expect(subcommands).toContain("nfts")
    expect(subcommands).toContain("tokens")
    expect(subcommands).toContain("accounts")
  })

  it("collections subcommand calls graphql with query and default limit", async () => {
    ctx.mockClient.graphql.mockResolvedValue({
      collectionsByQuery: [{ slug: "mfers", name: "mfers" }],
    })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["collections", "mfers"], { from: "user" })

    expect(ctx.mockClient.graphql).toHaveBeenCalledWith(
      expect.stringContaining("collectionsByQuery"),
      expect.objectContaining({ query: "mfers", limit: 10 }),
    )
    expect(ctx.consoleSpy).toHaveBeenCalled()
  })

  it("collections subcommand passes chains and limit options", async () => {
    ctx.mockClient.graphql.mockResolvedValue({ collectionsByQuery: [] })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["collections", "ape", "--chains", "ethereum,base", "--limit", "5"],
      { from: "user" },
    )

    expect(ctx.mockClient.graphql).toHaveBeenCalledWith(
      expect.stringContaining("collectionsByQuery"),
      expect.objectContaining({
        query: "ape",
        limit: 5,
        chains: ["ethereum", "base"],
      }),
    )
  })

  it("nfts subcommand calls graphql with query", async () => {
    ctx.mockClient.graphql.mockResolvedValue({
      itemsByQuery: [{ tokenId: "1", name: "Cool Cat #1" }],
    })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["nfts", "cool cat"], { from: "user" })

    expect(ctx.mockClient.graphql).toHaveBeenCalledWith(
      expect.stringContaining("itemsByQuery"),
      expect.objectContaining({ query: "cool cat", limit: 10 }),
    )
    expect(ctx.consoleSpy).toHaveBeenCalled()
  })

  it("nfts subcommand passes collection, chains, and limit options", async () => {
    ctx.mockClient.graphql.mockResolvedValue({ itemsByQuery: [] })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "nfts",
        "ape",
        "--collection",
        "boredapeyachtclub",
        "--chains",
        "ethereum",
        "--limit",
        "3",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.graphql).toHaveBeenCalledWith(
      expect.stringContaining("itemsByQuery"),
      expect.objectContaining({
        query: "ape",
        collectionSlug: "boredapeyachtclub",
        limit: 3,
        chains: ["ethereum"],
      }),
    )
  })

  it("tokens subcommand calls graphql with query", async () => {
    ctx.mockClient.graphql.mockResolvedValue({
      currenciesByQuery: [{ name: "USDC", symbol: "USDC" }],
    })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["tokens", "usdc"], { from: "user" })

    expect(ctx.mockClient.graphql).toHaveBeenCalledWith(
      expect.stringContaining("currenciesByQuery"),
      expect.objectContaining({ query: "usdc", limit: 10 }),
    )
    expect(ctx.consoleSpy).toHaveBeenCalled()
  })

  it("tokens subcommand passes chain and limit options", async () => {
    ctx.mockClient.graphql.mockResolvedValue({ currenciesByQuery: [] })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["tokens", "eth", "--chain", "base", "--limit", "3"], {
      from: "user",
    })

    expect(ctx.mockClient.graphql).toHaveBeenCalledWith(
      expect.stringContaining("currenciesByQuery"),
      expect.objectContaining({ query: "eth", limit: 3, chain: "base" }),
    )
  })

  it("accounts subcommand calls graphql with query", async () => {
    ctx.mockClient.graphql.mockResolvedValue({
      accountsByQuery: [{ address: "0xabc", username: "vitalik" }],
    })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["accounts", "vitalik"], { from: "user" })

    expect(ctx.mockClient.graphql).toHaveBeenCalledWith(
      expect.stringContaining("accountsByQuery"),
      expect.objectContaining({ query: "vitalik", limit: 10 }),
    )
    expect(ctx.consoleSpy).toHaveBeenCalled()
  })

  it("accounts subcommand passes limit option", async () => {
    ctx.mockClient.graphql.mockResolvedValue({ accountsByQuery: [] })

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["accounts", "user", "--limit", "5"], {
      from: "user",
    })

    expect(ctx.mockClient.graphql).toHaveBeenCalledWith(
      expect.stringContaining("accountsByQuery"),
      expect.objectContaining({ query: "user", limit: 5 }),
    )
  })

  it("outputs in table format when getFormat returns table", async () => {
    ctx.mockClient.graphql.mockResolvedValue({
      collectionsByQuery: [{ slug: "test", name: "Test" }],
    })
    ctx.getFormat = () => "table"

    const cmd = searchCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["collections", "test"], { from: "user" })

    expect(ctx.consoleSpy).toHaveBeenCalled()
    const output = ctx.consoleSpy.mock.calls[0][0] as string
    expect(output).toContain("slug")
  })
})
