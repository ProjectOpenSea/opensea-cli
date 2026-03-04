import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPIError } from "../../src/client.js"
import { healthCommand } from "../../src/commands/health.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("healthCommand", () => {
  let ctx: CommandTestContext
  let mockGetApiKeyPrefix: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ctx = createCommandTestContext()
    mockGetApiKeyPrefix = vi.fn().mockReturnValue("test...")
    ;(ctx.mockClient as Record<string, unknown>).getApiKeyPrefix =
      mockGetApiKeyPrefix
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct name", () => {
    const cmd = healthCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("health")
  })

  it("outputs ok status when API call succeeds", async () => {
    ctx.mockClient.get.mockResolvedValue({ collections: [] })

    const cmd = healthCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync([], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/collections", {
      limit: 1,
    })
    const output = JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string)
    expect(output.status).toBe("ok")
    expect(output.key_prefix).toBe("test...")
    expect(output.message).toBe("API key is valid and connectivity is working")
  })

  it("outputs error status on authentication failure", async () => {
    ctx.mockClient.get.mockRejectedValue(
      new OpenSeaAPIError(401, "Unauthorized", "/api/v2/collections"),
    )

    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)

    const cmd = healthCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync([], { from: "user" })

    const output = JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string)
    expect(output.status).toBe("error")
    expect(output.key_prefix).toBe("test...")
    expect(output.message).toContain("Authentication failed (401)")
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it("outputs error status on other API errors", async () => {
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
    expect(output.message).toContain("API error (500)")
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
})
