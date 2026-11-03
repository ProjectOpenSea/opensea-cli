import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nftsCommand } from "../../src/commands/nfts.js"
import {
  type CommandTestContext,
  createCommandTestContext,
  requestedPaths,
  resolveAllRequests,
} from "../mocks.js"

describe("nftsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct subcommands", () => {
    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("nfts")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("get")
    expect(subcommands).toContain("list-by-collection")
    expect(subcommands).toContain("list-by-contract")
    expect(subcommands).toContain("list-by-account")
    expect(subcommands).toContain("refresh")
    expect(subcommands).toContain("contract")
  })

  it("get subcommand fetches NFT", async () => {
    ctx.mockClient.get.mockResolvedValue({ nft: {} })

    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "ethereum", "0xabc", "1"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/contract/0xabc/nfts/1",
    )
  })

  it("list-by-collection passes --has-agent-binding", async () => {
    ctx.mockClient.get.mockResolvedValue({ nfts: [] })
    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)

    await cmd.parseAsync(
      ["list-by-collection", "cool-cats", "--has-agent-binding", "true"],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collection/cool-cats/nfts",
      expect.objectContaining({ has_agent_binding: true }),
    )
  })

  it("list-by-collection passes options", async () => {
    ctx.mockClient.get.mockResolvedValue({ nfts: [] })

    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["list-by-collection", "cool-cats", "--limit", "10"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collection/cool-cats/nfts",
      expect.objectContaining({ limit: 10 }),
    )
  })

  it("list-by-contract passes options", async () => {
    ctx.mockClient.get.mockResolvedValue({ nfts: [] })

    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["list-by-contract", "ethereum", "0xabc", "--limit", "5"],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/contract/0xabc/nfts",
      expect.objectContaining({ limit: 5 }),
    )
  })

  it("list-by-account passes options", async () => {
    ctx.mockClient.get.mockResolvedValue({ nfts: [] })

    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["list-by-account", "ethereum", "0xabc"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/account/0xabc/nfts",
      expect.objectContaining({ limit: 20 }),
    )
  })

  it("list-by-account sends include_auto_hidden only with the flag", async () => {
    ctx.mockClient.get.mockResolvedValue({ nfts: [] })

    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["list-by-account", "ethereum", "0xabc", "--include-auto-hidden"],
      { from: "user" },
    )

    // Pinned as the whole params object, so the snake_case wire name is the
    // only spelling that can satisfy it.
    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/account/0xabc/nfts",
      { limit: 20, next: undefined, include_auto_hidden: true },
    )
  })

  it("list-by-account omits include_auto_hidden without the flag", async () => {
    ctx.mockClient.get.mockResolvedValue({ nfts: [] })

    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["list-by-account", "ethereum", "0xabc"], {
      from: "user",
    })

    const params = ctx.mockClient.get.mock.calls[0][1] as Record<
      string,
      unknown
    >
    // `toEqual` treats an undefined-valued key as absent, so read the value
    // directly rather than matching the object shape.
    expect(params.include_auto_hidden).toBeUndefined()
    expect(params.limit).toBe(20)
  })

  it("list-by-group collects repeated flags into arrays", async () => {
    ctx.mockClient.get.mockResolvedValue({ nfts: [] })

    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "list-by-group",
        "trading_cards",
        "--grader",
        "PSA",
        "--grader",
        "CGC",
        "--product-type",
        "card",
        "--collection-slug",
        "a",
        "--is-listed",
        "false",
        "--min-estimated-value-usd",
        "12.5",
        "--sort-by",
        "price",
        "--sort-direction",
        "asc",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/nfts/group/trading_cards",
      expect.objectContaining({
        grader: ["PSA", "CGC"],
        product_type: ["card"],
        collection_slugs: ["a"],
        is_listed: false,
        min_estimated_value_usd: 12.5,
        sort_by: "price",
        sort_direction: "asc",
        limit: 20,
      }),
    )
    const params = ctx.mockClient.get.mock.calls[0][1] as Record<
      string,
      unknown
    >
    expect(params.franchise).toBeUndefined()
    expect(params.is_listed).toBe(false)
  })

  it("list-by-group rejects a non-boolean --is-listed", async () => {
    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["list-by-group", "trading_cards", "--is-listed", "yes"], {
        from: "user",
      }),
    ).rejects.toThrow("--is-listed must be 'true' or 'false'")
    expect(ctx.mockClient.get).not.toHaveBeenCalled()
  })

  it("group-facets sends facet types and filters", async () => {
    ctx.mockClient.get.mockResolvedValue({ facets: [] })

    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "group-facets",
        "trading_cards",
        "--facet-type",
        "grader",
        "--facet-type",
        "grade",
        "--franchise",
        "Pokemon",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/nfts/group/trading_cards/facets",
      expect.objectContaining({
        facet_types: ["grader", "grade"],
        franchise: ["Pokemon"],
      }),
    )
  })

  it("refresh subcommand calls post", async () => {
    ctx.mockClient.post.mockResolvedValue(undefined)

    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["refresh", "ethereum", "0xabc", "1"], {
      from: "user",
    })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/contract/0xabc/nfts/1/refresh",
    )
  })

  it("contract subcommand fetches contract", async () => {
    ctx.mockClient.get.mockResolvedValue({ address: "0xabc" })

    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["contract", "ethereum", "0xabc"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/contract/0xabc",
    )
  })
})

describe("nftsCommand path arguments", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
    resolveAllRequests(ctx.mockClient)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each<[string[], string]>([
    [
      ["get", "base/1", "0xc/2", "7/3"],
      "GET /api/v2/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3",
    ],
    [["list-by-collection", "cats/1"], "GET /api/v2/collection/cats%2F1/nfts"],
    [
      ["list-by-contract", "base/1", "0xc/2"],
      "GET /api/v2/chain/base%2F1/contract/0xc%2F2/nfts",
    ],
    [
      ["list-by-account", "base/1", "0xa/2"],
      "GET /api/v2/chain/base%2F1/account/0xa%2F2/nfts",
    ],
    [["list-by-group", "g/1"], "GET /api/v2/nfts/group/g%2F1"],
    [["group-facets", "g/1"], "GET /api/v2/nfts/group/g%2F1/facets"],
    [
      ["refresh", "base/1", "0xc/2", "7/3"],
      "POST /api/v2/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3/refresh",
    ],
    [
      ["contract", "base/1", "0xc/2"],
      "GET /api/v2/chain/base%2F1/contract/0xc%2F2",
    ],
    [
      ["validate-metadata", "base/1", "0xc/2", "7/3"],
      "POST /api/v2/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3/validate-metadata",
    ],
    [
      ["owners", "base/1", "0xc/2", "7/3"],
      "GET /api/v2/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3/owners",
    ],
    [
      ["analytics", "base/1", "0xc/2", "7/3"],
      "GET /api/v2/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3/analytics",
    ],
  ])("%j encodes every path argument", async (argv, request) => {
    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(argv, { from: "user" })
    expect(requestedPaths(ctx.mockClient)).toEqual([request])
  })

  it.each([".", ".."])("rejects %j before any request", async segment => {
    const cmd = nftsCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["get", "base", segment, "1"], { from: "user" }),
    ).rejects.toThrow(`Invalid path segment: "${segment}"`)
    expect(requestedPaths(ctx.mockClient)).toEqual([])
  })
})
