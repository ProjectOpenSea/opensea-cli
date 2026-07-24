import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPIError, OpenSeaClient } from "../src/client.js"
import { OpenSeaCLI } from "../src/sdk.js"

vi.mock("../src/client.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/client.js")>()
  const MockOpenSeaClient = vi.fn()
  MockOpenSeaClient.prototype.get = vi.fn()
  MockOpenSeaClient.prototype.post = vi.fn()
  MockOpenSeaClient.prototype.put = vi.fn()
  MockOpenSeaClient.prototype.delete = vi.fn()
  MockOpenSeaClient.prototype.getDefaultChain = vi.fn(() => "ethereum")
  MockOpenSeaClient.prototype.getApiKeyPrefix = vi.fn(() => "test...")
  return {
    OpenSeaClient: MockOpenSeaClient,
    OpenSeaAPIError: actual.OpenSeaAPIError,
  }
})

describe("OpenSeaCLI", () => {
  let sdk: OpenSeaCLI
  let mockGet: ReturnType<typeof vi.fn>
  let mockPost: ReturnType<typeof vi.fn>
  let mockPut: ReturnType<typeof vi.fn>
  let mockDelete: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sdk = new OpenSeaCLI({ apiKey: "test-key" })
    mockGet = vi.mocked(OpenSeaClient.prototype.get)
    mockPost = vi.mocked(OpenSeaClient.prototype.post)
    mockPut = vi.mocked(OpenSeaClient.prototype.put)
    mockDelete = vi.mocked(OpenSeaClient.prototype.delete)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("creates all API namespaces", () => {
      expect(sdk.collections).toBeDefined()
      expect(sdk.drops).toBeDefined()
      expect(sdk.nfts).toBeDefined()
      expect(sdk.listings).toBeDefined()
      expect(sdk.offers).toBeDefined()
      expect(sdk.events).toBeDefined()
      expect(sdk.accounts).toBeDefined()
      expect(sdk.tokens).toBeDefined()
      expect(sdk.search).toBeDefined()
      expect(sdk.swaps).toBeDefined()
      expect(sdk.health).toBeDefined()
      expect(sdk.tools).toBeDefined()
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

    it("trending calls correct endpoint with options", async () => {
      mockGet.mockResolvedValue({ collections: [] })
      await sdk.collections.trending({
        timeframe: "seven_days",
        chains: ["ethereum", "base"],
        category: "pfps",
        limit: 10,
      })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/collections/trending", {
        timeframe: "seven_days",
        chains: "ethereum,base",
        category: "pfps",
        limit: 10,
        cursor: undefined,
      })
    })

    it("top calls correct endpoint with options", async () => {
      mockGet.mockResolvedValue({ collections: [] })
      await sdk.collections.top({
        sortBy: "one_day_volume",
        chains: ["ethereum"],
        limit: 50,
      })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/collections/top", {
        sort_by: "one_day_volume",
        chains: "ethereum",
        category: undefined,
        limit: 50,
        cursor: undefined,
      })
    })
  })

  describe("drops", () => {
    it("list calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ drops: [] })
      await sdk.drops.list({ type: "upcoming", limit: 10 })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/drops", {
        type: "upcoming",
        chains: undefined,
        limit: 10,
        cursor: undefined,
      })
    })

    it("get calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ collection_slug: "cool-cats" })
      await sdk.drops.get("cool-cats")
      expect(mockGet).toHaveBeenCalledWith("/api/v2/drops/cool-cats")
    })

    it("mint calls correct endpoint", async () => {
      mockPost.mockResolvedValue({
        to: "0x123",
        data: "0x",
        value: "0x0",
        chain: "ethereum",
      })
      await sdk.drops.mint("cool-cats", { minter: "0xabc", quantity: 2 })
      expect(mockPost).toHaveBeenCalledWith("/api/v2/drops/cool-cats/mint", {
        minter: "0xabc",
        quantity: 2,
      })
    })

    it("crossChainMint calls correct endpoint", async () => {
      mockPost.mockResolvedValue({ transactions: [], receipt_request: {} })
      const request = {
        payer: "0xpayer",
        minter: "0xminter",
        quantity: 1,
        payment: {
          chain: "base",
          token_address: "0x0000000000000000000000000000000000000000",
        },
      }

      await sdk.drops.crossChainMint("pyro-on-ape", request)

      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/drops/pyro-on-ape/cross_chain_mint",
        request,
      )
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

    it("getCollection calls correct endpoint", async () => {
      mockGet.mockResolvedValue({
        name: "Art Blocks",
        collection: "art-blocks",
      })
      const result = await sdk.nfts.getCollection("ethereum", "0xabc", "42")
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/chain/ethereum/contract/0xabc/nfts/42/collection",
      )
      expect(result.name).toBe("Art Blocks")
    })

    it("getMetadata calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ name: "Cool NFT", traits: [] })
      const result = await sdk.nfts.getMetadata("ethereum", "0xabc", "1")
      expect(mockGet).toHaveBeenCalledWith("/api/v2/metadata/ethereum/0xabc/1")
      expect(result.name).toBe("Cool NFT")
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

    it("resolve calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ address: "0xabc", ens_name: "vitalik.eth" })
      await sdk.accounts.resolve("vitalik.eth")
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/accounts/resolve/vitalik.eth",
      )
    })

    it("markAgent calls the wallet agent PUT endpoint", async () => {
      mockPut.mockResolvedValue({ address: "0xabc", is_agent: true })
      await sdk.accounts.markAgent("agent/wallet")
      expect(mockPut).toHaveBeenCalledWith(
        "/api/v2/accounts/wallets/agent%2Fwallet/agent",
      )
    })

    it("removeAgent calls the wallet agent DELETE endpoint", async () => {
      mockDelete.mockResolvedValue({ address: "0xabc", is_agent: false })
      await sdk.accounts.removeAgent("agent/wallet")
      expect(mockDelete).toHaveBeenCalledWith(
        "/api/v2/accounts/wallets/agent%2Fwallet/agent",
      )
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

    it("activityStats calls correct endpoint with selected windows", async () => {
      mockGet.mockResolvedValue({ windows: {} })
      await sdk.tokens.activityStats("base", "0xabc", {
        windows: ["1h", "24h"],
      })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/chain/base/token/0xabc/activity/stats",
        { windows: "1h,24h" },
      )
    })

    it("holders calls correct endpoint with pagination + sort", async () => {
      mockGet.mockResolvedValue({ holders: [] })
      await sdk.tokens.holders("ethereum", "0xabc", {
        limit: 50,
        next: "page-2",
        sortBy: "QUANTITY",
        sortDirection: "desc",
      })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/chain/ethereum/token/0xabc/holders",
        {
          limit: 50,
          cursor: "page-2",
          sort_by: "QUANTITY",
          sort_direction: "desc",
        },
      )
    })

    it("liquidityPools calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ pools: [] })
      await sdk.tokens.liquidityPools("ethereum", "0xabc", { limit: 30 })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/chain/ethereum/token/0xabc/liquidity-pools",
        { limit: 30 },
      )
    })

    it("accountActivity calls correct endpoint with filters", async () => {
      mockGet.mockResolvedValue({ activities: [] })
      await sdk.tokens.accountActivity("0xdef", {
        chains: ["ethereum", "base"],
        tokens: ["0xaaa", "0xbbb"],
        type: ["swap", "wrap"],
        limit: 25,
        next: "page-1",
      })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/account/0xdef/token-activity",
        {
          chains: "ethereum,base",
          tokens: "0xaaa,0xbbb",
          type: "swap,wrap",
          limit: 25,
          next: "page-1",
        },
      )
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

  describe("tools", () => {
    it("search calls correct endpoint with all options", async () => {
      const mockResponse = { results: [], next: null }
      mockGet.mockResolvedValue(mockResponse)
      const result = await sdk.tools.search({
        query: "nft appraiser",
        registryChain: "8453",
        tags: ["nft", "defi"],
        accessType: "open",
        creator: "0x1234",
        sortBy: "newest",
        limit: 10,
        next: "cursor1",
      })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/tools/search", {
        query: "nft appraiser",
        registry_chain: "8453",
        tags: "nft,defi",
        access_type: "open",
        creator: "0x1234",
        sort_by: "newest",
        limit: 10,
        cursor: "cursor1",
      })
      expect(result).toEqual(mockResponse)
    })

    it("search calls with no options", async () => {
      mockGet.mockResolvedValue({ results: [] })
      await sdk.tools.search()
      expect(mockGet).toHaveBeenCalledWith("/api/v2/tools/search", {
        query: undefined,
        registry_chain: undefined,
        tags: undefined,
        access_type: undefined,
        creator: undefined,
        sort_by: undefined,
        limit: undefined,
        cursor: undefined,
      })
    })

    it("get calls correct endpoint", async () => {
      mockGet.mockResolvedValue({ tool_id: "42" })
      const result = await sdk.tools.get("8453", "0xabc", "42")
      expect(mockGet).toHaveBeenCalledWith("/api/v2/tools/8453/0xabc/42")
      expect(result).toEqual({ tool_id: "42" })
    })

    it("list calls correct endpoint with options", async () => {
      mockGet.mockResolvedValue({ tools: [], next: null })
      await sdk.tools.list({
        sortBy: "oldest",
        type: "nft_gated",
        limit: 50,
        next: "page2",
      })
      expect(mockGet).toHaveBeenCalledWith("/api/v2/tools", {
        sort_by: "oldest",
        type: "nft_gated",
        limit: 50,
        cursor: "page2",
      })
    })

    it("list calls with no options", async () => {
      mockGet.mockResolvedValue({ tools: [] })
      await sdk.tools.list()
      expect(mockGet).toHaveBeenCalledWith("/api/v2/tools", {
        sort_by: undefined,
        type: undefined,
        limit: undefined,
        cursor: undefined,
      })
    })

    it("activity calls correct endpoint with options", async () => {
      mockGet.mockResolvedValue({ activity: [] })
      await sdk.tools.activity("8453", "0xabc", "42", {
        includeCreatorPayments: true,
        limit: 50,
        offset: 10,
      })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/tools/8453/0xabc/42/activity",
        {
          include_creator_payments: true,
          limit: 50,
          offset: 10,
        },
      )
    })
  })

  describe("health", () => {
    it("check returns ok with auth when both calls succeed", async () => {
      mockGet.mockResolvedValue({})
      const result = await sdk.health.check()
      expect(mockGet).toHaveBeenCalledWith("/api/v2/collections", {
        limit: 1,
      })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/listings/collection/boredapeyachtclub/all",
        {
          limit: 1,
        },
      )
      expect(result.status).toBe("ok")
      expect(result.authenticated).toBe(true)
      expect(result.key_prefix).toBe("test...")
      expect(result.message).toBe("Connectivity and authentication are working")
    })

    it("check returns error when connectivity fails", async () => {
      mockGet.mockRejectedValue(
        new OpenSeaAPIError(
          500,
          "Internal Server Error",
          "/api/v2/collections",
        ),
      )
      const result = await sdk.health.check()
      expect(result.status).toBe("error")
      expect(result.authenticated).toBe(false)
      expect(result.key_prefix).toBe("test...")
      expect(result.message).toContain("API error (500)")
    })

    it("check returns error on authentication failure (401)", async () => {
      mockGet
        .mockResolvedValueOnce({}) // connectivity ok
        .mockRejectedValueOnce(
          new OpenSeaAPIError(401, "Unauthorized", "/api/v2/events"),
        )
      const result = await sdk.health.check()
      expect(result.status).toBe("error")
      expect(result.authenticated).toBe(false)
      expect(result.key_prefix).toBe("test...")
      expect(result.message).toContain("Authentication failed (401)")
    })

    it("check returns error on authentication failure (403)", async () => {
      mockGet
        .mockResolvedValueOnce({}) // connectivity ok
        .mockRejectedValueOnce(
          new OpenSeaAPIError(403, "Forbidden", "/api/v2/events"),
        )
      const result = await sdk.health.check()
      expect(result.status).toBe("error")
      expect(result.authenticated).toBe(false)
      expect(result.message).toContain("Authentication failed (403)")
    })

    it("check returns ok with unverified auth on non-auth events error", async () => {
      mockGet
        .mockResolvedValueOnce({}) // connectivity ok
        .mockRejectedValueOnce(
          new OpenSeaAPIError(500, "Server Error", "/api/v2/events"),
        )
      const result = await sdk.health.check()
      expect(result.status).toBe("ok")
      expect(result.authenticated).toBe(false)
      expect(result.message).toContain("could not be verified")
    })

    it("check returns error with rate_limited on 429", async () => {
      mockGet.mockRejectedValue(
        new OpenSeaAPIError(429, "Too Many Requests", "/api/v2/collections"),
      )
      const result = await sdk.health.check()
      expect(result.status).toBe("error")
      expect(result.rate_limited).toBe(true)
      expect(result.message).toContain("Rate limited")
    })

    it("check returns error when network fails", async () => {
      mockGet.mockRejectedValue(new Error("fetch failed"))
      const result = await sdk.health.check()
      expect(result.status).toBe("error")
      expect(result.key_prefix).toBe("test...")
      expect(result.message).toContain("Network error: fetch failed")
    })
  })

  describe("listings.crossChainFulfillmentData", () => {
    it("posts to correct endpoint with snake_case body", async () => {
      mockPost.mockResolvedValue({
        transactions: [
          { chain: "ethereum", to: "0xabc", data: "0x123", value: "0" },
        ],
      })
      const result = await sdk.listings.crossChainFulfillmentData({
        listings: [
          {
            hash: "0xorderhash",
            chain: "ethereum",
            protocolAddress: "0xseaport",
          },
        ],
        fulfillerAddress: "0xbuyer",
        paymentChain: "base",
        paymentTokenAddress: "0x0000000000000000000000000000000000000000",
      })
      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/listings/cross_chain_fulfillment_data",
        {
          listings: [
            {
              hash: "0xorderhash",
              chain: "ethereum",
              protocol_address: "0xseaport",
            },
          ],
          fulfiller: { address: "0xbuyer" },
          payment: {
            chain: "base",
            token_address: "0x0000000000000000000000000000000000000000",
          },
        },
      )
      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0].chain).toBe("ethereum")
    })

    it("includes recipient when provided", async () => {
      mockPost.mockResolvedValue({ transactions: [] })
      await sdk.listings.crossChainFulfillmentData({
        listings: [
          {
            hash: "0xhash",
            chain: "ethereum",
            protocolAddress: "0xseaport",
          },
        ],
        fulfillerAddress: "0xbuyer",
        paymentChain: "base",
        paymentTokenAddress: "0x0000000000000000000000000000000000000000",
        recipient: "0xrecipient",
      })
      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/listings/cross_chain_fulfillment_data",
        expect.objectContaining({
          recipient: "0xrecipient",
        }),
      )
    })
  })
})
