import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { accountsCommand } from "../../src/commands/accounts.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

function writeTempJson(data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "cli-test-"))
  const file = join(dir, "body.json")
  writeFileSync(file, JSON.stringify(data))
  return file
}

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
    expect(subcommands).toContain("mark-agent")
    expect(subcommands).toContain("remove-agent")
  })

  it("mark-agent marks a registered wallet", async () => {
    ctx.mockClient.put.mockResolvedValue({
      address: "0xabc",
      is_agent: true,
    })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["mark-agent", "agent/wallet"], { from: "user" })

    expect(ctx.mockClient.put).toHaveBeenCalledWith(
      "/api/v2/accounts/wallets/agent%2Fwallet/agent",
    )
  })

  it("remove-agent clears a registered wallet designation", async () => {
    ctx.mockClient.delete.mockResolvedValue({
      address: "0xabc",
      is_agent: false,
    })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["remove-agent", "agent/wallet"], { from: "user" })

    expect(ctx.mockClient.delete).toHaveBeenCalledWith(
      "/api/v2/accounts/wallets/agent%2Fwallet/agent",
    )
  })

  it("get subcommand fetches account by address", async () => {
    ctx.mockClient.get.mockResolvedValue({ address: "0xabc", username: "user" })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "0xabc"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/accounts/0xabc")
  })

  it("relationship subcommand fetches relationship", async () => {
    ctx.mockClient.get.mockResolvedValue({ is_following: true })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["relationship", "vitalik.eth"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/accounts/vitalik.eth/relationship",
    )
  })

  it("followers subcommand passes pagination", async () => {
    ctx.mockClient.get.mockResolvedValue({ accounts: [] })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["followers", "vitalik.eth", "--limit", "5", "--next", "abc"],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/accounts/vitalik.eth/followers",
      expect.objectContaining({ limit: 5, cursor: "abc" }),
    )
  })

  it("follow subcommand posts to follow endpoint", async () => {
    ctx.mockClient.post.mockResolvedValue({ success: true })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["follow", "vitalik.eth"], { from: "user" })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/accounts/vitalik.eth/follow",
    )
  })

  it("unfollow subcommand deletes the follow", async () => {
    ctx.mockClient.delete.mockResolvedValue({ success: true })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["unfollow", "vitalik.eth"], { from: "user" })

    expect(ctx.mockClient.delete).toHaveBeenCalledWith(
      "/api/v2/accounts/vitalik.eth/follow",
    )
  })

  it("watch subcommand posts to watch endpoint", async () => {
    ctx.mockClient.post.mockResolvedValue({ success: true })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["watch", "0xabc"], { from: "user" })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/accounts/0xabc/watch",
    )
  })

  it("unwatch subcommand deletes the watch", async () => {
    ctx.mockClient.delete.mockResolvedValue({ success: true })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["unwatch", "0xabc"], { from: "user" })

    expect(ctx.mockClient.delete).toHaveBeenCalledWith(
      "/api/v2/accounts/0xabc/watch",
    )
  })

  it("token-watchlist subcommand fetches token watchlist", async () => {
    ctx.mockClient.get.mockResolvedValue({ tokens: [] })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["token-watchlist", "0xabc"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/account/0xabc/token_watchlist",
    )
  })

  it("perpetual-watchlist subcommand fetches perpetual watchlist", async () => {
    ctx.mockClient.get.mockResolvedValue({ markets: [] })

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["perpetual-watchlist", "0xabc"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/account/0xabc/perpetual_watchlist",
    )
  })

  it("watchlist-add posts the request body", async () => {
    ctx.mockClient.post.mockResolvedValue({ success: true })
    const body = { type: "collection", slug: "cool-cats" }
    const file = writeTempJson(body)

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["watchlist-add", "--body", file], { from: "user" })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.post).toHaveBeenCalledWith("/api/v2/watchlist", body)
  })

  it("watchlist-remove deletes with the request body", async () => {
    ctx.mockClient.delete.mockResolvedValue({ success: true })
    const body = { type: "collection", slug: "cool-cats" }
    const file = writeTempJson(body)

    const cmd = accountsCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["watchlist-remove", "--body", file], {
        from: "user",
      })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.delete).toHaveBeenCalledWith(
      "/api/v2/watchlist",
      body,
    )
  })
})
