import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { accountsCommand } from "../../src/commands/accounts.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("accountsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct name and subcommands", () => {
    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("accounts")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("get")
  })

  it("get subcommand fetches account by address", async () => {
    ctx.mockClient.get.mockResolvedValue({ address: "0xabc", username: "user" })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "0xabc"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/accounts/0xabc")
  })
})
