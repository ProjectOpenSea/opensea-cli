import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OpenSeaClient } from "../../client.js"
import { accountsCommand } from "../../commands/accounts.js"

describe("accountsCommand", () => {
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

  it("creates command with correct name and subcommands", () => {
    const cmd = accountsCommand(getClient, getFormat)
    expect(cmd.name()).toBe("accounts")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("get")
  })

  it("get subcommand fetches account by address", async () => {
    mockClient.get.mockResolvedValue({ address: "0xabc", username: "user" })

    const cmd = accountsCommand(getClient, getFormat)
    await cmd.parseAsync(["get", "0xabc"], { from: "user" })

    expect(mockClient.get).toHaveBeenCalledWith("/api/v2/accounts/0xabc")
  })
})
