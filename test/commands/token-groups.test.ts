import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { tokenGroupsCommand } from "../../src/commands/token-groups.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("tokenGroupsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct subcommands", () => {
    const cmd = tokenGroupsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("token-groups")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("list")
    expect(subcommands).toContain("get")
  })

  it("list subcommand passes options and maps --next to cursor", async () => {
    ctx.mockClient.get.mockResolvedValue({ token_groups: [] })

    const cmd = tokenGroupsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["list", "--limit", "25", "--next", "abc123"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/token-groups",
      expect.objectContaining({ limit: 25, cursor: "abc123" }),
    )
  })

  it("get subcommand fetches token group by slug", async () => {
    ctx.mockClient.get.mockResolvedValue({ slug: "eth" })

    const cmd = tokenGroupsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "eth"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/token-groups/eth")
  })
})
