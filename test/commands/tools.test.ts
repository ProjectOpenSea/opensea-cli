import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toolsCommand } from "../../src/commands/tools.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("toolsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct subcommands", () => {
    const cmd = toolsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("tools")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("search")
    expect(subcommands).toContain("get")
    expect(subcommands).toContain("list")
  })

  it("search subcommand passes all options", async () => {
    ctx.mockClient.get.mockResolvedValue({ results: [] })

    const cmd = toolsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "search",
        "--query",
        "nft appraiser",
        "--registry-chain",
        "8453",
        "--tags",
        "nft,defi",
        "--access-type",
        "open",
        "--creator",
        "0x1234",
        "--sort-by",
        "newest",
        "--limit",
        "10",
        "--next",
        "cursor1",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tools/search",
      expect.objectContaining({
        query: "nft appraiser",
        registry_chain: "8453",
        tags: "nft,defi",
        access_type: "open",
        creator: "0x1234",
        sort_by: "newest",
        limit: 10,
        "cursor.value": "cursor1",
      }),
    )
  })

  it("search subcommand with defaults", async () => {
    ctx.mockClient.get.mockResolvedValue({ results: [] })

    const cmd = toolsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["search"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tools/search",
      expect.objectContaining({
        sort_by: "relevance",
        limit: 20,
      }),
    )
  })

  it("get subcommand fetches tool by composite key", async () => {
    ctx.mockClient.get.mockResolvedValue({ tool_id: "1" })

    const cmd = toolsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["get", "8453", "0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1", "42"],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tools/8453/0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1/42",
    )
  })

  it("list subcommand passes options", async () => {
    ctx.mockClient.get.mockResolvedValue({ tools: [] })

    const cmd = toolsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "list",
        "--sort-by",
        "oldest",
        "--type",
        "nft_gated",
        "--limit",
        "50",
        "--next",
        "page2",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tools",
      expect.objectContaining({
        sort_by: "oldest",
        type: "nft_gated",
        limit: 50,
        "cursor.value": "page2",
      }),
    )
  })

  it("list subcommand with defaults", async () => {
    ctx.mockClient.get.mockResolvedValue({ tools: [] })

    const cmd = toolsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["list"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tools",
      expect.objectContaining({
        sort_by: "newest",
        limit: 20,
      }),
    )
  })
})
