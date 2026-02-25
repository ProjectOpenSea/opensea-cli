import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { offersCommand } from "../../src/commands/offers.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("offersCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct subcommands", () => {
    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("offers")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("all")
    expect(subcommands).toContain("collection")
    expect(subcommands).toContain("best-for-nft")
    expect(subcommands).toContain("traits")
  })

  it("all subcommand fetches all offers", async () => {
    ctx.mockClient.get.mockResolvedValue({ offers: [] })

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["all", "cool-cats", "--limit", "10"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats/all",
      expect.objectContaining({ limit: 10 }),
    )
  })

  it("collection subcommand fetches collection offers", async () => {
    ctx.mockClient.get.mockResolvedValue({ offers: [] })

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["collection", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats",
      expect.objectContaining({ limit: 20 }),
    )
  })

  it("best-for-nft subcommand fetches best offer", async () => {
    ctx.mockClient.get.mockResolvedValue({})

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["best-for-nft", "cool-cats", "123"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats/nfts/123/best",
    )
  })

  it("traits subcommand passes required options", async () => {
    ctx.mockClient.get.mockResolvedValue({ offers: [] })

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "traits",
        "cool-cats",
        "--type",
        "Background",
        "--value",
        "Blue",
        "--limit",
        "5",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats/traits",
      expect.objectContaining({
        type: "Background",
        value: "Blue",
        limit: 5,
      }),
    )
  })
})
