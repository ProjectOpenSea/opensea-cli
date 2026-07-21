import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { collectionsCommand } from "../../src/commands/collections.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

function writeTempJson(data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "cli-test-"))
  const file = join(dir, "body.json")
  writeFileSync(file, JSON.stringify(data))
  return file
}

describe("collectionsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct name and subcommands", () => {
    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("collections")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("get")
    expect(subcommands).toContain("list")
    expect(subcommands).toContain("stats")
    expect(subcommands).toContain("traits")
  })

  it("get subcommand fetches collection by slug", async () => {
    const mockData = { name: "CoolCats" }
    ctx.mockClient.get.mockResolvedValue(mockData)

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats",
    )
    expect(ctx.consoleSpy).toHaveBeenCalled()
  })

  it("list subcommand passes options correctly", async () => {
    ctx.mockClient.get.mockResolvedValue({ collections: [] })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "list",
        "--chain",
        "ethereum",
        "--limit",
        "5",
        "--order-by",
        "market_cap",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collections",
      expect.objectContaining({
        chain: "ethereum",
        limit: 5,
        order_by: "market_cap",
      }),
    )
  })

  it("stats subcommand fetches collection stats", async () => {
    ctx.mockClient.get.mockResolvedValue({ total: {} })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["stats", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats/stats",
    )
  })

  it("traits subcommand fetches collection traits", async () => {
    ctx.mockClient.get.mockResolvedValue({ categories: {} })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["traits", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/traits/cool-cats")
  })

  it("outputs in table format when getFormat returns table", async () => {
    ctx.mockClient.get.mockResolvedValue({ name: "Test" })
    ctx.getFormat = () => "table"

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "test"], { from: "user" })

    expect(ctx.consoleSpy).toHaveBeenCalled()
    const output = ctx.consoleSpy.mock.calls[0][0] as string
    expect(output).toContain("name")
  })

  it("modify PATCHes the collection with the request body", async () => {
    ctx.mockClient.patch.mockResolvedValue({ success: true })
    const body = { description: "gm" }
    const file = writeTempJson(body)

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["modify", "cool-cats", "--body", file], {
        from: "user",
      })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.patch).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats",
      body,
    )
  })

  it("set-visibility PATCHes a boolean hidden flag", async () => {
    ctx.mockClient.patch.mockResolvedValue({ success: true })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["set-visibility", "cool-cats", "--hidden", "true"], {
      from: "user",
    })

    expect(ctx.mockClient.patch).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats/visibility",
      { hidden: true },
    )
  })

  it("set-visibility rejects a non-boolean --hidden value", async () => {
    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["set-visibility", "cool-cats", "--hidden", "maybe"], {
        from: "user",
      }),
    ).rejects.toThrow("--hidden must be 'true' or 'false'")
  })

  it("upload-image posts the required encoded MIME type to the image endpoint", async () => {
    ctx.mockClient.post.mockResolvedValue({ upload_url: "https://x" })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["upload-image", "cool-cats", "logo", "--content-type", "image/png"],
      { from: "user" },
    )

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats/images/logo?content_type=image%2Fpng",
    )
  })
})
