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
  })

  it("trending subcommand passes options", async () => {
    ctx.mockClient.get.mockResolvedValue({ tokens: [] })

    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["trending", "--chains", "ethereum,base", "--limit", "10"],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tokens/trending",
      expect.objectContaining({
        chains: "ethereum,base",
        limit: 10,
      }),
    )
  })

  it("top subcommand passes options", async () => {
    ctx.mockClient.get.mockResolvedValue({ tokens: [] })

    const cmd = tokensCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["top", "--limit", "5"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tokens/top",
      expect.objectContaining({ limit: 5 }),
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
})
