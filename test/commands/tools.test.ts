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
    expect(subcommands).toContain("activity")
    expect(subcommands).toContain("list")
    expect(subcommands).toContain("saved")
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
        cursor: "cursor1",
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

  it("activity subcommand passes options", async () => {
    ctx.mockClient.get.mockResolvedValue({ activity: [] })

    const cmd = toolsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "activity",
        "8453",
        "0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1",
        "42",
        "--include-creator-payments",
        "--limit",
        "50",
        "--offset",
        "10",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tools/8453/0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1/42/activity",
      expect.objectContaining({
        include_creator_payments: true,
        limit: 50,
        offset: 10,
      }),
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
        cursor: "page2",
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

  describe("saved subcommand", () => {
    it("creates saved subcommands", () => {
      const cmd = toolsCommand(ctx.getClient, ctx.getFormat)
      const saved = cmd.commands.find(c => c.name() === "saved")
      expect(saved).toBeDefined()
      const subcommands = saved!.commands.map(c => c.name())
      expect(subcommands).toContain("list")
      expect(subcommands).toContain("save")
      expect(subcommands).toContain("remove")
    })

    it("saved list passes options", async () => {
      ctx.mockClient.get.mockResolvedValue({ tools: [] })

      const cmd = toolsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        [
          "saved",
          "list",
          "--toolkit-name",
          "favorites",
          "--limit",
          "10",
          "--next",
          "cursor1",
        ],
        { from: "user" },
      )

      expect(ctx.mockClient.get).toHaveBeenCalledWith(
        "/api/v2/saved-tools",
        expect.objectContaining({
          toolkit_name: "favorites",
          limit: 10,
          cursor: "cursor1",
        }),
      )
    })

    it("saved save posts tool with toolkit name", async () => {
      ctx.mockClient.post.mockResolvedValue({ success: true })

      const cmd = toolsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        [
          "saved",
          "save",
          "8453",
          "0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1",
          "42",
          "--toolkit-name",
          "favorites",
        ],
        { from: "user" },
      )

      expect(ctx.mockClient.post).toHaveBeenCalledWith("/api/v2/saved-tools", {
        tool_id: "42",
        registry_chain: "8453",
        registry_addr: "0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1",
        toolkit_name: "favorites",
      })
    })

    it("saved remove deletes tool with query params", async () => {
      ctx.mockClient.delete.mockResolvedValue({ success: true })

      const cmd = toolsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        [
          "saved",
          "remove",
          "8453",
          "0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1",
          "42",
        ],
        { from: "user" },
      )

      expect(ctx.mockClient.delete).toHaveBeenCalledWith(
        "/api/v2/saved-tools",
        undefined,
        {
          tool_id: "42",
          registry_chain: "8453",
          registry_addr: "0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1",
        },
      )
    })
  })
})
