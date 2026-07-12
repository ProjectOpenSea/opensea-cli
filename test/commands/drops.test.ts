import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dropsCommand } from "../../src/commands/drops.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("dropsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct name and subcommands", () => {
    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("drops")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("list")
    expect(subcommands).toContain("get")
    expect(subcommands).toContain("eligibility")
    expect(subcommands).toContain("mint")
  })

  it("list subcommand passes options", async () => {
    ctx.mockClient.get.mockResolvedValue({ drops: [] })

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "list",
        "--type",
        "upcoming",
        "--chains",
        "ethereum,base",
        "--limit",
        "10",
        "--next",
        "abc",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/drops",
      expect.objectContaining({
        type: "upcoming",
        chains: "ethereum,base",
        limit: 10,
        cursor: "abc",
      }),
    )
  })

  it("get subcommand fetches drop by slug", async () => {
    ctx.mockClient.get.mockResolvedValue({ collection_slug: "cool-cats" })

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/drops/cool-cats")
  })

  it("eligibility subcommand fetches eligibility by slug", async () => {
    const response = {
      stages: [
        {
          stage_uuid: "12345678-1234-1234-1234-123456789abc",
          is_eligible: true,
        },
      ],
    }
    ctx.mockClient.get.mockResolvedValue(response)

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["eligibility", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/drops/cool-cats/eligibility",
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      JSON.stringify(response, null, 2),
    )
  })

  it("eligibility subcommand propagates API errors", async () => {
    const error = new Error("Wallet is not eligible")
    ctx.mockClient.get.mockRejectedValue(error)

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)

    await expect(
      cmd.parseAsync(["eligibility", "cool-cats"], { from: "user" }),
    ).rejects.toBe(error)
  })

  it("mint subcommand posts mint request", async () => {
    ctx.mockClient.post.mockResolvedValue({
      to: "0x123",
      data: "0x",
      value: "0x0",
      chain: "ethereum",
    })

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "mint",
        "cool-cats",
        "--minter",
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        "--quantity",
        "2",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/drops/cool-cats/mint",
      { minter: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", quantity: 2 },
    )
  })
})
