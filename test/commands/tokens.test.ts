import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OpenSeaClient } from "../../src/client.js"
import { tokensCommand } from "../../src/commands/tokens.js"

describe("tokensCommand", () => {
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
    const cmd = tokensCommand(getClient, getFormat)
    expect(cmd.name()).toBe("tokens")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("trending")
    expect(subcommands).toContain("top")
    expect(subcommands).toContain("get")
  })

  it("trending subcommand passes options", async () => {
    mockClient.get.mockResolvedValue({ tokens: [] })

    const cmd = tokensCommand(getClient, getFormat)
    await cmd.parseAsync(
      ["trending", "--chains", "ethereum,base", "--limit", "10"],
      { from: "user" },
    )

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tokens/trending",
      expect.objectContaining({
        chains: "ethereum,base",
        limit: 10,
      }),
    )
  })

  it("top subcommand passes options", async () => {
    mockClient.get.mockResolvedValue({ tokens: [] })

    const cmd = tokensCommand(getClient, getFormat)
    await cmd.parseAsync(["top", "--limit", "5"], { from: "user" })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/tokens/top",
      expect.objectContaining({ limit: 5 }),
    )
  })

  it("get subcommand fetches token details", async () => {
    mockClient.get.mockResolvedValue({ address: "0xabc" })

    const cmd = tokensCommand(getClient, getFormat)
    await cmd.parseAsync(["get", "ethereum", "0xabc"], { from: "user" })

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/ethereum/token/0xabc",
    )
  })
})
