import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPIError } from "../../src/client.js"
import { healthCommand } from "../../src/commands/health.js"
import type { MockClient } from "../mocks.js"

describe("healthCommand", () => {
  let mockClient: MockClient
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
    }
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct name", () => {
    const cmd = healthCommand(() => mockClient as never)
    expect(cmd.name()).toBe("health")
  })

  it("outputs ok status on success", async () => {
    mockClient.get.mockResolvedValue({ collections: [] })

    const cmd = healthCommand(() => mockClient as never)
    await cmd.parseAsync([], { from: "user" })

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string)
    expect(output.status).toBe("ok")
    expect(typeof output.latency_ms).toBe("number")
    expect(output.latency_ms).toBeGreaterThanOrEqual(0)
  })

  it("calls correct endpoint", async () => {
    mockClient.get.mockResolvedValue({ collections: [] })

    const cmd = healthCommand(() => mockClient as never)
    await cmd.parseAsync([], { from: "user" })

    expect(mockClient.get).toHaveBeenCalledWith("/api/v2/collections", {
      limit: 1,
    })
  })

  it("outputs error status on API error", async () => {
    mockClient.get.mockRejectedValue(
      new OpenSeaAPIError(401, "Unauthorized", "/api/v2/collections"),
    )

    const cmd = healthCommand(() => mockClient as never)
    await cmd.parseAsync([], { from: "user" })

    const output = JSON.parse(stderrSpy.mock.calls[0][0] as string)
    expect(output.status).toBe("error")
    expect(output.http_status).toBe(401)
    expect(output.message).toBe("Unauthorized")
    expect(typeof output.latency_ms).toBe("number")
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("outputs error status on network error", async () => {
    mockClient.get.mockRejectedValue(new TypeError("fetch failed"))

    const cmd = healthCommand(() => mockClient as never)
    await cmd.parseAsync([], { from: "user" })

    expect(stderrSpy).toHaveBeenCalledTimes(1)
    const output = JSON.parse(stderrSpy.mock.calls[0][0] as string)
    expect(output.status).toBe("error")
    expect(output.message).toBe("fetch failed")
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
