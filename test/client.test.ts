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

      expect(fetch).toHaveBeenCalledWith(
        "https://api.opensea.io/api/v2/test",
        expect.objectContaining({
          method: "GET",
          headers: {
            Accept: "application/json",
            "x-api-key": "test-key",
          },
        }),
      )
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
        expect.objectContaining({
          method: "POST",
          headers: {
            Accept: "application/json",
            "x-api-key": "test-key",
          },
        }),
      )
      expect(result).toEqual(mockResponse)
    })

    it("sends JSON body when provided", async () => {
      mockFetchResponse({ id: 1 })

      await client.post("/api/v2/create", { name: "test" })

      expect(fetch).toHaveBeenCalledWith(
        "https://api.opensea.io/api/v2/create",
        expect.objectContaining({
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-api-key": "test-key",
          },
          body: JSON.stringify({ name: "test" }),
        }),
      )
    })

    it("appends query params when provided", async () => {
      mockFetchResponse({})

      await client.post("/api/v2/action", undefined, {
        chain: "ethereum",
      })

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
      const url = new URL(calledUrl)
      expect(url.searchParams.get("chain")).toBe("ethereum")
    })

    it("throws OpenSeaAPIError on non-ok response", async () => {
      mockFetchTextResponse("Server Error", 500)

      await expect(client.post("/api/v2/fail")).rejects.toThrow(OpenSeaAPIError)
    })
  })

  describe("graphql", () => {
    it("makes POST request to graphql URL with correct headers and body", async () => {
      const mockData = { collectionsByQuery: [{ slug: "test" }] }
      mockFetchResponse({ data: mockData })

      const result = await client.graphql<typeof mockData>(
        "query { collectionsByQuery { slug } }",
        { query: "test" },
      )

      expect(fetch).toHaveBeenCalledWith(
        "https://gql.opensea.io/graphql",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "x-api-key": "test-key",
          },
          body: JSON.stringify({
            query: "query { collectionsByQuery { slug } }",
            variables: { query: "test" },
          }),
        }),
      )
      expect(result).toEqual(mockData)
    })

    it("uses custom graphqlUrl when configured", async () => {
      const custom = new OpenSeaClient({
        apiKey: "key",
        graphqlUrl: "https://custom-gql.example.com/graphql",
      })
      mockFetchResponse({ data: {} })

      await custom.graphql("query { test }")

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
      expect(calledUrl).toBe("https://custom-gql.example.com/graphql")
    })

    it("throws OpenSeaAPIError on non-ok HTTP response", async () => {
      mockFetchTextResponse("Unauthorized", 401)

      await expect(client.graphql("query { test }")).rejects.toThrow(
        OpenSeaAPIError,
      )
    })

    it("throws OpenSeaAPIError when response contains GraphQL errors", async () => {
      mockFetchResponse({
        errors: [{ message: "Field not found" }, { message: "Invalid query" }],
      })

      try {
        await client.graphql("query { bad }")
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(OpenSeaAPIError)
        const apiErr = err as OpenSeaAPIError
        expect(apiErr.statusCode).toBe(400)
        expect(apiErr.responseBody).toBe("Field not found; Invalid query")
        expect(apiErr.path).toBe("graphql")
      }
    })

    it("throws OpenSeaAPIError when response data is missing", async () => {
      mockFetchResponse({})

      try {
        await client.graphql("query { test }")
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(OpenSeaAPIError)
        const apiErr = err as OpenSeaAPIError
        expect(apiErr.statusCode).toBe(500)
        expect(apiErr.responseBody).toBe("GraphQL response missing data")
      }
    })
  })

  describe("timeout", () => {
    it("passes AbortSignal.timeout to fetch calls", async () => {
      const timedClient = new OpenSeaClient({
        apiKey: "test-key",
        timeout: 5000,
      })
      mockFetchResponse({ ok: true })

      await timedClient.get("/api/v2/test")

      const fetchOptions = vi.mocked(fetch).mock.calls[0][1] as RequestInit
      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal)
    })

    it("uses default 30s timeout", async () => {
      mockFetchResponse({ ok: true })

      await client.get("/api/v2/test")

      const fetchOptions = vi.mocked(fetch).mock.calls[0][1] as RequestInit
      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal)
    })
  })

  describe("verbose", () => {
    it("logs request and response to stderr when enabled", async () => {
      const verboseClient = new OpenSeaClient({
        apiKey: "test-key",
        verbose: true,
      })
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mockFetchResponse({ name: "test" })

      await verboseClient.get("/api/v2/collections/test")

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "[verbose] GET https://api.opensea.io/api/v2/collections/test",
        ),
      )
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("[verbose] 200"),
      )
    })

    it("does not log when verbose is disabled", async () => {
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mockFetchResponse({ name: "test" })

      await client.get("/api/v2/test")

      expect(stderrSpy).not.toHaveBeenCalled()
    })

    it("logs for post requests", async () => {
      const verboseClient = new OpenSeaClient({
        apiKey: "test-key",
        verbose: true,
      })
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mockFetchResponse({ status: "ok" })

      await verboseClient.post("/api/v2/refresh")

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("[verbose] POST"),
      )
    })

    it("logs for graphql requests", async () => {
      const verboseClient = new OpenSeaClient({
        apiKey: "test-key",
        verbose: true,
      })
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mockFetchResponse({ data: { test: true } })

      await verboseClient.graphql("query { test }")

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("[verbose] POST"),
      )
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
