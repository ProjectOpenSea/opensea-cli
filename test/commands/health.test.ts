import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPIError } from "../../src/client.js"
import { healthCommand } from "../../src/commands/health.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("healthCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct name", () => {
    const cmd = healthCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("health")
  })

  it("outputs ok status when both connectivity and auth succeed", async () => {
    ctx.mockClient.get.mockResolvedValue({})

    const cmd = healthCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync([], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/collections", {
      limit: 1,
    })
    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/listings/collection/boredapeyachtclub/all",
      {
        limit: 1,
      },
    )
    const output = JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string)
    expect(output.status).toBe("ok")
    expect(output.key_prefix).toBe("test...")
    expect(output.authenticated).toBe(true)
    expect(output.message).toBe("Connectivity and authentication are working")
  })

  it("outputs error status when connectivity fails", async () => {
    ctx.mockClient.get.mockRejectedValue(
      new OpenSeaAPIError(500, "Internal Server Error", "/api/v2/collections"),
    )

    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)

    const cmd = healthCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync([], { from: "user" })

    const output = JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string)
    expect(output.status).toBe("error")
    expect(output.authenticated).toBe(false)
    expect(output.message).toContain("API error (500)")
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it("outputs error status when auth fails (401)", async () => {
    ctx.mockClient.get
      .mockResolvedValueOnce({}) // connectivity ok
      .mockRejectedValueOnce(
        new OpenSeaAPIError(
          401,
          "Unauthorized",
          "/api/v2/listings/collection/boredapeyachtclub/all",
        ),
      )

    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)

    const cmd = healthCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync([], { from: "user" })

    const output = JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string)
    expect(output.status).toBe("error")
    expect(output.authenticated).toBe(false)
    expect(output.message).toContain("Authentication failed (401)")
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it("outputs error status on network errors", async () => {
    ctx.mockClient.get.mockRejectedValue(new TypeError("fetch failed"))

    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)

    const cmd = healthCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync([], { from: "user" })

    const output = JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string)
    expect(output.status).toBe("error")
    expect(output.message).toContain("Network error: fetch failed")
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it("reports ok with unverified auth when events endpoint has non-auth error", async () => {
    ctx.mockClient.get
      .mockResolvedValueOnce({}) // connectivity ok
      .mockRejectedValueOnce(
        new OpenSeaAPIError(
          500,
          "Server Error",
          "/api/v2/listings/collection/boredapeyachtclub/all",
        ),
      )

    const cmd = healthCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync([], { from: "user" })

    const output = JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string)
    expect(output.status).toBe("ok")
    expect(output.authenticated).toBe(false)
    expect(output.message).toContain("could not be verified")
  })
})
