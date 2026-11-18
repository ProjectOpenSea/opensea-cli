import { afterEach, describe, expect, it, vi } from "vitest"
import { accountsCommand } from "../../src/commands/accounts.js"
import { collectionsCommand } from "../../src/commands/collections.js"
import { nftsCommand } from "../../src/commands/nfts.js"
import { OpenSeaCLI } from "../../src/sdk.js"
import { createCommandTestContext } from "../mocks.js"

afterEach(() => vi.restoreAllMocks())

describe("existing REST discovery options", () => {
  it("parses collection NFT filter flags without dropping false or zero", async () => {
    const ctx = createCommandTestContext()
    ctx.mockClient.get.mockResolvedValue({ nfts: [] })
    const ranges = '[{"traitType":"Level","min":0,"max":10}]'
    await nftsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      [
        "list-by-collection",
        "cards",
        "--is-listed",
        "false",
        "--price-min",
        "0",
        "--price-max",
        "2.5",
        "--rarity-min",
        "1",
        "--rarity-max",
        "50",
        "--sort-by",
        "rarity",
        "--sort-direction",
        "asc",
        "--numeric-traits",
        ranges,
      ],
      { from: "user" },
    )
    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collection/cards/nfts",
      expect.objectContaining({
        is_listed: false,
        price_min: 0,
        price_max: 2.5,
        rarity_min: 1,
        rarity_max: 50,
        sort_by: "rarity",
        sort_direction: "asc",
        numeric_traits: ranges,
      }),
    )
  })

  it("rejects malformed boolean and numeric filter flags before requesting data", async () => {
    const ctx = createCommandTestContext()
    for (const [flag, value] of [
      ["--is-listed", "maybe"],
      ["--price-min", "NaN"],
      ["--rarity-min", "1.5"],
    ]) {
      await expect(
        nftsCommand(ctx.getClient, ctx.getFormat).parseAsync(
          ["list-by-collection", "cards", flag, value],
          { from: "user" },
        ),
      ).rejects.toThrow()
    }
    expect(ctx.mockClient.get).not.toHaveBeenCalled()
  })

  it("forwards optional history, depth, catalog and public wallet expansion", async () => {
    const ctx = createCommandTestContext()
    ctx.mockClient.get.mockResolvedValue({})
    await collectionsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["stats", "cards", "--volume-timeframe", "seven_days"],
      { from: "user" },
    )
    await collectionsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["offer-aggregates", "cards", "--include-depth"],
      { from: "user" },
    )
    await nftsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["list-by-group", "trading_cards", "--include-catalog"],
      { from: "user" },
    )
    await accountsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["get", "MixedCaseWallet", "--include", "wallets"],
      { from: "user" },
    )
    expect(ctx.mockClient.get.mock.calls.map(c => c[1])).toMatchObject([
      { volume_timeframe: "seven_days" },
      { include_depth: true },
      { include_catalog: true },
      { include: ["wallets"] },
    ])
    expect(ctx.mockClient.get.mock.calls[3][0]).toBe(
      "/api/v2/accounts/MixedCaseWallet",
    )
  })

  it("programmatic client uses the same wire parameters and preserves defaults", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}", { status: 200 }))
    const api = new OpenSeaCLI({ apiKey: "test" })
    await api.nfts.listByCollection("cards", {
      isListed: false,
      priceMin: 0,
      numericTraits: "[]",
      sortBy: "price",
      sortDirection: "asc",
    })
    await api.collections.stats("cards", { volumeTimeframe: "one_day" })
    await api.collections.offerAggregates("cards", { includeDepth: true })
    await api.nfts.listByGroup("trading_cards", { includeCatalog: true })
    await api.accounts.get("MixedCaseWallet", { include: ["wallets"] })
    const params = fetch.mock.calls.map(c =>
      Object.fromEntries(new URL(String(c[0])).searchParams),
    )
    expect(params).toEqual([
      {
        is_listed: "false",
        price_min: "0",
        numeric_traits: "[]",
        sort_by: "price",
        sort_direction: "asc",
      },
      { volume_timeframe: "one_day" },
      { include_depth: "true" },
      { include_catalog: "true" },
      { include: "wallets" },
    ])
    await api.collections.stats("cards")
    await api.accounts.get("MixedCaseWallet")
    for (const call of fetch.mock.calls.slice(5))
      expect(new URL(String(call[0])).search).toBe("")
  })
})
