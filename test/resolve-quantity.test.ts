import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaClient } from "../src/client.js"
import {
  _convertToSmallestUnit as convertToSmallestUnit,
  resolveQuantity,
} from "../src/sdk.js"

vi.mock("../src/client.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/client.js")>()
  const MockOpenSeaClient = vi.fn()
  MockOpenSeaClient.prototype.get = vi.fn()
  MockOpenSeaClient.prototype.post = vi.fn()
  MockOpenSeaClient.prototype.getDefaultChain = vi.fn(() => "ethereum")
  MockOpenSeaClient.prototype.getApiKeyPrefix = vi.fn(() => "test...")
  return {
    OpenSeaClient: MockOpenSeaClient,
    OpenSeaAPIError: actual.OpenSeaAPIError,
  }
})

describe("convertToSmallestUnit", () => {
  it("converts 0.001 with 6 decimals to 1000", () => {
    expect(convertToSmallestUnit("0.001", 6)).toBe("1000")
  })

  it("converts 1.5 with 18 decimals to correct bigint string", () => {
    expect(convertToSmallestUnit("1.5", 18)).toBe("1500000000000000000")
  })

  it("throws on too many decimal places", () => {
    expect(() => convertToSmallestUnit("0.0000001", 6)).toThrow(
      "Too many decimal places (7) for token with 6 decimals",
    )
  })
})

describe("resolveQuantity", () => {
  let client: OpenSeaClient
  let mockGet: ReturnType<typeof vi.fn>

  beforeEach(() => {
    client = new OpenSeaClient({ apiKey: "test-key" })
    mockGet = vi.mocked(OpenSeaClient.prototype.get)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns plain integer unchanged without API call", async () => {
    const result = await resolveQuantity(client, "ethereum", "0xToken", "1000")
    expect(result).toBe("1000")
    expect(mockGet).not.toHaveBeenCalled()
  })

  it("rejects invalid non-numeric input", async () => {
    await expect(
      resolveQuantity(client, "ethereum", "0xToken", "abc"),
    ).rejects.toThrow(
      'Invalid quantity "abc": must be an integer or decimal number',
    )
  })

  it("rejects leading-dot decimal (.5)", async () => {
    await expect(
      resolveQuantity(client, "ethereum", "0xToken", ".5"),
    ).rejects.toThrow(
      'Invalid quantity ".5": must be an integer or decimal number',
    )
  })

  it("converts decimal quantity using token decimals from API", async () => {
    mockGet.mockResolvedValue({ decimals: 6 })

    const result = await resolveQuantity(client, "ethereum", "0xToken", "0.001")
    expect(result).toBe("1000")
    expect(mockGet).toHaveBeenCalledWith("/api/v2/chain/ethereum/token/0xToken")
  })
})
