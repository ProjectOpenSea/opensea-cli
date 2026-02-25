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
})
