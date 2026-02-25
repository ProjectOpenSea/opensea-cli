import { afterEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPIError, OpenSeaClient } from "../src/client.js"
import { formatOutput } from "../src/output.js"
import { OpenSeaCLI } from "../src/sdk.js"
import { mockFetchResponse, mockFetchTextResponse } from "./mocks.js"

describe("integration: OpenSeaClient + formatOutput", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("fetches data and formats as JSON", async () => {
    const mockData = { name: "CoolCats", collection: "cool-cats" }
    mockFetchResponse(mockData)

    const client = new OpenSeaClient({ apiKey: "test-key" })
    const result = await client.get<{ name: string }>(
      "/api/v2/collections/cool-cats",
    )
    const output = formatOutput(result, "json")

    expect(JSON.parse(output)).toEqual(mockData)
  })

  it("fetches data and formats as table", async () => {
    const mockData = { name: "CoolCats", collection: "cool-cats" }
    mockFetchResponse(mockData)

    const client = new OpenSeaClient({ apiKey: "test-key" })
    const result = await client.get<{ name: string }>(
      "/api/v2/collections/cool-cats",
    )
    const output = formatOutput(result, "table")

    expect(output).toContain("name")
    expect(output).toContain("CoolCats")
  })

  it("handles API errors gracefully", async () => {
    mockFetchTextResponse('{"error": "unauthorized"}', 401)

    const client = new OpenSeaClient({ apiKey: "bad-key" })

    try {
      await client.get("/api/v2/collections/test")
      expect.fail("Should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(OpenSeaAPIError)
      const apiErr = err as OpenSeaAPIError
      expect(apiErr.statusCode).toBe(401)
    }
  })
})

describe("integration: OpenSeaCLI SDK", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("SDK collections.get fetches and returns data", async () => {
    const mockData = { name: "TestCollection" }
    mockFetchResponse(mockData)

    const sdk = new OpenSeaCLI({ apiKey: "test-key" })
    const result = await sdk.collections.get("test")

    expect(result).toEqual(mockData)
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain("/api/v2/collections/test")
  })

  it("SDK nfts.get fetches and returns data", async () => {
    const mockData = { nft: { identifier: "1" } }
    mockFetchResponse(mockData)

    const sdk = new OpenSeaCLI({ apiKey: "test-key" })
    const result = await sdk.nfts.get("ethereum", "0xabc", "1")

    expect(result).toEqual(mockData)
  })

  it("SDK listings.all fetches paginated data", async () => {
    const mockData = { listings: [{ order_hash: "abc" }], next: "cursor1" }
    mockFetchResponse(mockData)

    const sdk = new OpenSeaCLI({ apiKey: "test-key" })
    const result = await sdk.listings.all("slug", { limit: 5 })

    expect(result.listings).toHaveLength(1)
    expect(result.next).toBe("cursor1")
  })

  it("SDK accounts.get fetches account", async () => {
    const mockData = { address: "0xabc", username: "user1" }
    mockFetchResponse(mockData)

    const sdk = new OpenSeaCLI({ apiKey: "test-key" })
    const result = await sdk.accounts.get("0xabc")

    expect(result).toEqual(mockData)
  })

  it("SDK with custom baseUrl sends requests to correct host", async () => {
    mockFetchResponse({})

    const sdk = new OpenSeaCLI({
      apiKey: "test-key",
      baseUrl: "https://custom.api.io",
    })
    await sdk.collections.get("test")

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl.startsWith("https://custom.api.io/")).toBe(true)
  })
})
