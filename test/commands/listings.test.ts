import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { listingsCommand } from "../../src/commands/listings.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("listingsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct subcommands", () => {
    const cmd = listingsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("listings")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("all")
    expect(subcommands).toContain("best")
    expect(subcommands).toContain("best-for-nft")
    expect(subcommands).toContain("cross-chain-fulfill")
  })

  it("all subcommand fetches all listings", async () => {
    ctx.mockClient.get.mockResolvedValue({ listings: [] })

    const cmd = listingsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["all", "cool-cats", "--limit", "10"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/listings/collection/cool-cats/all",
      expect.objectContaining({ limit: 10 }),
    )
  })

  it("best subcommand fetches best listings", async () => {
    ctx.mockClient.get.mockResolvedValue({ listings: [] })

    const cmd = listingsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["best", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/listings/collection/cool-cats/best",
      expect.objectContaining({ limit: 20 }),
    )
  })

  it("best-for-nft subcommand fetches best listing for NFT", async () => {
    ctx.mockClient.get.mockResolvedValue({})

    const cmd = listingsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["best-for-nft", "cool-cats", "123"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/listings/collection/cool-cats/nfts/123/best",
    )
  })

  it("cross-chain-fulfill subcommand posts correct body", async () => {
    ctx.mockClient.post.mockResolvedValue({ transactions: [] })

    const cmd = listingsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "cross-chain-fulfill",
        "--hashes",
        "0xabc",
        "--listing-chain",
        "ethereum",
        "--protocol-address",
        "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC",
        "--fulfiller",
        "0x1234567890abcdef1234567890abcdef12345678",
        "--payment-chain",
        "base",
        "--payment-token",
        "0x0000000000000000000000000000000000000000",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/listings/cross_chain_fulfillment_data",
      {
        listings: [
          {
            hash: "0xabc",
            chain: "ethereum",
            protocol_address: "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC",
          },
        ],
        fulfiller: {
          address: "0x1234567890abcdef1234567890abcdef12345678",
        },
        payment: {
          chain: "base",
          token_address: "0x0000000000000000000000000000000000000000",
        },
      },
    )
  })

  it("cross-chain-fulfill supports multiple hashes", async () => {
    ctx.mockClient.post.mockResolvedValue({ transactions: [] })

    const cmd = listingsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "cross-chain-fulfill",
        "--hashes",
        "0xabc,0xdef",
        "--listing-chain",
        "ethereum",
        "--protocol-address",
        "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC",
        "--fulfiller",
        "0x1234567890abcdef1234567890abcdef12345678",
        "--payment-chain",
        "base",
        "--payment-token",
        "0x0000000000000000000000000000000000000000",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/listings/cross_chain_fulfillment_data",
      expect.objectContaining({
        listings: [
          expect.objectContaining({ hash: "0xabc" }),
          expect.objectContaining({ hash: "0xdef" }),
        ],
      }),
    )
  })

  it("cross-chain-fulfill passes optional recipient", async () => {
    ctx.mockClient.post.mockResolvedValue({ transactions: [] })

    const cmd = listingsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "cross-chain-fulfill",
        "--hashes",
        "0xabc",
        "--listing-chain",
        "ethereum",
        "--protocol-address",
        "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC",
        "--fulfiller",
        "0x1234567890abcdef1234567890abcdef12345678",
        "--payment-chain",
        "base",
        "--payment-token",
        "0x0000000000000000000000000000000000000000",
        "--recipient",
        "0xrecipient",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/listings/cross_chain_fulfillment_data",
      expect.objectContaining({
        recipient: "0xrecipient",
      }),
    )
  })
})
