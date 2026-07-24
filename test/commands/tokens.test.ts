import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { tokensCommand } from "../../src/commands/tokens.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("tokensCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct subcommands", () => {
    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("tokens")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("trending")
    expect(subcommands).toContain("top")
    expect(subcommands).toContain("get")
    expect(subcommands).toContain("activity")
    expect(subcommands).toContain("activity-stats")
    expect(subcommands).toContain("account-activity")
    expect(subcommands).toContain("holders")
    expect(subcommands).toContain("liquidity-pools")
  })

  it("activity-stats subcommand passes selected windows", async () => {
    ctx.mockClient.get.mockResolvedValue({ windows: {} })

    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["activity-stats", "base", "0xabc", "--windows", "1h,24h"],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/base/token/0xabc/activity/stats",
      { windows: "1h,24h" },
    )
  })

  it("trending subcommand passes options", async () => {
    ctx.mockClient.get.mockResolvedValue({ tokens: [] })

    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "trending",
        "--chains",
        "ethereum,base",
        "--limit",
        "10",
        "--next",
        "abc123",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tokens/trending",
      expect.objectContaining({
        chains: "ethereum,base",
        limit: 10,
        cursor: "abc123",
      }),
    )
  })

  it("top subcommand passes options", async () => {
    ctx.mockClient.get.mockResolvedValue({ tokens: [] })

    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["top", "--limit", "5", "--next", "cursor1"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tokens/top",
      expect.objectContaining({ limit: 5, cursor: "cursor1" }),
    )
  })

  it("get subcommand fetches token details", async () => {
    ctx.mockClient.get.mockResolvedValue({ address: "0xabc" })

    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "ethereum", "0xabc"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/token/0xabc",
    )
  })

  it("account-activity subcommand passes filters and pagination", async () => {
    ctx.mockClient.get.mockResolvedValue({ activities: [] })

    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "account-activity",
        "0xdef",
        "--chains",
        "ethereum,base",
        "--tokens",
        "0xaaa,0xbbb",
        "--type",
        "swap,wrap",
        "--limit",
        "25",
        "--next",
        "page-1",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/account/0xdef/token-activity",
      expect.objectContaining({
        chains: "ethereum,base",
        tokens: "0xaaa,0xbbb",
        type: "swap,wrap",
        limit: 25,
        next: "page-1",
      }),
    )
  })

  it("holders subcommand passes pagination + sort options", async () => {
    ctx.mockClient.get.mockResolvedValue({ holders: [] })

    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "holders",
        "ethereum",
        "0xabc",
        "--limit",
        "50",
        "--next",
        "page-2",
        "--sort-by",
        "QUANTITY",
        "--sort-direction",
        "desc",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/token/0xabc/holders",
      expect.objectContaining({
        limit: 50,
        cursor: "page-2",
        sort_by: "QUANTITY",
        sort_direction: "desc",
      }),
    )
  })

  it("liquidity-pools subcommand passes limit", async () => {
    ctx.mockClient.get.mockResolvedValue({ pools: [] })

    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["liquidity-pools", "ethereum", "0xabc", "--limit", "30"],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/token/0xabc/liquidity-pools",
      expect.objectContaining({ limit: 30 }),
    )
  })
})
