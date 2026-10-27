import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPIError, OpenSeaClient } from "../src/client.js"
import { OpenSeaCLI } from "../src/sdk.js"
import type { Chain } from "../src/types/index.js"

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
      expect(sdk.orders).toBeDefined()
      expect(sdk.events).toBeDefined()
      expect(sdk.accounts).toBeDefined()
      expect(sdk.agent).toBeDefined()
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

    it("traitFloors encodes the slug", async () => {
      const floors = { chain: "ethereum", floors: [] }
      mockGet.mockResolvedValue(floors)
      await expect(sdk.collections.traitFloors("a/b")).resolves.toBe(floors)
      expect(mockGet).toHaveBeenCalledWith("/api/v2/traits/a%2Fb/floors")
    })

    it("pfpProfiles maps next to cursor", async () => {
      const page = { profiles: [], next: null }
      mockGet.mockResolvedValue(page)
      await expect(
        sdk.collections.pfpProfiles("a/b", { limit: 5, next: "page-2" }),
      ).resolves.toBe(page)
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/collections/a%2Fb/pfp-profiles",
        { limit: 5, cursor: "page-2" },
      )
    })

    it("topPfp sends limit, and the chain as chains", async () => {
      const ranked = { collections: [] }
      mockGet.mockResolvedValue(ranked)
      await expect(
        sdk.collections.topPfp({ limit: 10, chain: "base" }),
      ).resolves.toBe(ranked)
      expect(mockGet).toHaveBeenCalledWith("/api/v2/pfp/top-collections", {
        limit: 10,
        chains: "base",
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

    it.each([
      ["intervalMs", { intervalMs: 0 }, "intervalMs must be a positive number"],
      [
        "intervalMs",
        { intervalMs: Number.NaN },
        "intervalMs must be a positive number",
      ],
      [
        "timeoutMs",
        { timeoutMs: -1 },
        "timeoutMs must be a non-negative number",
      ],
    ])("the wait helpers reject a bad %s before polling", async (_, options, message) => {
      await expect(
        sdk.drops.waitForDeployReceipt("base", "0xabc", options),
      ).rejects.toThrow(message)
      await expect(
        sdk.drops.waitForMetadataIpfs("cool-cats", "run-1", options),
      ).rejects.toThrow(message)
      expect(mockGet).not.toHaveBeenCalled()
    })
  })

  describe("drops item media upload batches", () => {
    const context = {
      url: "https://uploads.example.com/",
      method: "POST",
      fields: { key: "k" },
      token: "t",
    }
    const batchId = "5f0c2b1e-7a4d-4e8b-9c3f-2d6a1b0e9f47"

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it("createItemMediaUpload and saveItemMediaBatch call the batch endpoints", async () => {
      mockPost.mockResolvedValueOnce([context])
      mockPost.mockResolvedValueOnce({ success: true })

      await sdk.drops.createItemMediaUpload("my drop", {
        filenames: ["1.png"],
        upload_batch_id: batchId,
      })
      const saved = await sdk.drops.saveItemMediaBatch("my drop", {
        upload_batch_id: batchId,
        filenames: ["1.png"],
      })

      expect(mockPost.mock.calls).toEqual([
        [
          "/api/v2/drops/my%20drop/items/media",
          { filenames: ["1.png"], upload_batch_id: batchId },
        ],
        [
          "/api/v2/drops/my%20drop/items/media/save-batch",
          { upload_batch_id: batchId, filenames: ["1.png"] },
        ],
      ])
      expect(saved).toEqual({ success: true })
    })

    it("uploadItemMedia keeps the caller's order and batch id, and reads lazy data on upload", async () => {
      mockPost.mockImplementation(
        async (path: string, body?: { filenames: string[] }) =>
          path.endsWith("/items/media")
            ? (body?.filenames ?? []).map(() => context)
            : { success: true },
      )
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () => new Response(null, { status: 204 }))
      const lazy = vi.fn(async () => new Blob(["b"]))
      const progress: number[] = []

      const result = await sdk.drops.uploadItemMedia(
        "drop",
        [
          { filename: "b.png", data: lazy },
          { filename: "a.png", data: new Blob(["a"]) },
        ],
        {
          uploadBatchId: batchId,
          concurrency: 1,
          onProgress: p => progress.push(p.uploaded),
        },
      )

      expect(mockPost.mock.calls).toEqual([
        [
          "/api/v2/drops/drop/items/media",
          { filenames: ["b.png", "a.png"], upload_batch_id: batchId },
        ],
        [
          "/api/v2/drops/drop/items/media/save-batch",
          { upload_batch_id: batchId, filenames: ["b.png", "a.png"] },
        ],
      ])
      expect(lazy).toHaveBeenCalledTimes(1)
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(progress).toEqual([1, 2])
      expect(result).toEqual({
        upload_batch_id: batchId,
        item_count: 2,
        success: true,
      })
    })

    it("uploadItemMedia generates a batch id when none is given", async () => {
      mockPost.mockImplementation(async (path: string) =>
        path.endsWith("/items/media") ? [context] : { success: true },
      )
      vi.spyOn(globalThis, "fetch").mockImplementation(
        async () => new Response(null, { status: 204 }),
      )

      const result = await sdk.drops.uploadItemMedia("drop", [
        { filename: "1.png", data: new Blob(["1"]) },
      ])

      expect(result.upload_batch_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
      expect(mockPost.mock.calls[0]?.[1]).toMatchObject({
        upload_batch_id: result.upload_batch_id,
      })
    })

    it.each([
      [[], {}, "No item media files to upload"],
      [
        [
          { filename: "1.png", data: new Blob([]) },
          { filename: "1.png", data: new Blob([]) },
        ],
        {},
        "listed more than once: 1.png",
      ],
      [
        Array.from({ length: 15_001 }, (_, i) => ({
          filename: `${i}.png`,
          data: new Blob([]),
        })),
        {},
        "at most 15000 files, got 15001",
      ],
      [
        [{ filename: "1.png", data: new Blob([]) }],
        { concurrency: 0 },
        "concurrency must be a positive integer",
      ],
    ])("uploadItemMedia rejects bad input before any request (%#)", async (files, options, message) => {
      await expect(
        sdk.drops.uploadItemMedia("drop", files, options),
      ).rejects.toThrow(message)
      expect(mockPost).not.toHaveBeenCalled()
    })

    it("uploadItemMedia names the failed file and never saves", async () => {
      mockPost.mockResolvedValue([context, context])
      vi.spyOn(globalThis, "fetch").mockImplementation(
        async () => new Response("denied", { status: 403 }),
      )

      await expect(
        sdk.drops.uploadItemMedia(
          "drop",
          [
            { filename: "1.png", data: new Blob(["1"]) },
            { filename: "2.png", data: new Blob(["2"]) },
          ],
          { concurrency: 1 },
        ),
      ).rejects.toThrow(
        "Uploading 1.png failed: Storage upload failed with HTTP 403",
      )
      expect(mockPost).toHaveBeenCalledTimes(1)
    })

    it("uploadItemMedia refuses a context count that does not match the chunk", async () => {
      mockPost.mockResolvedValue([context])

      await expect(
        sdk.drops.uploadItemMedia("drop", [
          { filename: "1.png", data: new Blob(["1"]) },
          { filename: "2.png", data: new Blob(["2"]) },
        ]),
      ).rejects.toThrow("Expected 2 upload contexts, got 1")
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

    it("listByAccount sends includeAutoHidden as include_auto_hidden", async () => {
      mockGet.mockResolvedValue({ nfts: [] })
      await sdk.nfts.listByAccount("ethereum", "0xabc", {
        includeAutoHidden: true,
      })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/chain/ethereum/account/0xabc/nfts",
        { limit: undefined, next: undefined, include_auto_hidden: true },
      )
    })

    it("listByGroup sends wire names and repeated filters", async () => {
      mockGet.mockResolvedValue({ nfts: [] })
      await sdk.nfts.listByGroup("trading_cards", {
        grader: ["PSA", "CGC"],
        productType: ["card"],
        collectionSlugs: ["a"],
        isListed: true,
        minEstimatedValueUsd: 5,
        sortBy: "price",
        sortDirection: "asc",
        limit: 10,
      })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/nfts/group/trading_cards",
        expect.objectContaining({
          grader: ["PSA", "CGC"],
          product_type: ["card"],
          collection_slugs: ["a"],
          is_listed: true,
          min_estimated_value_usd: 5,
          sort_by: "price",
          sort_direction: "asc",
          limit: 10,
        }),
      )
    })

    it("groupFacets calls the facets endpoint", async () => {
      mockGet.mockResolvedValue({ facets: [] })
      await sdk.nfts.groupFacets("trading_cards", {
        facetTypes: ["grader"],
        franchise: ["Pokemon"],
      })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/nfts/group/trading_cards/facets",
        expect.objectContaining({
          facet_types: ["grader"],
          franchise: ["Pokemon"],
        }),
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

    it("fulfillmentActions calls the listing action endpoint", async () => {
      mockPost.mockResolvedValue({ steps: [] })
      const request = {
        listing: {
          hash: "solana-listing-id",
          chain: "solana",
          protocol_address: "AuctionHouseBase58Address",
        },
        fulfiller: { address: "BuyerBase58Address" },
        include_optional_creator_fees: false,
      }

      await sdk.listings.fulfillmentActions(request)

      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/listings/fulfillment/actions",
        request,
      )
    })

    it("post sends the signed order unchanged to the encoded listing endpoint", async () => {
      const response = { order_hash: "0xhash" }
      mockPost.mockResolvedValue(response)
      const request = {
        parameters: { offerer: "0xmaker" },
        signature: "0xsig",
        protocol_address: "0xproto",
      } as unknown as Parameters<typeof sdk.listings.post>[2]

      const result = await sdk.listings.post("base/x", "seaport", request)

      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/orders/base%2Fx/seaport/listings",
        request,
      )
      expect(result).toBe(response)
    })

    it("fulfillmentData sends the request unchanged to the fulfillment data endpoint", async () => {
      mockPost.mockResolvedValue({ fulfillment_data: {} })
      const request = {
        listing: {
          hash: "0xlisting",
          chain: "ethereum",
          protocol_address: "0xproto",
        },
        fulfiller: { address: "0xbuyer" },
        include_optional_creator_fees: false,
      }

      await sdk.listings.fulfillmentData(request)

      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/listings/fulfillment_data",
        request,
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

    it("actions calls the offer action endpoint", async () => {
      mockPost.mockResolvedValue({ steps: [] })
      const request = {
        item: {
          chain: "solana",
          contract: "MintBase58Address",
          token_id: "TokenBase58Address",
        },
        address: "MakerBase58Address",
        quantity: 1,
        price: {
          amount: "1.5",
          currency: "So11111111111111111111111111111111111111112",
        },
      }

      await sdk.offers.actions(request)

      expect(mockPost).toHaveBeenCalledWith("/api/v2/offers/actions", request)
    })

    it("fulfillmentActions calls the offer action endpoint", async () => {
      mockPost.mockResolvedValue({ steps: [] })
      const request = {
        offer: {
          hash: "solana-offer-id",
          chain: "solana",
          protocol_address: "AuctionHouseBase58Address",
        },
        fulfiller: { address: "SellerBase58Address" },
        include_optional_creator_fees: false,
      }

      await sdk.offers.fulfillmentActions(request)

      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/offers/fulfillment/actions",
        request,
      )
    })

    it("post sends the signed order unchanged to the encoded offer endpoint", async () => {
      const response = { order_hash: "0xhash" }
      mockPost.mockResolvedValue(response)
      const request = {
        parameters: { offerer: "0xbidder" },
        signature: "0xsig",
        protocol_address: "0xproto",
      } as unknown as Parameters<typeof sdk.offers.post>[2]

      const result = await sdk.offers.post("ethereum", "seaport/x", request)

      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/orders/ethereum/seaport%2Fx/offers",
        request,
      )
      expect(result).toBe(response)
    })

    it("build sends the request unchanged to the build offer endpoint", async () => {
      mockPost.mockResolvedValue({ partialParameters: {} })
      const request = {
        offerer: "0xbidder",
        quantity: 1,
        criteria: { collection: { slug: "cool-cats" } },
        protocol_address: "0xproto",
        offer_protection_enabled: true,
      }

      await sdk.offers.build(request)

      expect(mockPost).toHaveBeenCalledWith("/api/v2/offers/build", request)
    })

    it("postCriteria sends the signed criteria offer unchanged to the offers endpoint", async () => {
      mockPost.mockResolvedValue({ order_hash: "0xcriteria" })
      const request = {
        protocol_data: { parameters: { offerer: "0xbidder" }, signature: "0x" },
        criteria: { collection: { slug: "cool-cats" } },
        protocol_address: "0xproto",
      } as unknown as Parameters<typeof sdk.offers.postCriteria>[0]

      await sdk.offers.postCriteria(request)

      expect(mockPost).toHaveBeenCalledWith("/api/v2/offers", request)
    })

    it("fulfillmentData sends the request unchanged to the fulfillment data endpoint", async () => {
      mockPost.mockResolvedValue({ fulfillment_data: {} })
      const request = {
        offer: {
          hash: "0xoffer",
          chain: "ethereum",
          protocol_address: "0xproto",
        },
        fulfiller: { address: "0xseller" },
        consideration: { asset_contract_address: "0xnft", token_id: "1" },
        include_optional_creator_fees: false,
      }

      await sdk.offers.fulfillmentData(request)

      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/offers/fulfillment_data",
        request,
      )
    })
  })

  describe("orders", () => {
    it("get fetches the order from the encoded order endpoint", async () => {
      const response = { order: { order_hash: "0xhash" } }
      mockGet.mockResolvedValue(response)

      const result = await sdk.orders.get("ethereum", "0xproto", "0xhash/x")

      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/orders/chain/ethereum/protocol/0xproto/0xhash%2Fx",
      )
      expect(result).toBe(response)
    })

    it("get rejects a dot-segment order hash", async () => {
      await expect(sdk.orders.get("ethereum", "0xproto", "..")).rejects.toThrow(
        'Invalid path segment: ".."',
      )
      expect(mockGet).not.toHaveBeenCalled()
    })

    it("cancelActions calls the order cancellation action endpoint", async () => {
      mockPost.mockResolvedValue({ steps: [] })
      const request = { address: "MakerBase58Address" }

      await sdk.orders.cancelActions(
        "solana",
        "AuctionHouseBase58Address",
        "solana-order-id",
        request,
      )

      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/orders/chain/solana/protocol/AuctionHouseBase58Address/solana-order-id/cancel/actions",
        request,
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
      })
    })

    it("list does not send chain, which GET /api/v2/events ignores", async () => {
      mockGet.mockResolvedValue({ asset_events: [] })
      await sdk.events.list({ chain: "base", limit: 10 })
      const params = mockGet.mock.calls[0][1]
      expect(params).toMatchObject({ limit: 10 })
      expect(params).not.toHaveProperty("chain")
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

  describe("agent", () => {
    it("declare puts to the account-level agent endpoint", async () => {
      mockPut.mockResolvedValue({ is_agent: true, changed: true })
      await sdk.agent.declare()
      expect(mockPut).toHaveBeenCalledWith("/api/v2/accounts/agent")
    })

    it("withdraw deletes the declaration", async () => {
      mockDelete.mockResolvedValue({ is_agent: false, changed: true })
      await sdk.agent.withdraw()
      expect(mockDelete).toHaveBeenCalledWith("/api/v2/accounts/agent")
    })

    it("propose sends the counterparty and the caller's own role", async () => {
      mockPost.mockResolvedValue({ relation: {}, created: true })
      await sdk.agent.propose("0xowner", "AGENT")
      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships",
        { counterparty_address: "0xowner", caller_role: "AGENT" },
      )
    })

    it("confirm posts to the confirm sub-path", async () => {
      mockPost.mockResolvedValue({ relation: {}, created: false })
      await sdk.agent.confirm("0xagent", "OWNER")
      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships/confirm",
        { counterparty_address: "0xagent", caller_role: "OWNER" },
      )
    })

    it("revoke sends query params and no body", async () => {
      mockDelete.mockResolvedValue({ removed: true })
      await sdk.agent.revoke("0xowner", "AGENT")
      expect(mockDelete).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships",
        undefined,
        { counterparty_address: "0xowner", caller_role: "AGENT" },
      )
    })

    it("list reads the caller's own relationships", async () => {
      mockGet.mockResolvedValue({ relationships: [] })
      await sdk.agent.list()
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/accounts/agent-relationships",
      )
    })

    it("profile reads the public relationships for an identifier", async () => {
      mockGet.mockResolvedValue({})
      await sdk.agent.profile("alice/example")
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/accounts/alice%2Fexample/agent-relationships",
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

    it("makePrivate calls the wallet private PUT endpoint", async () => {
      mockPut.mockResolvedValue({ address: "0xabc", is_private: true })
      await sdk.accounts.makePrivate("0xabc")
      expect(mockPut).toHaveBeenCalledWith(
        "/api/v2/accounts/wallets/0xabc/private",
      )
    })

    it("makePublic calls the wallet public DELETE endpoint", async () => {
      mockDelete.mockResolvedValue({ address: "0xabc", is_private: false })
      await sdk.accounts.makePublic("0xabc")
      expect(mockDelete).toHaveBeenCalledWith(
        "/api/v2/accounts/wallets/0xabc/private",
      )
    })

    it("agentRelationships calls the agent relationships GET endpoint", async () => {
      mockGet.mockResolvedValue({ public_agent_wallets: [] })
      await sdk.accounts.agentRelationships("vitalik.eth")
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/accounts/vitalik.eth/agent-relationships",
      )
    })
  })

  describe("tokens", () => {
    it("paymentToken encodes the chain and address", async () => {
      const token = { symbol: "USDC", decimals: 6 }
      mockGet.mockResolvedValue(token)
      await expect(sdk.tokens.paymentToken("base", "0xabc/x")).resolves.toBe(
        token,
      )
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/chain/base/payment_token/0xabc%2Fx",
      )
    })

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

  describe("path arguments", () => {
    const chain = "base/1" as Chain
    const request = {} as never

    function requestedPaths(): string[] {
      return [
        ...mockGet.mock.calls.map(call => `GET ${call[0]}`),
        ...mockPost.mock.calls.map(call => `POST ${call[0]}`),
        ...mockPut.mock.calls.map(call => `PUT ${call[0]}`),
        ...mockDelete.mock.calls.map(call => `DELETE ${call[0]}`),
      ]
    }

    beforeEach(() => {
      for (const mock of [mockGet, mockPost, mockPut, mockDelete]) {
        mock.mockResolvedValue({})
      }
    })

    it.each<[string, (sdk: OpenSeaCLI) => Promise<unknown>, string]>([
      [
        "collections.get",
        s => s.collections.get("cats/1"),
        "GET /api/v2/collections/cats%2F1",
      ],
      [
        "collections.stats",
        s => s.collections.stats("cats/1"),
        "GET /api/v2/collections/cats%2F1/stats",
      ],
      [
        "collections.traits",
        s => s.collections.traits("cats/1"),
        "GET /api/v2/traits/cats%2F1",
      ],
      [
        "collections.traitFloors",
        s => s.collections.traitFloors("cats/1"),
        "GET /api/v2/traits/cats%2F1/floors",
      ],
      [
        "collections.pfpProfiles",
        s => s.collections.pfpProfiles("cats/1"),
        "GET /api/v2/collections/cats%2F1/pfp-profiles",
      ],
      [
        "collections.offerAggregates",
        s => s.collections.offerAggregates("cats/1"),
        "GET /api/v2/collections/cats%2F1/offer_aggregates",
      ],
      [
        "collections.holders",
        s => s.collections.holders("cats/1"),
        "GET /api/v2/collections/cats%2F1/holders",
      ],
      [
        "collections.floorPrices",
        s => s.collections.floorPrices("cats/1"),
        "GET /api/v2/collections/cats%2F1/floor_prices",
      ],
      [
        "collections.pageMetadata",
        s => s.collections.pageMetadata("cats/1"),
        "GET /api/v2/collections/cats%2F1/metadata",
      ],
      [
        "collections.createPageMediaUpload",
        s => s.collections.createPageMediaUpload("cats/1", "hero/2", "a/b"),
        "POST /api/v2/collections/cats%2F1/media/hero%2F2?content_type=a%2Fb",
      ],
      [
        "collections.setPricingCurrency",
        s => s.collections.setPricingCurrency("cats/1", true),
        "POST /api/v2/collections/cats%2F1/pricing_currency",
      ],
      [
        "collections.creatorFeeEnforcement",
        s => s.collections.creatorFeeEnforcement("cats/1"),
        "GET /api/v2/collections/cats%2F1/creator_fee_enforcement",
      ],
      [
        "collections.buildCreatorFeeEnforcementTransactions",
        s =>
          s.collections.buildCreatorFeeEnforcementTransactions("cats/1", true),
        "POST /api/v2/collections/cats%2F1/creator_fee_enforcement",
      ],
      [
        "collections.refresh",
        s => s.collections.refresh("cats/1"),
        "POST /api/v2/collections/cats%2F1/refresh",
      ],
      ["drops.get", s => s.drops.get("d/1"), "GET /api/v2/drops/d%2F1"],
      [
        "drops.items",
        s => s.drops.items("d/1"),
        "GET /api/v2/drops/d%2F1/items",
      ],
      [
        "drops.mint",
        s => s.drops.mint("d/1", { minter: "0xm" }),
        "POST /api/v2/drops/d%2F1/mint",
      ],
      [
        "drops.crossChainMint",
        s => s.drops.crossChainMint("d/1", request),
        "POST /api/v2/drops/d%2F1/cross_chain_mint",
      ],
      [
        "drops.deployReceipt",
        s => s.drops.deployReceipt(chain, "0xh/2"),
        "GET /api/v2/drops/deploy/base%2F1/0xh%2F2/receipt",
      ],
      [
        "drops.buildPublishTransaction",
        s => s.drops.buildPublishTransaction("d/1"),
        "POST /api/v2/drops/d%2F1/publish",
      ],
      [
        "drops.buildUnpublishTransaction",
        s => s.drops.buildUnpublishTransaction("d/1"),
        "POST /api/v2/drops/d%2F1/unpublish",
      ],
      [
        "drops.uploadMetadataToIpfs",
        s => s.drops.uploadMetadataToIpfs("d/1"),
        "POST /api/v2/drops/d%2F1/metadata/ipfs",
      ],
      [
        "drops.getMetadataIpfsProgress",
        s => s.drops.getMetadataIpfsProgress("d/1", "wf/2"),
        "GET /api/v2/drops/d%2F1/metadata/ipfs/wf%2F2",
      ],
      [
        "drops.createManifestUpload",
        s => s.drops.createManifestUpload("d/1"),
        "POST /api/v2/drops/d%2F1/items/manifest",
      ],
      [
        "drops.createItemMediaUpload",
        s => s.drops.createItemMediaUpload("d/1", request),
        "POST /api/v2/drops/d%2F1/items/media",
      ],
      [
        "drops.saveItemMediaBatch",
        s => s.drops.saveItemMediaBatch("d/1", request),
        "POST /api/v2/drops/d%2F1/items/media/save-batch",
      ],
      [
        "nfts.get",
        s => s.nfts.get(chain, "0xc/2", "7/3"),
        "GET /api/v2/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3",
      ],
      [
        "nfts.listByCollection",
        s => s.nfts.listByCollection("cats/1"),
        "GET /api/v2/collection/cats%2F1/nfts",
      ],
      [
        "nfts.listByContract",
        s => s.nfts.listByContract(chain, "0xc/2"),
        "GET /api/v2/chain/base%2F1/contract/0xc%2F2/nfts",
      ],
      [
        "nfts.listByAccount",
        s => s.nfts.listByAccount(chain, "0xa/2"),
        "GET /api/v2/chain/base%2F1/account/0xa%2F2/nfts",
      ],
      [
        "nfts.listByGroup",
        s => s.nfts.listByGroup("g/1"),
        "GET /api/v2/nfts/group/g%2F1",
      ],
      [
        "nfts.groupFacets",
        s => s.nfts.groupFacets("g/1"),
        "GET /api/v2/nfts/group/g%2F1/facets",
      ],
      [
        "nfts.refresh",
        s => s.nfts.refresh(chain, "0xc/2", "7/3"),
        "POST /api/v2/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3/refresh",
      ],
      [
        "nfts.getContract",
        s => s.nfts.getContract(chain, "0xc/2"),
        "GET /api/v2/chain/base%2F1/contract/0xc%2F2",
      ],
      [
        "nfts.validateMetadata",
        s => s.nfts.validateMetadata(chain, "0xc/2", "7/3"),
        "POST /api/v2/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3/validate-metadata",
      ],
      [
        "nfts.getCollection",
        s => s.nfts.getCollection(chain, "0xc/2", "7/3"),
        "GET /api/v2/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3/collection",
      ],
      [
        "nfts.getMetadata",
        s => s.nfts.getMetadata(chain, "0xc/2", "7/3"),
        "GET /api/v2/metadata/base%2F1/0xc%2F2/7%2F3",
      ],
      [
        "nfts.owners",
        s => s.nfts.owners(chain, "0xc/2", "7/3"),
        "GET /api/v2/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3/owners",
      ],
      [
        "nfts.analytics",
        s => s.nfts.analytics(chain, "0xc/2", "7/3"),
        "GET /api/v2/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3/analytics",
      ],
      [
        "listings.all",
        s => s.listings.all("cats/1"),
        "GET /api/v2/listings/collection/cats%2F1/all",
      ],
      [
        "listings.best",
        s => s.listings.best("cats/1"),
        "GET /api/v2/listings/collection/cats%2F1/best",
      ],
      [
        "listings.bestForNFT",
        s => s.listings.bestForNFT("cats/1", "7/2"),
        "GET /api/v2/listings/collection/cats%2F1/nfts/7%2F2/best",
      ],
      [
        "listings.post",
        s => s.listings.post("base/1", "seaport/2", request),
        "POST /api/v2/orders/base%2F1/seaport%2F2/listings",
      ],
      [
        "offers.all",
        s => s.offers.all("cats/1"),
        "GET /api/v2/offers/collection/cats%2F1/all",
      ],
      [
        "offers.collection",
        s => s.offers.collection("cats/1"),
        "GET /api/v2/offers/collection/cats%2F1",
      ],
      [
        "offers.byNFT",
        s => s.offers.byNFT("cats/1", "7/2"),
        "GET /api/v2/offers/collection/cats%2F1/nfts/7%2F2",
      ],
      [
        "offers.bestForNFT",
        s => s.offers.bestForNFT("cats/1", "7/2"),
        "GET /api/v2/offers/collection/cats%2F1/nfts/7%2F2/best",
      ],
      [
        "offers.traits",
        s => s.offers.traits("cats/1", { type: "Hat", value: "Cap" }),
        "GET /api/v2/offers/collection/cats%2F1/traits",
      ],
      [
        "offers.post",
        s => s.offers.post("base/1", "seaport/2", request),
        "POST /api/v2/orders/base%2F1/seaport%2F2/offers",
      ],
      [
        "orders.get",
        s => s.orders.get("base/1", "0xp/2", "0xh/3"),
        "GET /api/v2/orders/chain/base%2F1/protocol/0xp%2F2/0xh%2F3",
      ],
      [
        "orders.cancelActions",
        s => s.orders.cancelActions("base/1", "0xp/2", "0xh/3", request),
        "POST /api/v2/orders/chain/base%2F1/protocol/0xp%2F2/0xh%2F3/cancel/actions",
      ],
      [
        "events.byAccount",
        s => s.events.byAccount("0xa/1"),
        "GET /api/v2/events/accounts/0xa%2F1",
      ],
      [
        "events.byCollection",
        s => s.events.byCollection("cats/1"),
        "GET /api/v2/events/collection/cats%2F1",
      ],
      [
        "events.byNFT",
        s => s.events.byNFT(chain, "0xc/2", "7/3"),
        "GET /api/v2/events/chain/base%2F1/contract/0xc%2F2/nfts/7%2F3",
      ],
      [
        "accounts.get",
        s => s.accounts.get("0xa/1"),
        "GET /api/v2/accounts/0xa%2F1",
      ],
      [
        "accounts.makePrivate",
        s => s.accounts.makePrivate("0xa/1"),
        "PUT /api/v2/accounts/wallets/0xa%2F1/private",
      ],
      [
        "accounts.makePublic",
        s => s.accounts.makePublic("0xa/1"),
        "DELETE /api/v2/accounts/wallets/0xa%2F1/private",
      ],
      [
        "accounts.agentRelationships",
        s => s.accounts.agentRelationships("alice/1"),
        "GET /api/v2/accounts/alice%2F1/agent-relationships",
      ],
      [
        "accounts.tokens",
        s => s.accounts.tokens("0xa/1"),
        "GET /api/v2/account/0xa%2F1/tokens",
      ],
      [
        "accounts.resolve",
        s => s.accounts.resolve("alice/1"),
        "GET /api/v2/accounts/resolve/alice%2F1",
      ],
      [
        "accounts.portfolio",
        s => s.accounts.portfolio("0xa/1"),
        "GET /api/v2/account/0xa%2F1/portfolio",
      ],
      [
        "accounts.portfolioHistory",
        s => s.accounts.portfolioHistory("0xa/1"),
        "GET /api/v2/account/0xa%2F1/portfolio/history",
      ],
      [
        "accounts.pnl",
        s => s.accounts.pnl("0xa/1"),
        "GET /api/v2/account/0xa%2F1/pnl",
      ],
      [
        "accounts.closedPositions",
        s => s.accounts.closedPositions("0xa/1"),
        "GET /api/v2/account/0xa%2F1/pnl/closed-positions",
      ],
      [
        "accounts.tokenTransfers",
        s =>
          s.accounts.tokenTransfers("0xa/1", {
            contractAddress: "0xc",
            chain: "base",
          }),
        "GET /api/v2/account/0xa%2F1/pnl/token-transfers",
      ],
      [
        "accounts.profileOffers",
        s => s.accounts.profileOffers("0xa/1"),
        "GET /api/v2/account/0xa%2F1/offers",
      ],
      [
        "accounts.profileOffersReceived",
        s => s.accounts.profileOffersReceived("0xa/1"),
        "GET /api/v2/account/0xa%2F1/offers_received",
      ],
      [
        "accounts.profileListings",
        s => s.accounts.profileListings("0xa/1"),
        "GET /api/v2/account/0xa%2F1/listings",
      ],
      [
        "accounts.profileFavorites",
        s => s.accounts.profileFavorites("0xa/1"),
        "GET /api/v2/account/0xa%2F1/favorites",
      ],
      [
        "accounts.profileCollections",
        s => s.accounts.profileCollections("0xa/1"),
        "GET /api/v2/account/0xa%2F1/collections",
      ],
      [
        "agent.profile",
        s => s.agent.profile("alice/1"),
        "GET /api/v2/accounts/alice%2F1/agent-relationships",
      ],
      [
        "tokens.get",
        s => s.tokens.get(chain, "0xt/2"),
        "GET /api/v2/chain/base%2F1/token/0xt%2F2",
      ],
      [
        "tokens.paymentToken",
        s => s.tokens.paymentToken(chain, "0xt/2"),
        "GET /api/v2/chain/base%2F1/payment_token/0xt%2F2",
      ],
      [
        "tokens.priceHistory",
        s => s.tokens.priceHistory(chain, "0xt/2", { startTime: "2026-01-01" }),
        "GET /api/v2/chain/base%2F1/token/0xt%2F2/price_history",
      ],
      [
        "tokens.ohlcv",
        s =>
          s.tokens.ohlcv(chain, "0xt/2", {
            startTime: "2026-01-01",
            bucketSize: "1h",
          }),
        "GET /api/v2/chain/base%2F1/token/0xt%2F2/ohlcv",
      ],
      [
        "tokens.activity",
        s => s.tokens.activity(chain, "0xt/2"),
        "GET /api/v2/chain/base%2F1/token/0xt%2F2/activity",
      ],
      [
        "tokens.activityStats",
        s => s.tokens.activityStats(chain, "0xt/2"),
        "GET /api/v2/chain/base%2F1/token/0xt%2F2/activity/stats",
      ],
      [
        "tokens.accountActivity",
        s => s.tokens.accountActivity("0xa/1"),
        "GET /api/v2/account/0xa%2F1/token-activity",
      ],
      [
        "tokens.holders",
        s => s.tokens.holders(chain, "0xt/2"),
        "GET /api/v2/chain/base%2F1/token/0xt%2F2/holders",
      ],
      [
        "tokens.liquidityPools",
        s => s.tokens.liquidityPools(chain, "0xt/2"),
        "GET /api/v2/chain/base%2F1/token/0xt%2F2/liquidity-pools",
      ],
      [
        "tools.get",
        s => s.tools.get("base/1", "0xr/2", "t/3"),
        "GET /api/v2/tools/base%2F1/0xr%2F2/t%2F3",
      ],
      [
        "tools.activity",
        s => s.tools.activity("base/1", "0xr/2", "t/3"),
        "GET /api/v2/tools/base%2F1/0xr%2F2/t%2F3/activity",
      ],
    ])("%s encodes every path argument", async (_name, call, path) => {
      await call(sdk)
      expect(requestedPaths()).toEqual([path])
    })

    it.each<[string, (sdk: OpenSeaCLI) => Promise<unknown>]>([
      ["collections.get .", s => s.collections.get(".")],
      ["nfts.get ..", s => s.nfts.get(chain, "0xc", "..")],
      ["accounts.makePrivate ..", s => s.accounts.makePrivate("..")],
      ["tokens.get .", s => s.tokens.get(chain, ".")],
      ["tools.get ..", s => s.tools.get("base", "..", "1")],
    ])("%s is rejected before any request", async (_name, call) => {
      await expect(call(sdk)).rejects.toThrow("Invalid path segment")
      expect(requestedPaths()).toEqual([])
    })
  })
})
