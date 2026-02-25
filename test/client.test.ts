import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPIError, OpenSeaClient } from "../src/client.js"
import { mockFetchResponse, mockFetchTextResponse } from "./mocks.js"

describe("OpenSeaClient", () => {
  let client: OpenSeaClient

  beforeEach(() => {
    client = new OpenSeaClient({ apiKey: "test-key" })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("constructor", () => {
    it("uses default base URL and chain", () => {
      expect(client.getDefaultChain()).toBe("ethereum")
    })

    it("accepts custom base URL and chain", () => {
      const custom = new OpenSeaClient({
        apiKey: "key",
        baseUrl: "https://custom.api",
        chain: "base",
      })
      expect(custom.getDefaultChain()).toBe("base")
    })
  })

  describe("get", () => {
    it("makes GET request with correct headers", async () => {
      const mockResponse = { name: "test" }
      mockFetchResponse(mockResponse)

      const result = await client.get("/api/v2/test")

      expect(fetch).toHaveBeenCalledWith("https://api.opensea.io/api/v2/test", {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-api-key": "test-key",
        },
      })
      expect(result).toEqual(mockResponse)
    })

    it("appends query params, skipping null and undefined", async () => {
      mockFetchResponse({})

      await client.get("/api/v2/test", {
        chain: "ethereum",
        limit: 10,
        next: null,
        missing: undefined,
      })

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
      const url = new URL(calledUrl)
      expect(url.searchParams.get("chain")).toBe("ethereum")
      expect(url.searchParams.get("limit")).toBe("10")
      expect(url.searchParams.has("next")).toBe(false)
      expect(url.searchParams.has("missing")).toBe(false)
    })

    it("throws OpenSeaAPIError on non-ok response", async () => {
      mockFetchTextResponse("Not Found", 404)

      try {
        await client.get("/api/v2/bad")
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(OpenSeaAPIError)
        const apiErr = err as OpenSeaAPIError
        expect(apiErr.statusCode).toBe(404)
        expect(apiErr.responseBody).toBe("Not Found")
        expect(apiErr.path).toBe("/api/v2/bad")
      }
    })
  })

  describe("post", () => {
    it("makes POST request with correct headers", async () => {
      const mockResponse = { status: "ok" }
      mockFetchResponse(mockResponse)

      const result = await client.post("/api/v2/refresh")

      expect(fetch).toHaveBeenCalledWith(
        "https://api.opensea.io/api/v2/refresh",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "x-api-key": "test-key",
          },
        },
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws OpenSeaAPIError on non-ok response", async () => {
      mockFetchTextResponse("Server Error", 500)

      await expect(client.post("/api/v2/fail")).rejects.toThrow(OpenSeaAPIError)
    })
  })

  describe("getDefaultChain", () => {
    it("returns the default chain", () => {
      expect(client.getDefaultChain()).toBe("ethereum")
    })
  })
})

describe("OpenSeaAPIError", () => {
  it("has correct properties", () => {
    const error = new OpenSeaAPIError(404, "Not Found", "/api/v2/test")
    expect(error.statusCode).toBe(404)
    expect(error.responseBody).toBe("Not Found")
    expect(error.path).toBe("/api/v2/test")
    expect(error.name).toBe("OpenSeaAPIError")
    expect(error.message).toBe(
      "OpenSea API error 404 on /api/v2/test: Not Found",
    )
  })

  it("is an instance of Error", () => {
    const error = new OpenSeaAPIError(500, "fail", "/test")
    expect(error).toBeInstanceOf(Error)
  })
})
