import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { tokensCommand } from "../../src/commands/tokens.js"
import {
  type CommandTestContext,
  createCommandTestContext,
  requestedPaths,
  resolveAllRequests,
} from "../mocks.js"

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

  it("trending and top pass sort options", async () => {
    ctx.mockClient.get.mockResolvedValue({ tokens: [] })
    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)

    for (const sub of ["trending", "top"]) {
      await cmd.parseAsync(
        [sub, "--sort-by", "market_cap", "--sort-direction", "asc"],
        { from: "user" },
      )
      expect(ctx.mockClient.get).toHaveBeenLastCalledWith(
        `/api/v2/tokens/${sub}`,
        expect.objectContaining({
          sort_by: "market_cap",
          sort_direction: "asc",
        }),
      )
    }
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

  it("payment-token fetches an encoded chain and address and prints it", async () => {
    const token = { symbol: "WETH", decimals: 18 }
    ctx.mockClient.get.mockResolvedValue(token)

    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["payment-token", "base", "0xabc/x"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/base/payment_token/0xabc%2Fx",
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(JSON.stringify(token, null, 2))
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

describe("tokensCommand path arguments", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
    resolveAllRequests(ctx.mockClient)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each<[string[], string]>([
    [["get", "base/1", "0xt/2"], "GET /api/v2/chain/base%2F1/token/0xt%2F2"],
    [
      ["payment-token", "base/1", "0xt/2"],
      "GET /api/v2/chain/base%2F1/payment_token/0xt%2F2",
    ],
    [
      ["price-history", "base/1", "0xt/2", "--start-time", "2026-01-01"],
      "GET /api/v2/chain/base%2F1/token/0xt%2F2/price_history",
    ],
    [
      [
        "ohlcv",
        "base/1",
        "0xt/2",
        "--start-time",
        "2026-01-01",
        "--bucket-size",
        "1h",
      ],
      "GET /api/v2/chain/base%2F1/token/0xt%2F2/ohlcv",
    ],
    [
      ["activity", "base/1", "0xt/2"],
      "GET /api/v2/chain/base%2F1/token/0xt%2F2/activity",
    ],
    [
      ["activity-stats", "base/1", "0xt/2"],
      "GET /api/v2/chain/base%2F1/token/0xt%2F2/activity/stats",
    ],
    [
      ["account-activity", "0xa/1"],
      "GET /api/v2/account/0xa%2F1/token-activity",
    ],
    [
      ["holders", "base/1", "0xt/2"],
      "GET /api/v2/chain/base%2F1/token/0xt%2F2/holders",
    ],
    [
      ["liquidity-pools", "base/1", "0xt/2"],
      "GET /api/v2/chain/base%2F1/token/0xt%2F2/liquidity-pools",
    ],
  ])("%j encodes every path argument", async (argv, request) => {
    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(argv, { from: "user" })
    expect(requestedPaths(ctx.mockClient)).toEqual([request])
  })

  it.each([".", ".."])("rejects %j before any request", async segment => {
    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["get", segment, "0xt"], { from: "user" }),
    ).rejects.toThrow(`Invalid path segment: "${segment}"`)
    expect(requestedPaths(ctx.mockClient)).toEqual([])
  })
})
