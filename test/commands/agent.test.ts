import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentCommand } from "../../src/commands/agent.js"
import {
  type CommandTestContext,
  createCommandTestContext,
  requestedPaths,
  resolveAllRequests,
} from "../mocks.js"

const OWNER_ADDRESS = "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f"
const AGENT_ADDRESS = "0x8c8179678efca4220940466a3a919ac7625620d0"

describe("agentCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with expected subcommands", () => {
    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    const names = cmd.commands.map(c => c.name())
    expect(cmd.name()).toBe("agent")
    expect(names).toEqual([
      "declare",
      "withdraw",
      "add",
      "accept",
      "remove",
      "propose",
      "confirm",
      "revoke",
      "list",
      "profile",
    ])
  })

  it("declare puts to the account-level agent endpoint with no body", async () => {
    ctx.mockClient.put.mockResolvedValue({ is_agent: true, changed: true })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["declare"], { from: "user" })

    expect(ctx.mockClient.put).toHaveBeenCalledWith("/api/v2/accounts/agent")
  })

  it("withdraw deletes the declaration", async () => {
    ctx.mockClient.delete.mockResolvedValue({ is_agent: false, changed: true })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["withdraw"], { from: "user" })

    expect(ctx.mockClient.delete).toHaveBeenCalledWith("/api/v2/accounts/agent")
  })

  it("propose posts the counterparty and the caller's own role", async () => {
    ctx.mockClient.post.mockResolvedValue({ relation: {}, created: true })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["propose", OWNER_ADDRESS, "--role", "AGENT"], {
      from: "user",
    })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/accounts/agent-relationships",
      { counterparty_address: OWNER_ADDRESS, caller_role: "AGENT" },
    )
  })

  it("confirm posts to the confirm sub-path", async () => {
    ctx.mockClient.post.mockResolvedValue({ relation: {}, created: false })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["confirm", AGENT_ADDRESS, "--role", "OWNER"], {
      from: "user",
    })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/accounts/agent-relationships/confirm",
      { counterparty_address: AGENT_ADDRESS, caller_role: "OWNER" },
    )
  })

  it("revoke sends query params and no body", async () => {
    ctx.mockClient.delete.mockResolvedValue({ removed: true })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["revoke", OWNER_ADDRESS, "--role", "AGENT"], {
      from: "user",
    })

    // The third argument is the query params. The body (second) stays
    // undefined because fetch, OkHttp and urllib all drop DELETE bodies.
    expect(ctx.mockClient.delete).toHaveBeenCalledWith(
      "/api/v2/accounts/agent-relationships",
      undefined,
      { counterparty_address: OWNER_ADDRESS, caller_role: "AGENT" },
    )
  })

  it("accepts a lowercase role and sends the uppercase wire value", async () => {
    ctx.mockClient.post.mockResolvedValue({ relation: {}, created: true })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["propose", OWNER_ADDRESS, "--role", "owner"], {
      from: "user",
    })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/accounts/agent-relationships",
      { counterparty_address: OWNER_ADDRESS, caller_role: "OWNER" },
    )
  })

  it("rejects a role that is neither AGENT nor OWNER", async () => {
    const cmd = agentCommand(ctx.getClient, ctx.getFormat)

    await expect(
      cmd.parseAsync(["propose", OWNER_ADDRESS, "--role", "BOTH"], {
        from: "user",
      }),
    ).rejects.toThrow(
      'Invalid value for --role: "BOTH". Expected AGENT or OWNER.',
    )
    expect(ctx.mockClient.post).not.toHaveBeenCalled()
  })

  it("requires a role for propose", async () => {
    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    cmd.exitOverride()

    await expect(
      cmd.parseAsync(["propose", OWNER_ADDRESS], { from: "user" }),
    ).rejects.toThrow()
    expect(ctx.mockClient.post).not.toHaveBeenCalled()
  })

  it("list reads the caller's own relationships", async () => {
    ctx.mockClient.get.mockResolvedValue({ relationships: [] })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["list"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/accounts/agent-relationships",
    )
  })

  it("profile reads the public relationships for an identifier", async () => {
    ctx.mockClient.get.mockResolvedValue({})

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["profile", "imatestagent123"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/accounts/imatestagent123/agent-relationships",
    )
  })

  it("profile percent-encodes the identifier", async () => {
    ctx.mockClient.get.mockResolvedValue({})

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["profile", "alice/example"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/accounts/alice%2Fexample/agent-relationships",
    )
  })

  describe("owner-first verbs", () => {
    it("add proposes as the owner", async () => {
      ctx.mockClient.post.mockResolvedValue({ relation: {}, created: true })

      const cmd = agentCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["add", AGENT_ADDRESS], { from: "user" })

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships",
        { counterparty_address: AGENT_ADDRESS, caller_role: "OWNER" },
      )
    })

    it("accept confirms as the owner", async () => {
      ctx.mockClient.post.mockResolvedValue({ relation: {}, created: false })

      const cmd = agentCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["accept", AGENT_ADDRESS], { from: "user" })

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships/confirm",
        { counterparty_address: AGENT_ADDRESS, caller_role: "OWNER" },
      )
    })

    it("remove revokes as the owner, in the query string", async () => {
      ctx.mockClient.delete.mockResolvedValue({ removed: true })

      const cmd = agentCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["remove", AGENT_ADDRESS], { from: "user" })

      expect(ctx.mockClient.delete).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships",
        undefined,
        { counterparty_address: AGENT_ADDRESS, caller_role: "OWNER" },
      )
    })

    it("takes no --role, since the owner's side is the point", async () => {
      const cmd = agentCommand(ctx.getClient, ctx.getFormat)
      cmd.exitOverride()

      await expect(
        cmd.parseAsync(["add", AGENT_ADDRESS, "--role", "AGENT"], {
          from: "user",
        }),
      ).rejects.toThrow()
      expect(ctx.mockClient.post).not.toHaveBeenCalled()
    })
  })

  describe("counterparty resolution", () => {
    const RESOLVED = OWNER_ADDRESS

    // The relationship endpoints take `counterparty_address` literally and
    // reject a username with 400 "Invalid counterparty address", so the CLI
    // resolves the identifier before sending it.
    it("resolves a username before proposing", async () => {
      ctx.mockClient.get.mockResolvedValue({
        address: RESOLVED,
        username: "ryanryanryanryan",
        ens_name: null,
      })
      ctx.mockClient.post.mockResolvedValue({ relation: {}, created: false })

      const cmd = agentCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["propose", "ryanryanryanryan", "--role", "AGENT"], {
        from: "user",
      })

      expect(ctx.mockClient.get).toHaveBeenCalledWith(
        "/api/v2/accounts/resolve/ryanryanryanryan",
      )
      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships",
        { counterparty_address: RESOLVED, caller_role: "AGENT" },
      )
    })

    it("resolves an ENS name for the owner-first add", async () => {
      ctx.mockClient.get.mockResolvedValue({
        address: RESOLVED,
        username: null,
        ens_name: "vitalik.eth",
      })
      ctx.mockClient.post.mockResolvedValue({ relation: {}, created: true })

      const cmd = agentCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["add", "vitalik.eth"], { from: "user" })

      expect(ctx.mockClient.get).toHaveBeenCalledWith(
        "/api/v2/accounts/resolve/vitalik.eth",
      )
      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships",
        { counterparty_address: RESOLVED, caller_role: "OWNER" },
      )
    })

    it("resolves before revoking too", async () => {
      ctx.mockClient.get.mockResolvedValue({ address: RESOLVED })
      ctx.mockClient.delete.mockResolvedValue({ removed: true })

      const cmd = agentCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["remove", "ryanryanryanryan"], { from: "user" })

      expect(ctx.mockClient.delete).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships",
        undefined,
        { counterparty_address: RESOLVED, caller_role: "OWNER" },
      )
    })

    it("skips the lookup when given an address", async () => {
      ctx.mockClient.post.mockResolvedValue({ relation: {}, created: true })

      const cmd = agentCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["add", RESOLVED], { from: "user" })

      expect(ctx.mockClient.get).not.toHaveBeenCalled()
      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships",
        { counterparty_address: RESOLVED, caller_role: "OWNER" },
      )
    })

    it("treats a checksummed address as an address, not a name", async () => {
      // The resolve short-circuit is case-insensitive, so a mixed-case
      // checksummed address must not be sent to the resolve endpoint.
      const CHECKSUMMED = "0xFbA662E1A8e91A350702Cf3b87d0C2d2fB4bA57f"
      ctx.mockClient.post.mockResolvedValue({ relation: {}, created: true })

      const cmd = agentCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["add", CHECKSUMMED], { from: "user" })

      expect(ctx.mockClient.get).not.toHaveBeenCalled()
      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships",
        { counterparty_address: CHECKSUMMED, caller_role: "OWNER" },
      )
    })

    it("percent-encodes the identifier in the resolve path", async () => {
      ctx.mockClient.get.mockResolvedValue({ address: RESOLVED })
      ctx.mockClient.post.mockResolvedValue({ relation: {}, created: true })

      const cmd = agentCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["add", "alice/example"], { from: "user" })

      expect(ctx.mockClient.get).toHaveBeenCalledWith(
        "/api/v2/accounts/resolve/alice%2Fexample",
      )
    })

    it("lets a resolve API error through untouched, and writes nothing", async () => {
      // Deliberately not wrapped. cli.ts has one top-level handler that renders
      // an OpenSeaAPIError with its status, path, and the server's own message
      // ("Username not found: ..."), and picks the exit code from the status:
      // 3 for a 429, 1 otherwise. Re-throwing a generic Error here would throw
      // all of that away and report a rate-limited lookup as a plain failure.
      const apiError = Object.assign(new Error("Username not found"), {
        name: "OpenSeaAPIError",
        statusCode: 404,
      })
      ctx.mockClient.get.mockRejectedValue(apiError)

      const cmd = agentCommand(ctx.getClient, ctx.getFormat)

      await expect(
        cmd.parseAsync(["add", "nosuchuser"], { from: "user" }),
      ).rejects.toBe(apiError)
      expect(ctx.mockClient.post).not.toHaveBeenCalled()
    })

    it("fails without writing when the identifier resolves to nothing", async () => {
      ctx.mockClient.get.mockResolvedValue({ address: null })

      const cmd = agentCommand(ctx.getClient, ctx.getFormat)

      await expect(
        cmd.parseAsync(["add", "nosuchuser"], { from: "user" }),
      ).rejects.toThrow(
        'Could not resolve "nosuchuser" to an account address. ' +
          "Pass an OpenSea username, an ENS name, or a wallet address.",
      )
      expect(ctx.mockClient.post).not.toHaveBeenCalled()
    })
  })
})

describe("agentCommand path arguments", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
    resolveAllRequests(ctx.mockClient)
    ctx.mockClient.get.mockResolvedValue({ address: AGENT_ADDRESS })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each<[string[], string[]]>([
    [
      ["profile", "alice/1"],
      ["GET /api/v2/accounts/alice%2F1/agent-relationships"],
    ],
    [
      ["add", "alice/1"],
      [
        "GET /api/v2/accounts/resolve/alice%2F1",
        "POST /api/v2/accounts/agent-relationships",
      ],
    ],
  ])("%j encodes the identifier", async (argv, requests) => {
    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(argv, { from: "user" })
    expect(requestedPaths(ctx.mockClient)).toEqual(requests)
  })

  it.each<[string, string]>([
    ["profile", "."],
    ["profile", ".."],
    ["add", "."],
    ["add", ".."],
  ])("%s rejects %j before any request", async (subcommand, segment) => {
    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync([subcommand, segment], { from: "user" }),
    ).rejects.toThrow(`Invalid path segment: "${segment}"`)
    expect(requestedPaths(ctx.mockClient)).toEqual([])
  })
})
