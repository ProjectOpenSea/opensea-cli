import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OpenSeaClient } from "../../src/client.js"
import { offersCommand } from "../../src/commands/offers.js"

describe("offersCommand", () => {
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
    const cmd = offersCommand(getClient, getFormat)
    expect(cmd.name()).toBe("offers")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("all")
    expect(subcommands).toContain("collection")
    expect(subcommands).toContain("best-for-nft")
    expect(subcommands).toContain("traits")
  })

  it("all subcommand fetches all offers", async () => {
    mockClient.get.mockResolvedValue({ offers: [] })

    const cmd = offersCommand(getClient, getFormat)
    await cmd.parseAsync(["all", "cool-cats", "--limit", "10"], {
      from: "user",
    })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats/all",
      expect.objectContaining({ limit: 10 }),
    )
  })

  it("collection subcommand fetches collection offers", async () => {
    mockClient.get.mockResolvedValue({ offers: [] })

    const cmd = offersCommand(getClient, getFormat)
    await cmd.parseAsync(["collection", "cool-cats"], { from: "user" })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats",
      expect.objectContaining({ limit: 20 }),
    )
  })

  it("best-for-nft subcommand fetches best offer", async () => {
    mockClient.get.mockResolvedValue({})

    const cmd = offersCommand(getClient, getFormat)
    await cmd.parseAsync(["best-for-nft", "cool-cats", "123"], {
      from: "user",
    })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats/nfts/123/best",
    )
  })

  it("traits subcommand passes required options", async () => {
    mockClient.get.mockResolvedValue({ offers: [] })

    const cmd = offersCommand(getClient, getFormat)
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

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats/traits",
      expect.objectContaining({
        type: "Background",
        value: "Blue",
        limit: 5,
      }),
    )
  })
})
