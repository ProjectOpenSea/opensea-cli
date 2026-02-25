import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OpenSeaClient } from "../../client.js"
import { nftsCommand } from "../../commands/nfts.js"

describe("nftsCommand", () => {
  let mockClient: {
    get: ReturnType<typeof vi.fn>
    post: ReturnType<typeof vi.fn>
  }
  let getClient: () => OpenSeaClient
  let getFormat: () => "json" | "table"

  beforeEach(() => {
    mockClient = { get: vi.fn(), post: vi.fn() }
    getClient = () => mockClient as unknown as OpenSeaClient
    getFormat = () => "json"
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct subcommands", () => {
    const cmd = nftsCommand(getClient, getFormat)
    expect(cmd.name()).toBe("nfts")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("get")
    expect(subcommands).toContain("list-by-collection")
    expect(subcommands).toContain("list-by-contract")
    expect(subcommands).toContain("list-by-account")
    expect(subcommands).toContain("refresh")
    expect(subcommands).toContain("contract")
  })

  it("get subcommand fetches NFT", async () => {
    mockClient.get.mockResolvedValue({ nft: {} })

    const cmd = nftsCommand(getClient, getFormat)
    await cmd.parseAsync(["get", "ethereum", "0xabc", "1"], { from: "user" })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/contract/0xabc/nfts/1",
    )
  })

  it("list-by-collection passes options", async () => {
    mockClient.get.mockResolvedValue({ nfts: [] })

    const cmd = nftsCommand(getClient, getFormat)
    await cmd.parseAsync(["list-by-collection", "cool-cats", "--limit", "10"], {
      from: "user",
    })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collection/cool-cats/nfts",
      expect.objectContaining({ limit: 10 }),
    )
  })

  it("list-by-contract passes options", async () => {
    mockClient.get.mockResolvedValue({ nfts: [] })

    const cmd = nftsCommand(getClient, getFormat)
    await cmd.parseAsync(
      ["list-by-contract", "ethereum", "0xabc", "--limit", "5"],
      { from: "user" },
    )

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/contract/0xabc/nfts",
      expect.objectContaining({ limit: 5 }),
    )
  })

  it("list-by-account passes options", async () => {
    mockClient.get.mockResolvedValue({ nfts: [] })

    const cmd = nftsCommand(getClient, getFormat)
    await cmd.parseAsync(["list-by-account", "ethereum", "0xabc"], {
      from: "user",
    })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/account/0xabc/nfts",
      expect.objectContaining({ limit: 20 }),
    )
  })

  it("refresh subcommand calls post", async () => {
    mockClient.post.mockResolvedValue(undefined)

    const cmd = nftsCommand(getClient, getFormat)
    await cmd.parseAsync(["refresh", "ethereum", "0xabc", "1"], {
      from: "user",
    })

    expect(mockClient.post).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/contract/0xabc/nfts/1/refresh",
    )
  })

  it("contract subcommand fetches contract", async () => {
    mockClient.get.mockResolvedValue({ address: "0xabc" })

    const cmd = nftsCommand(getClient, getFormat)
    await cmd.parseAsync(["contract", "ethereum", "0xabc"], { from: "user" })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/contract/0xabc",
    )
  })
})
