import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { apiCommand } from "../../src/commands/api.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("apiCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("sends GET requests with JSON query parameters", async () => {
    ctx.mockClient.get.mockResolvedValue({ ok: true })
    const cmd = apiCommand(ctx.getClient, ctx.getFormat)

    await cmd.parseAsync(
      [
        "request",
        "GET",
        "/api/v2/account/0xabc/favorites",
        "--params",
        '{"limit":1}',
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/account/0xabc/favorites",
      { limit: 1 },
    )
  })

  it("dispatches PATCH requests", async () => {
    ctx.mockClient.patch.mockResolvedValue({ ok: true })
    const cmd = apiCommand(ctx.getClient, ctx.getFormat)

    await cmd.parseAsync(["request", "PATCH", "/api/v2/profile"], {
      from: "user",
    })

    expect(ctx.mockClient.patch).toHaveBeenCalledWith(
      "/api/v2/profile",
      undefined,
      undefined,
    )
  })

  it("rejects paths outside API v2", async () => {
    const cmd = apiCommand(ctx.getClient, ctx.getFormat)

    await expect(
      cmd.parseAsync(["request", "GET", "https://example.com"], {
        from: "user",
      }),
    ).rejects.toThrow("API path must begin with /api/v2/")
  })

  it("rejects non-object query parameters", async () => {
    const cmd = apiCommand(ctx.getClient, ctx.getFormat)

    await expect(
      cmd.parseAsync(["request", "GET", "/api/v2/profile", "--params", "[]"], {
        from: "user",
      }),
    ).rejects.toThrow("--params must be a JSON object")
  })
})
