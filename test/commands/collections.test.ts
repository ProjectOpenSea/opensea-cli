import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OpenSeaClient } from "../../src/client.js"
import { collectionsCommand } from "../../src/commands/collections.js"

describe("collectionsCommand", () => {
  let mockClient: { get: ReturnType<typeof vi.fn> }
  let getClient: () => OpenSeaClient
  let getFormat: () => "json" | "table"
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockClient = { get: vi.fn() }
    getClient = () => mockClient as unknown as OpenSeaClient
    getFormat = () => "json"
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct name and subcommands", () => {
    const cmd = collectionsCommand(getClient, getFormat)
    expect(cmd.name()).toBe("collections")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("get")
    expect(subcommands).toContain("list")
    expect(subcommands).toContain("stats")
    expect(subcommands).toContain("traits")
  })

  it("get subcommand fetches collection by slug", async () => {
    const mockData = { name: "CoolCats" }
    mockClient.get.mockResolvedValue(mockData)

    const cmd = collectionsCommand(getClient, getFormat)
    await cmd.parseAsync(["get", "cool-cats"], { from: "user" })

    expect(mockClient.get).toHaveBeenCalledWith("/api/v2/collections/cool-cats")
    expect(consoleSpy).toHaveBeenCalled()
  })

  it("list subcommand passes options correctly", async () => {
    mockClient.get.mockResolvedValue({ collections: [] })

    const cmd = collectionsCommand(getClient, getFormat)
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

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collections",
      expect.objectContaining({
        chain: "ethereum",
        limit: 5,
        order_by: "market_cap",
      }),
    )
  })

  it("stats subcommand fetches collection stats", async () => {
    mockClient.get.mockResolvedValue({ total: {} })

    const cmd = collectionsCommand(getClient, getFormat)
    await cmd.parseAsync(["stats", "cool-cats"], { from: "user" })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats/stats",
    )
  })

  it("traits subcommand fetches collection traits", async () => {
    mockClient.get.mockResolvedValue({ categories: {} })

    const cmd = collectionsCommand(getClient, getFormat)
    await cmd.parseAsync(["traits", "cool-cats"], { from: "user" })

    expect(mockClient.get).toHaveBeenCalledWith("/api/v2/traits/cool-cats")
  })

  it("outputs in table format when getFormat returns table", async () => {
    mockClient.get.mockResolvedValue({ name: "Test" })
    getFormat = () => "table"

    const cmd = collectionsCommand(getClient, getFormat)
    await cmd.parseAsync(["get", "test"], { from: "user" })

    expect(consoleSpy).toHaveBeenCalled()
    const output = consoleSpy.mock.calls[0][0] as string
    expect(output).toContain("name")
  })
})
