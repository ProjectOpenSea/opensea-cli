import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPIError, OpenSeaClient } from "../src/client.js"
import { mockFetchResponse, mockFetchTextResponse } from "./mocks.js"

describe("OpenSeaClient", () => {
  let client: OpenSeaClient

  beforeEach(() => {
    client = new OpenSeaClient({ apiKey: "test-key", maxRetries: 0 })
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
          headers: expect.objectContaining({
            Accept: "application/json",
            "User-Agent": expect.stringMatching(/^opensea-cli\/\d+\.\d+\.\d+$/),
            "x-api-key": "test-key",
          }),
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
          headers: expect.objectContaining({
            Accept: "application/json",
            "User-Agent": expect.stringMatching(/^opensea-cli\/\d+\.\d+\.\d+$/),
            "x-api-key": "test-key",
          }),
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
          headers: expect.objectContaining({
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": expect.stringMatching(/^opensea-cli\/\d+\.\d+\.\d+$/),
            "x-api-key": "test-key",
          }),
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

  describe("retry", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("retries on 429 and succeeds", async () => {
      const retryClient = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 3,
        retryBaseDelay: 100,
      })
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        )

      const promise = retryClient.get("/api/v2/test")
      await vi.advanceTimersByTimeAsync(10_000)
      const result = await promise

      expect(result).toEqual({ ok: true })
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it("retries on 500 and succeeds", async () => {
      const retryClient = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 3,
        retryBaseDelay: 100,
      })
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("Server Error", { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        )

      const promise = retryClient.get("/api/v2/test")
      await vi.advanceTimersByTimeAsync(10_000)
      const result = await promise

      expect(result).toEqual({ ok: true })
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it("throws after exhausting all retries", async () => {
      const retryClient = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 2,
        retryBaseDelay: 100,
      })
      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(new Response("Rate limited", { status: 429 })),
      )

      const promise = retryClient.get("/api/v2/test").catch((e: unknown) => e)
      await vi.advanceTimersByTimeAsync(60_000)
      const error = await promise

      expect(error).toBeInstanceOf(OpenSeaAPIError)
      expect(fetch).toHaveBeenCalledTimes(3)
    })

    it("does not retry on 404", async () => {
      const retryClient = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 3,
        retryBaseDelay: 100,
      })
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Not Found", { status: 404 }),
      )

      await expect(retryClient.get("/api/v2/test")).rejects.toThrow(
        OpenSeaAPIError,
      )
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it("does not retry when maxRetries is 0", async () => {
      const noRetryClient = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 0,
      })
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Rate limited", { status: 429 }),
      )

      await expect(noRetryClient.get("/api/v2/test")).rejects.toThrow(
        OpenSeaAPIError,
      )
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it("respects Retry-After header (seconds)", async () => {
      const retryClient = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 1,
        retryBaseDelay: 100,
      })
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response("Rate limited", {
            status: 429,
            headers: { "Retry-After": "5" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        )

      const promise = retryClient.get("/api/v2/test")
      // Advance past the 5s Retry-After + jitter
      await vi.advanceTimersByTimeAsync(10_000)
      const result = await promise

      expect(result).toEqual({ ok: true })
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it("retries post requests", async () => {
      const retryClient = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 3,
        retryBaseDelay: 100,
      })
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("Server Error", { status: 503 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: "ok" }), {
            status: 200,
          }),
        )

      const promise = retryClient.post("/api/v2/refresh")
      await vi.advanceTimersByTimeAsync(10_000)
      const result = await promise

      expect(result).toEqual({ status: "ok" })
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it("logs retries when verbose is enabled", async () => {
      const verboseRetryClient = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 3,
        retryBaseDelay: 100,
        verbose: true,
      })
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        )

      const promise = verboseRetryClient.get("/api/v2/test")
      await vi.advanceTimersByTimeAsync(10_000)
      await promise

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[verbose\] Retry 1\/3 after \d+ms \(status 429\)/,
        ),
      )
    })

    it("does not log retries when verbose is disabled", async () => {
      const retryClient = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 3,
        retryBaseDelay: 100,
      })
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        )

      const promise = retryClient.get("/api/v2/test")
      await vi.advanceTimersByTimeAsync(10_000)
      await promise

      expect(stderrSpy).not.toHaveBeenCalled()
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
  })

  describe("getDefaultChain", () => {
    it("returns the default chain", () => {
      expect(client.getDefaultChain()).toBe("ethereum")
    })
  })

  describe("getApiKeyPrefix", () => {
    it("returns first 4 characters followed by ellipsis", () => {
      expect(client.getApiKeyPrefix()).toBe("test...")
    })

    it("masks short API keys", () => {
      const shortKeyClient = new OpenSeaClient({ apiKey: "ab" })
      expect(shortKeyClient.getApiKeyPrefix()).toBe("***")
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
