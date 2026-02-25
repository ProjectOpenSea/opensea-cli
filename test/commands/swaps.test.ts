import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { swapsCommand } from "../../src/commands/swaps.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("swapsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct subcommands", () => {
    const cmd = swapsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("swaps")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("quote")
  })

  it("quote subcommand passes all required options", async () => {
    ctx.mockClient.get.mockResolvedValue({ quote: {}, transactions: [] })

    const cmd = swapsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "quote",
        "--from-chain",
        "ethereum",
        "--from-address",
        "0xaaa",
        "--to-chain",
        "base",
        "--to-address",
        "0xbbb",
        "--quantity",
        "1000",
        "--address",
        "0xccc",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/swap/quote",
      expect.objectContaining({
        from_chain: "ethereum",
        from_address: "0xaaa",
        to_chain: "base",
        to_address: "0xbbb",
        quantity: "1000",
        address: "0xccc",
      }),
    )
  })

  it("quote subcommand passes optional slippage and recipient", async () => {
    ctx.mockClient.get.mockResolvedValue({ quote: {}, transactions: [] })

    const cmd = swapsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "quote",
        "--from-chain",
        "ethereum",
        "--from-address",
        "0xaaa",
        "--to-chain",
        "base",
        "--to-address",
        "0xbbb",
        "--quantity",
        "1000",
        "--address",
        "0xccc",
        "--slippage",
        "0.05",
        "--recipient",
        "0xddd",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/swap/quote",
      expect.objectContaining({
        slippage: 0.05,
        recipient: "0xddd",
      }),
    )
  })
})
