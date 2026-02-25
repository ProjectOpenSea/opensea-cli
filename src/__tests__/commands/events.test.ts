import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OpenSeaClient } from "../../client.js"
import { eventsCommand } from "../../commands/events.js"

describe("eventsCommand", () => {
  let mockClient: { get: ReturnType<typeof vi.fn> }
  let getClient: () => OpenSeaClient
  let getFormat: () => "json" | "table"

  beforeEach(() => {
    mockClient = { get: vi.fn() }
    getClient = () => mockClient as unknown as OpenSeaClient
    getFormat = () => "json"
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct subcommands", () => {
    const cmd = eventsCommand(getClient, getFormat)
    expect(cmd.name()).toBe("events")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("list")
    expect(subcommands).toContain("by-account")
    expect(subcommands).toContain("by-collection")
    expect(subcommands).toContain("by-nft")
  })

  it("list subcommand passes options", async () => {
    mockClient.get.mockResolvedValue({ asset_events: [] })

    const cmd = eventsCommand(getClient, getFormat)
    await cmd.parseAsync(
      ["list", "--event-type", "sale", "--limit", "5", "--chain", "ethereum"],
      { from: "user" },
    )

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/events",
      expect.objectContaining({
        event_type: "sale",
        limit: 5,
        chain: "ethereum",
      }),
    )
  })

  it("list subcommand parses after/before timestamps", async () => {
    mockClient.get.mockResolvedValue({ asset_events: [] })

    const cmd = eventsCommand(getClient, getFormat)
    await cmd.parseAsync(
      ["list", "--after", "1000000", "--before", "2000000"],
      { from: "user" },
    )

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/events",
      expect.objectContaining({
        after: 1000000,
        before: 2000000,
      }),
    )
  })

  it("by-account subcommand passes options", async () => {
    mockClient.get.mockResolvedValue({ asset_events: [] })

    const cmd = eventsCommand(getClient, getFormat)
    await cmd.parseAsync(["by-account", "0xabc", "--event-type", "transfer"], {
      from: "user",
    })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/events/accounts/0xabc",
      expect.objectContaining({ event_type: "transfer" }),
    )
  })

  it("by-collection subcommand passes options", async () => {
    mockClient.get.mockResolvedValue({ asset_events: [] })

    const cmd = eventsCommand(getClient, getFormat)
    await cmd.parseAsync(["by-collection", "cool-cats", "--limit", "10"], {
      from: "user",
    })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/events/collection/cool-cats",
      expect.objectContaining({ limit: 10 }),
    )
  })

  it("by-nft subcommand passes options", async () => {
    mockClient.get.mockResolvedValue({ asset_events: [] })

    const cmd = eventsCommand(getClient, getFormat)
    await cmd.parseAsync(
      ["by-nft", "ethereum", "0xabc", "1", "--event-type", "sale"],
      { from: "user" },
    )

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/events/chain/ethereum/contract/0xabc/nfts/1",
      expect.objectContaining({ event_type: "sale" }),
    )
  })
})
