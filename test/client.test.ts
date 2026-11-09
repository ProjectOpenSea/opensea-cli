import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPIError, OpenSeaClient } from "../src/client.js"
import { OpenSeaCLI } from "../src/sdk.js"
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

    it("repeats array query params, one per value", async () => {
      mockFetchResponse({})

      await client.get("/api/v2/test", {
        grader: ["PSA", "CGC"],
        empty: [],
        mixed: ["a", null, undefined, "b"],
      })

      const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
      expect(url.searchParams.getAll("grader")).toEqual(["PSA", "CGC"])
      expect(url.searchParams.has("empty")).toBe(false)
      expect(url.searchParams.getAll("mixed")).toEqual(["a", "b"])
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

  describe("write methods", () => {
    it.each([
      "PUT",
      "PATCH",
      "DELETE",
    ] as const)("sends a %s request with a JSON body", async method => {
      mockFetchResponse({ ok: true })
      const fn =
        method === "PUT"
          ? client.put.bind(client)
          : method === "PATCH"
            ? client.patch.bind(client)
            : client.delete.bind(client)

      await fn("/api/v2/scoped", { value: true })

      expect(fetch).toHaveBeenCalledWith(
        "https://api.opensea.io/api/v2/scoped",
        expect.objectContaining({
          method,
          body: JSON.stringify({ value: true }),
        }),
      )
    })

    it("returns undefined for an empty successful response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 204 }),
      )

      await expect(client.delete("/api/v2/scoped")).resolves.toBeUndefined()
    })

    // Endpoints whose DELETE arguments are query parameters rather than a body
    // rely on this: fetch, OkHttp and urllib all drop DELETE bodies by default
    // and proxies may strip them, so a caller passing params must get them on
    // the URL and must not get a body.
    it("puts DELETE params on the URL and sends no body", async () => {
      mockFetchResponse({ removed: true })

      await client.delete("/api/v2/accounts/agent-relationships", undefined, {
        counterparty_address: "0xowner",
        caller_role: "AGENT",
      })

      const [rawUrl, init] = vi.mocked(fetch).mock.calls[0] as [
        string,
        RequestInit,
      ]
      const url = new URL(rawUrl)
      expect(url.pathname).toBe("/api/v2/accounts/agent-relationships")
      expect(url.searchParams.get("counterparty_address")).toBe("0xowner")
      expect(url.searchParams.get("caller_role")).toBe("AGENT")
      expect(init.method).toBe("DELETE")
      expect(init.body).toBeUndefined()
      expect(
        (init.headers as Record<string, string>)["Content-Type"],
      ).toBeUndefined()
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

    it("retries post requests on 429", async () => {
      const retryClient = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 3,
        retryBaseDelay: 100,
      })
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
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

    it("does not retry post requests on 5xx", async () => {
      const retryClient = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 3,
        retryBaseDelay: 100,
      })
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Server Error", { status: 503 }),
      )

      await expect(retryClient.post("/api/v2/refresh")).rejects.toThrow(
        OpenSeaAPIError,
      )
      expect(fetch).toHaveBeenCalledTimes(1)
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

  describe("Retry-After handling", () => {
    // Base delay for the single retry these tests allow. A header the client
    // rejects leaves the wait at exactly this, with jitter pinned to zero.
    const BACKOFF_MS = 100
    const NOW = new Date("2026-01-01T00:00:00Z")

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(NOW)
      vi.spyOn(Math, "random").mockReturnValue(0)
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    function retryOnce(retryAfter: string) {
      const client = new OpenSeaClient({
        apiKey: "test-key",
        maxRetries: 1,
        retryBaseDelay: BACKOFF_MS,
      })
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response("Rate limited", {
            status: 429,
            headers: { "Retry-After": retryAfter },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        )
      return { fetchSpy, result: client.get("/api/v2/test") }
    }

    /**
     * Drives one retry on fake timers and pins the wait to an exact
     * millisecond: one call left at expectedDelayMs - 1, two at
     * expectedDelayMs. Asserting the earlier boundary too is what separates a
     * capped implementation from one that merely computes a cap, since an
     * uncapped client is still asleep when the capped one has already retried.
     */
    async function expectRetryAt(retryAfter: string, expectedDelayMs: number) {
      const { fetchSpy, result } = retryOnce(retryAfter)

      await vi.advanceTimersByTimeAsync(0)
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(expectedDelayMs - 1)
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(fetchSpy).toHaveBeenCalledTimes(2)

      await expect(result).resolves.toEqual({ ok: true })
    }

    it("waits the number of seconds the header asks for", async () => {
      await expectRetryAt("5", 5_000)
    })

    it("tolerates surrounding whitespace", async () => {
      await expectRetryAt("  5  ", 5_000)
    })

    it("caps an oversized value at 300 seconds", async () => {
      await expectRetryAt("999999", 300_000)
    })

    it("caps a value large enough to overflow a 32-bit timer", async () => {
      // Unclamped this becomes 999999999000ms, which setTimeout truncates to
      // 1ms, so the client would retry immediately with no backoff at all.
      await expectRetryAt("999999999", 300_000)
    })

    it("falls back to the backoff on a negative value", async () => {
      await expectRetryAt("-5", BACKOFF_MS)
    })

    it("falls back to the backoff on zero", async () => {
      await expectRetryAt("0", BACKOFF_MS)
    })

    it("falls back to the backoff on a value carrying a unit", async () => {
      await expectRetryAt("5s", BACKOFF_MS)
    })

    it("falls back to the backoff on a fractional value", async () => {
      await expectRetryAt("1.5", BACKOFF_MS)
    })

    it("falls back to the backoff on unparseable text", async () => {
      await expectRetryAt("soon", BACKOFF_MS)
    })

    it("waits until a future HTTP-date", async () => {
      const header = new Date(NOW.getTime() + 10_000).toUTCString()
      await expectRetryAt(header, 10_000)
    })

    it("caps a far-future HTTP-date at 300 seconds", async () => {
      const header = new Date(
        NOW.getTime() + 30 * 24 * 60 * 60 * 1_000,
      ).toUTCString()
      await expectRetryAt(header, 300_000)
    })

    it("falls back to the backoff on an HTTP-date in the past", async () => {
      const header = new Date(NOW.getTime() - 10_000).toUTCString()
      await expectRetryAt(header, BACKOFF_MS)
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

describe("encoded path segments on the wire", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("keeps an encoded segment encoded in the URL a GET requests", async () => {
    mockFetchResponse({ collection: "x" })
    const sdk = new OpenSeaCLI({ apiKey: "test-key", maxRetries: 0 })

    await sdk.collections.get("cats/1?a#b")

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toBe(
      "https://api.opensea.io/api/v2/collections/cats%2F1%3Fa%23b",
    )
  })

  it("sends account activity filters as repeated query keys", async () => {
    mockFetchResponse({ activities: [], next: null })
    const sdk = new OpenSeaCLI({ apiKey: "test-key", maxRetries: 0 })

    await sdk.tokens.accountActivity("0xdef", {
      chains: ["ethereum", "base"],
      tokens: ["0xaaa", "0xbbb"],
      type: ["send", "receive"],
    })

    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]))
    expect(url.pathname).toBe("/api/v2/account/0xdef/token-activity")
    expect(url.searchParams.getAll("chains")).toEqual(["ethereum", "base"])
    expect(url.searchParams.getAll("tokens")).toEqual(["0xaaa", "0xbbb"])
    expect(url.searchParams.getAll("type")).toEqual(["send", "receive"])
  })

  it("keeps encoded segments encoded in the URL a POST requests", async () => {
    mockFetchResponse({})
    const sdk = new OpenSeaCLI({ apiKey: "test-key", maxRetries: 0 })

    await sdk.listings.post("ethereum/x", "seaport", {} as never)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toBe(
      "https://api.opensea.io/api/v2/orders/ethereum%2Fx/seaport/listings",
    )
    expect(init?.method).toBe("POST")
  })
})
