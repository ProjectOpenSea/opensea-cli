import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaClient } from "../src/client.js"
import { OpenSeaCLI } from "../src/sdk.js"

vi.mock("../src/client.js", () => {
  const MockOpenSeaClient = vi.fn()
  MockOpenSeaClient.prototype.get = vi.fn()
  MockOpenSeaClient.prototype.post = vi.fn()
  MockOpenSeaClient.prototype.getDefaultChain = vi.fn(() => "ethereum")
  return { OpenSeaClient: MockOpenSeaClient, OpenSeaAPIError: vi.fn() }
})

describe("OpenSeaCLI", () => {
  let sdk: OpenSeaCLI
  let mockGet: ReturnType<typeof vi.fn>
  let mockPost: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sdk = new OpenSeaCLI({ apiKey: "test-key" })
    mockGet = vi.mocked(OpenSeaClient.prototype.get)
    mockPost = vi.mocked(OpenSeaClient.prototype.post)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("creates all API namespaces", () => {
      expect(sdk.collections).toBeDefined()
      expect(sdk.nfts).toBeDefined()
      expect(sdk.listings).toBeDefined()
      expect(sdk.offers).toBeDefined()
      expect(sdk.events).toBeDefined()
      expect(sdk.accounts).toBeDefined()
      expect(sdk.tokens).toBeDefined()
      expect(sdk.search).toBeDefined()
      expect(sdk.swaps).toBeDefined()
    })
  })

  describe("collections", () => {
    it("get calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ name: "Test" })
      const result = await sdk.collections.get("test-slug")
      expect(mockGet).toHaveBeenCalledWith("/api/v2/collections/test-slug")
      expect(result).toEqual({ name: "Test" })
    })

    it("list calls correct endpoint with options", async () => {
      mockGet.mockResolvedValue({ collections: [], next: "abc" })
      await sdk.collections.list({
        chain: "ethereum",
        limit: 10,
        orderBy: "market_cap",
      })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/collections", {
        chain: "ethereum",
        limit: 10,
        next: undefined,
        order_by: "market_cap",
        creator_username: undefined,
        include_hidden: undefined,
      })
    })

    it("list calls with no options", async () => {
      mockGet.mockResolvedValue({ collections: [] })
      await sdk.collections.list()
      expect(mockGet).toHaveBeenCalledWith("/api/v2/collections", {
        chain: undefined,
        limit: undefined,
        next: undefined,
        order_by: undefined,
        creator_username: undefined,
        include_hidden: undefined,
      })
    })

    it("stats calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ total: {} })
      await sdk.collections.stats("test-slug")
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/collections/test-slug/stats",
      )
    })

    it("traits calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ categories: {} })
      await sdk.collections.traits("test-slug")
      expect(mockGet).toHaveBeenCalledWith("/api/v2/traits/test-slug")
    })
  })

  describe("nfts", () => {
    it("get calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ nft: {} })
      await sdk.nfts.get("ethereum", "0xabc", "1")
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/chain/ethereum/contract/0xabc/nfts/1",
      )
    })

    it("listByCollection calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ nfts: [] })
      await sdk.nfts.listByCollection("slug", { limit: 5 })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/collection/slug/nfts", {
        limit: 5,
        next: undefined,
      })
    })

    it("listByContract calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ nfts: [] })
      await sdk.nfts.listByContract("ethereum", "0xabc", { limit: 5 })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/chain/ethereum/contract/0xabc/nfts",
        { limit: 5, next: undefined },
      )
    })

    it("listByAccount calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ nfts: [] })
      await sdk.nfts.listByAccount("ethereum", "0xabc")
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/chain/ethereum/account/0xabc/nfts",
        { limit: undefined, next: undefined },
      )
    })

    it("refresh calls correct endpoint with POST", async () => {
      mockPost.mockResolvedValue(undefined)
      await sdk.nfts.refresh("ethereum", "0xabc", "1")
      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/chain/ethereum/contract/0xabc/nfts/1/refresh",
      )
    })

    it("getContract calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ address: "0xabc" })
      await sdk.nfts.getContract("ethereum", "0xabc")
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/chain/ethereum/contract/0xabc",
      )
    })
  })

  describe("listings", () => {
    it("all calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ listings: [] })
      await sdk.listings.all("slug", { limit: 10 })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/listings/collection/slug/all",
        { limit: 10, next: undefined },
      )
    })

    it("best calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ listings: [] })
      await sdk.listings.best("slug")
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/listings/collection/slug/best",
        { limit: undefined, next: undefined },
      )
    })

    it("bestForNFT calls correct endpoint", async () => {
      mockGet.mockResolvedValue({})
      await sdk.listings.bestForNFT("slug", "123")
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/listings/collection/slug/nfts/123/best",
      )
    })
  })

  describe("offers", () => {
    it("all calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ offers: [] })
      await sdk.offers.all("slug", { limit: 5 })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/offers/collection/slug/all",
        { limit: 5, next: undefined },
      )
    })

    it("collection calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ offers: [] })
      await sdk.offers.collection("slug")
      expect(mockGet).toHaveBeenCalledWith("/api/v2/offers/collection/slug", {
        limit: undefined,
        next: undefined,
      })
    })

    it("bestForNFT calls correct endpoint", async () => {
      mockGet.mockResolvedValue({})
      await sdk.offers.bestForNFT("slug", "123")
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/offers/collection/slug/nfts/123/best",
      )
    })

    it("traits calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ offers: [] })
      await sdk.offers.traits("slug", {
        type: "Background",
        value: "Blue",
        limit: 10,
      })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/offers/collection/slug/traits",
        { type: "Background", value: "Blue", limit: 10, next: undefined },
      )
    })
  })

  describe("events", () => {
    it("list calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ asset_events: [] })
      await sdk.events.list({ eventType: "sale", limit: 10 })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/events", {
        event_type: "sale",
        after: undefined,
        before: undefined,
        limit: 10,
        next: undefined,
        chain: undefined,
      })
    })

    it("list with no options", async () => {
      mockGet.mockResolvedValue({ asset_events: [] })
      await sdk.events.list()
      expect(mockGet).toHaveBeenCalledWith("/api/v2/events", {
        event_type: undefined,
        after: undefined,
        before: undefined,
        limit: undefined,
        next: undefined,
        chain: undefined,
      })
    })

    it("byAccount calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ asset_events: [] })
      await sdk.events.byAccount("0xabc", { eventType: "transfer" })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/events/accounts/0xabc", {
        event_type: "transfer",
        limit: undefined,
        next: undefined,
        chain: undefined,
      })
    })

    it("byCollection calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ asset_events: [] })
      await sdk.events.byCollection("slug")
      expect(mockGet).toHaveBeenCalledWith("/api/v2/events/collection/slug", {
        event_type: undefined,
        limit: undefined,
        next: undefined,
      })
    })

    it("byNFT calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ asset_events: [] })
      await sdk.events.byNFT("ethereum", "0xabc", "1", { limit: 5 })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/events/chain/ethereum/contract/0xabc/nfts/1",
        { event_type: undefined, limit: 5, next: undefined },
      )
    })
  })

  describe("accounts", () => {
    it("get calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ address: "0xabc" })
      await sdk.accounts.get("0xabc")
      expect(mockGet).toHaveBeenCalledWith("/api/v2/accounts/0xabc")
    })
  })

  describe("tokens", () => {
    it("trending calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ tokens: [] })
      await sdk.tokens.trending({ limit: 10, chains: ["ethereum", "base"] })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/tokens/trending", {
        limit: 10,
        chains: "ethereum,base",
        cursor: undefined,
      })
    })

    it("trending maps next option to cursor param", async () => {
      mockGet.mockResolvedValue({ tokens: [] })
      await sdk.tokens.trending({ next: "cursor1" })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/tokens/trending", {
        limit: undefined,
        chains: undefined,
        cursor: "cursor1",
      })
    })

    it("trending with no options", async () => {
      mockGet.mockResolvedValue({ tokens: [] })
      await sdk.tokens.trending()
      expect(mockGet).toHaveBeenCalledWith("/api/v2/tokens/trending", {
        limit: undefined,
        chains: undefined,
        cursor: undefined,
      })
    })

    it("top maps next option to cursor param", async () => {
      mockGet.mockResolvedValue({ tokens: [] })
      await sdk.tokens.top({ limit: 5, next: "cursor2" })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/tokens/top", {
        limit: 5,
        chains: undefined,
        cursor: "cursor2",
      })
    })

    it("top calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ tokens: [] })
      await sdk.tokens.top({ limit: 5 })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/tokens/top", {
        limit: 5,
        chains: undefined,
        cursor: undefined,
      })
    })

    it("get calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ address: "0xabc" })
      await sdk.tokens.get("ethereum", "0xabc")
      expect(mockGet).toHaveBeenCalledWith("/api/v2/chain/ethereum/token/0xabc")
    })
  })

  describe("search", () => {
    it("query calls correct endpoint with all options", async () => {
      const mockResponse = {
        results: [{ type: "collection", collection: { collection: "mfers" } }],
      }
      mockGet.mockResolvedValue(mockResponse)
      const result = await sdk.search.query("mfers", {
        assetTypes: ["collection", "nft"],
        chains: ["ethereum"],
        limit: 5,
      })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/search", {
        query: "mfers",
        asset_types: "collection,nft",
        chains: "ethereum",
        limit: 5,
      })
      expect(result).toEqual(mockResponse)
    })

    it("query calls with no options", async () => {
      mockGet.mockResolvedValue({ results: [] })
      await sdk.search.query("test")
      expect(mockGet).toHaveBeenCalledWith("/api/v2/search", {
        query: "test",
        asset_types: undefined,
        chains: undefined,
        limit: undefined,
      })
    })

    it("query calls with multiple chains", async () => {
      mockGet.mockResolvedValue({ results: [] })
      await sdk.search.query("ape", {
        chains: ["ethereum", "base"],
      })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/search", {
        query: "ape",
        asset_types: undefined,
        chains: "ethereum,base",
        limit: undefined,
      })
    })
  })

  describe("swaps", () => {
    it("quote calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ quote: {}, transactions: [] })
      await sdk.swaps.quote({
        fromChain: "ethereum",
        fromAddress: "0xaaa",
        toChain: "base",
        toAddress: "0xbbb",
        quantity: "1000",
        address: "0xccc",
        slippage: 0.02,
      })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/swap/quote", {
        from_chain: "ethereum",
        from_address: "0xaaa",
        to_chain: "base",
        to_address: "0xbbb",
        quantity: "1000",
        address: "0xccc",
        slippage: 0.02,
        recipient: undefined,
      })
    })
  })
})
