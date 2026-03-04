import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const isLive = process.env.LIVE_TEST === "true"
const API_KEY = process.env.OPENSEA_API_KEY ?? ""
const BASE_URL = process.env.OPENSEA_BASE_URL ?? "https://api.opensea.io"

// Well-known test fixtures
const TEST_COLLECTION_SLUG = "azuki"
const TEST_CHAIN = "ethereum"
const TEST_CONTRACT = "0xed5af388653567af2f388e6224dc7c4b3241c544" // Azuki
const TEST_TOKEN_ID = "1"
const TEST_ACCOUNT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" // vitalik.eth
const TEST_ERC20_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" // WETH
const TEST_USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"

// ---------------------------------------------------------------------------
// Report types & collector
// ---------------------------------------------------------------------------

interface EndpointResult {
  endpoint: string
  method: string
  path: string
  status: "pass" | "fail" | "skip"
  statusCode?: number
  latencyMs?: number
  responseSize?: number
  rateLimitRemaining?: string
  cacheControl?: string
  schemaViolations?: string[]
  error?: string
}

const results: EndpointResult[] = []

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

// ---------------------------------------------------------------------------
// Shared HTTP helpers
// ---------------------------------------------------------------------------

interface ApiResponse<T = unknown> {
  data: T
  status: number
  headers: Headers
  latencyMs: number
  responseSize: number
}

async function apiGet<T = unknown>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<ApiResponse<T>> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  const start = performance.now()
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json", "x-api-key": API_KEY },
    signal: AbortSignal.timeout(30_000),
  })
  const latencyMs = Math.round(performance.now() - start)
  const text = await res.text()
  const responseSize = new TextEncoder().encode(text).length
  const data = text ? (JSON.parse(text) as T) : ({} as T)
  return {
    data,
    status: res.status,
    headers: res.headers,
    latencyMs,
    responseSize,
  }
}

async function apiPost<T = unknown>(
  path: string,
  body?: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  const url = new URL(`${BASE_URL}${path}`)
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-api-key": API_KEY,
  }
  if (body) headers["Content-Type"] = "application/json"
  const start = performance.now()
  const res = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const latencyMs = Math.round(performance.now() - start)
  const text = await res.text()
  const responseSize = new TextEncoder().encode(text).length
  const data = text ? (JSON.parse(text) as T) : ({} as T)
  return {
    data,
    status: res.status,
    headers: res.headers,
    latencyMs,
    responseSize,
  }
}

function record(
  endpoint: string,
  method: string,
  path: string,
  res: ApiResponse,
  schemaViolations?: string[],
): void {
  results.push({
    endpoint,
    method,
    path,
    status: schemaViolations && schemaViolations.length > 0 ? "fail" : "pass",
    statusCode: res.status,
    latencyMs: res.latencyMs,
    responseSize: res.responseSize,
    rateLimitRemaining:
      res.headers.get("x-ratelimit-remaining") ??
      res.headers.get("ratelimit-remaining") ??
      undefined,
    cacheControl: res.headers.get("cache-control") ?? undefined,
    schemaViolations:
      schemaViolations && schemaViolations.length > 0
        ? schemaViolations
        : undefined,
  })
}

function recordError(
  endpoint: string,
  method: string,
  path: string,
  error: unknown,
): void {
  results.push({
    endpoint,
    method,
    path,
    status: "fail",
    error: error instanceof Error ? error.message : String(error),
  })
}

function _recordSkip(
  endpoint: string,
  method: string,
  path: string,
  reason: string,
): void {
  results.push({
    endpoint,
    method,
    path,
    status: "skip",
    error: reason,
  })
}

function validateSchema<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { success: boolean; violations: string[] } {
  const result = schema.safeParse(data)
  if (result.success) return { success: true, violations: [] }
  const violations = result.error.issues.map(
    i => `${i.path.join(".")}: ${i.message}`,
  )
  return { success: false, violations }
}

// ---------------------------------------------------------------------------
// Zod schemas derived from src/types/api.ts
// ---------------------------------------------------------------------------

const FeeSchema = z.object({
  fee: z.number(),
  recipient: z.string(),
  required: z.boolean(),
})

const PaymentTokenSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  address: z.string(),
  chain: z.string(),
  image_url: z.string().nullable().optional(),
  eth_price: z.string().nullable().optional(),
  usd_price: z.string().nullable().optional(),
})

const CollectionSchema = z.object({
  name: z.string(),
  collection: z.string(),
  description: z.string().nullable(),
  image_url: z.string().nullable(),
  banner_image_url: z.string().nullable(),
  owner: z.string().nullable(),
  safelist_status: z.string(),
  category: z.string().nullable(),
  is_disabled: z.boolean(),
  is_nsfw: z.boolean(),
  trait_offers_enabled: z.boolean(),
  collection_offers_enabled: z.boolean(),
  opensea_url: z.string(),
  project_url: z.string().nullable().optional(),
  wiki_url: z.string().nullable().optional(),
  discord_url: z.string().nullable().optional(),
  telegram_url: z.string().nullable().optional(),
  twitter_username: z.string().nullable().optional(),
  instagram_username: z.string().nullable().optional(),
  contracts: z.array(z.object({ address: z.string(), chain: z.string() })),
  editors: z.array(z.string()).optional(),
  fees: z.array(FeeSchema).optional(),
  rarity: z
    .object({
      strategy_id: z.string().nullable(),
      strategy_version: z.string().nullable(),
      calculated_at: z.string(),
      max_rank: z.number().nullable(),
      tokens_scored: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  payment_tokens: z.array(PaymentTokenSchema).optional(),
  total_supply: z.number().optional(),
  created_date: z.string().optional(),
  required_zone: z.string().nullable().optional(),
})

const CollectionStatsIntervalSchema = z.object({
  interval: z.string(),
  volume: z.number(),
  volume_diff: z.number(),
  volume_change: z.number(),
  sales: z.number(),
  sales_diff: z.number(),
  average_price: z.number(),
})

const CollectionStatsSchema = z.object({
  total: z.object({
    volume: z.number(),
    sales: z.number(),
    average_price: z.number(),
    num_owners: z.number(),
    market_cap: z.number(),
    floor_price: z.number(),
    floor_price_symbol: z.string(),
  }),
  intervals: z.array(CollectionStatsIntervalSchema),
})

const TraitSchema = z.object({
  trait_type: z.string(),
  display_type: z.string().nullable(),
  max_value: z.string().nullable(),
  value: z.union([z.string(), z.number()]),
})

const NFTSchema = z.object({
  identifier: z.string(),
  collection: z.string(),
  contract: z.string(),
  token_standard: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  image_url: z.string().nullable(),
  metadata_url: z.string().nullable(),
  opensea_url: z.string(),
  updated_at: z.string(),
  is_disabled: z.boolean(),
  is_nsfw: z.boolean(),
  traits: z.array(TraitSchema).nullable(),
})

const PriceSchema = z.object({
  currency: z.string(),
  decimals: z.number(),
  value: z.string(),
})

const ListingSchema = z.object({
  order_hash: z.string(),
  chain: z.string(),
  protocol_data: z.record(z.unknown()),
  protocol_address: z.string(),
  type: z.string(),
  price: z.object({ current: PriceSchema }),
})

const OfferSchema = z.object({
  order_hash: z.string(),
  chain: z.string(),
  protocol_data: z.record(z.unknown()),
  protocol_address: z.string(),
  price: PriceSchema,
})

const AssetEventSchema = z.object({
  event_type: z.string(),
  chain: z.string(),
})

const AccountSchema = z.object({
  address: z.string(),
  username: z.string().nullable(),
  profile_image_url: z.string().nullable(),
  banner_image_url: z.string().nullable(),
  website: z.string().nullable(),
  social_media_accounts: z.array(
    z.object({ platform: z.string(), username: z.string() }),
  ),
  bio: z.string().nullable(),
  joined_date: z.string(),
})

const TokenSchema = z.object({
  address: z.string(),
  chain: z.string(),
  name: z.string(),
  symbol: z.string(),
  image_url: z.string().nullable().optional(),
  usd_price: z.string(),
  decimals: z.number(),
  opensea_url: z.string(),
})

const TokenDetailsSchema = z.object({
  address: z.string(),
  chain: z.string(),
  name: z.string(),
  symbol: z.string(),
  usd_price: z.string(),
  decimals: z.number(),
  opensea_url: z.string(),
})

const ContractSchema = z.object({
  address: z.string(),
  chain: z.string(),
  collection: z.string().nullable(),
  name: z.string().nullable(),
  contract_standard: z.string(),
})

const SearchResultSchema = z.object({
  type: z.string(),
})

const GetTraitsResponseSchema = z.object({
  categories: z.record(z.string()),
  counts: z.record(z.record(z.number())),
})

// ---------------------------------------------------------------------------
// Test suite — gated by LIVE_TEST=true
// ---------------------------------------------------------------------------

const describeIfLive = isLive ? describe : describe.skip

describeIfLive(
  "REST API v2 End-to-End Tests",
  () => {
    beforeAll(() => {
      if (!API_KEY) {
        throw new Error(
          "OPENSEA_API_KEY environment variable is required for live tests",
        )
      }
    })

    // -----------------------------------------------------------------------
    // Collections
    // -----------------------------------------------------------------------
    describe("Collections", () => {
      it("GET /api/v2/collections/{slug} — returns valid collection", async () => {
        const path = `/api/v2/collections/${TEST_COLLECTION_SLUG}`
        try {
          const res = await apiGet(path)
          expect(res.status).toBe(200)
          const v = validateSchema(CollectionSchema, res.data)
          record("collections.get", "GET", path, res, v.violations)
          expect(v.success).toBe(true)
        } catch (e) {
          recordError("collections.get", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/collections — returns paginated list", async () => {
        const path = "/api/v2/collections"
        try {
          const res = await apiGet<{ collections: unknown[]; next?: string }>(
            path,
            { limit: 3 },
          )
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.collections)).toBe(true)
          expect(res.data.collections.length).toBeGreaterThan(0)
          expect(res.data.collections.length).toBeLessThanOrEqual(3)
          // Validate first item schema
          const v = validateSchema(CollectionSchema, res.data.collections[0])
          record("collections.list", "GET", path, res, v.violations)
          expect(v.success).toBe(true)
        } catch (e) {
          recordError("collections.list", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/collections — pagination cursor works", async () => {
        const path = "/api/v2/collections"
        try {
          const page1 = await apiGet<{ collections: unknown[]; next?: string }>(
            path,
            { limit: 2 },
          )
          expect(page1.status).toBe(200)
          if (page1.data.next) {
            const page2 = await apiGet<{
              collections: unknown[]
              next?: string
            }>(path, { limit: 2, next: page1.data.next })
            expect(page2.status).toBe(200)
            expect(Array.isArray(page2.data.collections)).toBe(true)
            record("collections.list.pagination", "GET", path, page2)
          } else {
            record("collections.list.pagination", "GET", path, page1)
          }
        } catch (e) {
          recordError("collections.list.pagination", "GET", path, e)
          throw e
        }
      }, 30_000)

      it("GET /api/v2/collections/{slug}/stats — returns valid stats", async () => {
        const path = `/api/v2/collections/${TEST_COLLECTION_SLUG}/stats`
        try {
          const res = await apiGet(path)
          expect(res.status).toBe(200)
          const v = validateSchema(CollectionStatsSchema, res.data)
          record("collections.stats", "GET", path, res, v.violations)
          expect(v.success).toBe(true)
        } catch (e) {
          recordError("collections.stats", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/traits/{slug} — returns valid traits", async () => {
        const path = `/api/v2/traits/${TEST_COLLECTION_SLUG}`
        try {
          const res = await apiGet(path)
          expect(res.status).toBe(200)
          const v = validateSchema(GetTraitsResponseSchema, res.data)
          record("collections.traits", "GET", path, res, v.violations)
          expect(v.success).toBe(true)
        } catch (e) {
          recordError("collections.traits", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/collections/{slug} — invalid slug returns 404", async () => {
        const path = "/api/v2/collections/this-collection-does-not-exist-12345"
        try {
          const res = await apiGet(path)
          expect(res.status).toBe(404)
          record("collections.get.error_404", "GET", path, res)
        } catch (e) {
          recordError("collections.get.error_404", "GET", path, e)
          throw e
        }
      }, 15_000)
    })

    // -----------------------------------------------------------------------
    // NFTs
    // -----------------------------------------------------------------------
    describe("NFTs", () => {
      it("GET /api/v2/chain/{chain}/contract/{address}/nfts/{id} — returns single NFT", async () => {
        const path = `/api/v2/chain/${TEST_CHAIN}/contract/${TEST_CONTRACT}/nfts/${TEST_TOKEN_ID}`
        try {
          const res = await apiGet<{ nft: unknown }>(path)
          expect(res.status).toBe(200)
          expect(res.data.nft).toBeDefined()
          const v = validateSchema(NFTSchema, res.data.nft)
          record("nfts.get", "GET", path, res, v.violations)
          expect(v.success).toBe(true)
        } catch (e) {
          recordError("nfts.get", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/collection/{slug}/nfts — returns NFTs by collection", async () => {
        const path = `/api/v2/collection/${TEST_COLLECTION_SLUG}/nfts`
        try {
          const res = await apiGet<{ nfts: unknown[]; next?: string }>(path, {
            limit: 3,
          })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.nfts)).toBe(true)
          expect(res.data.nfts.length).toBeGreaterThan(0)
          const v = validateSchema(NFTSchema, res.data.nfts[0])
          record("nfts.listByCollection", "GET", path, res, v.violations)
          expect(v.success).toBe(true)
        } catch (e) {
          recordError("nfts.listByCollection", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/collection/{slug}/nfts — pagination cursor works", async () => {
        const path = `/api/v2/collection/${TEST_COLLECTION_SLUG}/nfts`
        try {
          const page1 = await apiGet<{ nfts: unknown[]; next?: string }>(path, {
            limit: 2,
          })
          expect(page1.status).toBe(200)
          if (page1.data.next) {
            const page2 = await apiGet<{ nfts: unknown[]; next?: string }>(
              path,
              { limit: 2, next: page1.data.next },
            )
            expect(page2.status).toBe(200)
            expect(Array.isArray(page2.data.nfts)).toBe(true)
            record("nfts.listByCollection.pagination", "GET", path, page2)
          } else {
            record("nfts.listByCollection.pagination", "GET", path, page1)
          }
        } catch (e) {
          recordError("nfts.listByCollection.pagination", "GET", path, e)
          throw e
        }
      }, 30_000)

      it("GET /api/v2/chain/{chain}/contract/{address}/nfts — returns NFTs by contract", async () => {
        const path = `/api/v2/chain/${TEST_CHAIN}/contract/${TEST_CONTRACT}/nfts`
        try {
          const res = await apiGet<{ nfts: unknown[]; next?: string }>(path, {
            limit: 3,
          })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.nfts)).toBe(true)
          const v = validateSchema(NFTSchema, res.data.nfts[0])
          record("nfts.listByContract", "GET", path, res, v.violations)
          expect(v.success).toBe(true)
        } catch (e) {
          recordError("nfts.listByContract", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/chain/{chain}/account/{address}/nfts — returns NFTs by account", async () => {
        const path = `/api/v2/chain/${TEST_CHAIN}/account/${TEST_ACCOUNT}/nfts`
        try {
          const res = await apiGet<{ nfts: unknown[]; next?: string }>(path, {
            limit: 3,
          })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.nfts)).toBe(true)
          record("nfts.listByAccount", "GET", path, res)
        } catch (e) {
          recordError("nfts.listByAccount", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/chain/{chain}/contract/{address} — returns contract info", async () => {
        const path = `/api/v2/chain/${TEST_CHAIN}/contract/${TEST_CONTRACT}`
        try {
          const res = await apiGet(path)
          expect(res.status).toBe(200)
          const v = validateSchema(ContractSchema, res.data)
          record("nfts.getContract", "GET", path, res, v.violations)
          expect(v.success).toBe(true)
        } catch (e) {
          recordError("nfts.getContract", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("POST /api/v2/chain/{chain}/contract/{address}/nfts/{id}/refresh — triggers metadata refresh", async () => {
        const path = `/api/v2/chain/${TEST_CHAIN}/contract/${TEST_CONTRACT}/nfts/${TEST_TOKEN_ID}/refresh`
        try {
          const res = await apiPost(path)
          // Refresh typically returns 200 or 202
          expect([200, 202]).toContain(res.status)
          record("nfts.refresh", "POST", path, res)
        } catch (e) {
          recordError("nfts.refresh", "POST", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/chain/{chain}/contract/{address}/nfts/{id} — invalid token returns error", async () => {
        const path = `/api/v2/chain/${TEST_CHAIN}/contract/${TEST_CONTRACT}/nfts/99999999999`
        try {
          const res = await apiGet(path)
          // Could be 404 or 400 depending on implementation
          expect(res.status).toBeGreaterThanOrEqual(400)
          record("nfts.get.error", "GET", path, res)
        } catch (e) {
          recordError("nfts.get.error", "GET", path, e)
          throw e
        }
      }, 15_000)
    })

    // -----------------------------------------------------------------------
    // Listings
    // -----------------------------------------------------------------------
    describe("Listings", () => {
      it("GET /api/v2/listings/collection/{slug}/all — returns all listings", async () => {
        const path = `/api/v2/listings/collection/${TEST_COLLECTION_SLUG}/all`
        try {
          const res = await apiGet<{ listings: unknown[]; next?: string }>(
            path,
            { limit: 3 },
          )
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.listings)).toBe(true)
          if (res.data.listings.length > 0) {
            const v = validateSchema(ListingSchema, res.data.listings[0])
            record("listings.all", "GET", path, res, v.violations)
            expect(v.success).toBe(true)
          } else {
            record("listings.all", "GET", path, res)
          }
        } catch (e) {
          recordError("listings.all", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/listings/collection/{slug}/best — returns best listings", async () => {
        const path = `/api/v2/listings/collection/${TEST_COLLECTION_SLUG}/best`
        try {
          const res = await apiGet<{ listings: unknown[]; next?: string }>(
            path,
            { limit: 3 },
          )
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.listings)).toBe(true)
          if (res.data.listings.length > 0) {
            const v = validateSchema(ListingSchema, res.data.listings[0])
            record("listings.best", "GET", path, res, v.violations)
            expect(v.success).toBe(true)
          } else {
            record("listings.best", "GET", path, res)
          }
        } catch (e) {
          recordError("listings.best", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/listings/collection/{slug}/all — pagination cursor works", async () => {
        const path = `/api/v2/listings/collection/${TEST_COLLECTION_SLUG}/all`
        try {
          const page1 = await apiGet<{ listings: unknown[]; next?: string }>(
            path,
            { limit: 2 },
          )
          expect(page1.status).toBe(200)
          if (page1.data.next) {
            const page2 = await apiGet<{ listings: unknown[]; next?: string }>(
              path,
              { limit: 2, next: page1.data.next },
            )
            expect(page2.status).toBe(200)
            expect(Array.isArray(page2.data.listings)).toBe(true)
            record("listings.all.pagination", "GET", path, page2)
          } else {
            record("listings.all.pagination", "GET", path, page1)
          }
        } catch (e) {
          recordError("listings.all.pagination", "GET", path, e)
          throw e
        }
      }, 30_000)

      it("GET /api/v2/listings/collection/{slug}/nfts/{tokenId}/best — returns best listing for NFT", async () => {
        const path = `/api/v2/listings/collection/${TEST_COLLECTION_SLUG}/nfts/${TEST_TOKEN_ID}/best`
        try {
          const res = await apiGet(path)
          // May return 200 with data or 404 if no active listing
          expect([200, 404]).toContain(res.status)
          record("listings.bestForNFT", "GET", path, res)
        } catch (e) {
          recordError("listings.bestForNFT", "GET", path, e)
          throw e
        }
      }, 15_000)
    })

    // -----------------------------------------------------------------------
    // Offers
    // -----------------------------------------------------------------------
    describe("Offers", () => {
      it("GET /api/v2/offers/collection/{slug}/all — returns all offers", async () => {
        const path = `/api/v2/offers/collection/${TEST_COLLECTION_SLUG}/all`
        try {
          const res = await apiGet<{ offers: unknown[]; next?: string }>(path, {
            limit: 3,
          })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.offers)).toBe(true)
          if (res.data.offers.length > 0) {
            const v = validateSchema(OfferSchema, res.data.offers[0])
            record("offers.all", "GET", path, res, v.violations)
            expect(v.success).toBe(true)
          } else {
            record("offers.all", "GET", path, res)
          }
        } catch (e) {
          recordError("offers.all", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/offers/collection/{slug} — returns collection offers", async () => {
        const path = `/api/v2/offers/collection/${TEST_COLLECTION_SLUG}`
        try {
          const res = await apiGet<{ offers: unknown[]; next?: string }>(path, {
            limit: 3,
          })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.offers)).toBe(true)
          record("offers.collection", "GET", path, res)
        } catch (e) {
          recordError("offers.collection", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/offers/collection/{slug}/nfts/{tokenId}/best — returns best offer for NFT", async () => {
        const path = `/api/v2/offers/collection/${TEST_COLLECTION_SLUG}/nfts/${TEST_TOKEN_ID}/best`
        try {
          const res = await apiGet(path)
          // May return 200 or 404 if no active offer
          expect([200, 404]).toContain(res.status)
          record("offers.bestForNFT", "GET", path, res)
        } catch (e) {
          recordError("offers.bestForNFT", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/offers/collection/{slug}/traits — returns trait offers", async () => {
        const path = `/api/v2/offers/collection/${TEST_COLLECTION_SLUG}/traits`
        try {
          const res = await apiGet<{ offers: unknown[]; next?: string }>(path, {
            type: "Background",
            value: "Red",
          })
          // Trait offers may return 200 (with or without results) or 400 if invalid trait
          expect([200, 400]).toContain(res.status)
          record("offers.traits", "GET", path, res)
        } catch (e) {
          recordError("offers.traits", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/offers/collection/{slug}/all — pagination cursor works", async () => {
        const path = `/api/v2/offers/collection/${TEST_COLLECTION_SLUG}/all`
        try {
          const page1 = await apiGet<{ offers: unknown[]; next?: string }>(
            path,
            { limit: 2 },
          )
          expect(page1.status).toBe(200)
          if (page1.data.next) {
            const page2 = await apiGet<{ offers: unknown[]; next?: string }>(
              path,
              { limit: 2, next: page1.data.next },
            )
            expect(page2.status).toBe(200)
            expect(Array.isArray(page2.data.offers)).toBe(true)
            record("offers.all.pagination", "GET", path, page2)
          } else {
            record("offers.all.pagination", "GET", path, page1)
          }
        } catch (e) {
          recordError("offers.all.pagination", "GET", path, e)
          throw e
        }
      }, 30_000)
    })

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------
    describe("Events", () => {
      it("GET /api/v2/events/collection/{slug} — returns collection events", async () => {
        const path = `/api/v2/events/collection/${TEST_COLLECTION_SLUG}`
        try {
          const res = await apiGet<{
            asset_events: unknown[]
            next?: string
          }>(path, { limit: 3 })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.asset_events)).toBe(true)
          if (res.data.asset_events.length > 0) {
            const v = validateSchema(AssetEventSchema, res.data.asset_events[0])
            record("events.byCollection", "GET", path, res, v.violations)
            expect(v.success).toBe(true)
          } else {
            record("events.byCollection", "GET", path, res)
          }
        } catch (e) {
          recordError("events.byCollection", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/events — returns global events", async () => {
        const path = "/api/v2/events"
        try {
          const res = await apiGet<{
            asset_events: unknown[]
            next?: string
          }>(path, { limit: 3 })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.asset_events)).toBe(true)
          record("events.list", "GET", path, res)
        } catch (e) {
          recordError("events.list", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/events/accounts/{address} — returns account events", async () => {
        const path = `/api/v2/events/accounts/${TEST_ACCOUNT}`
        try {
          const res = await apiGet<{
            asset_events: unknown[]
            next?: string
          }>(path, { limit: 3 })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.asset_events)).toBe(true)
          record("events.byAccount", "GET", path, res)
        } catch (e) {
          recordError("events.byAccount", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/events/chain/{chain}/contract/{address}/nfts/{id} — returns NFT events", async () => {
        const path = `/api/v2/events/chain/${TEST_CHAIN}/contract/${TEST_CONTRACT}/nfts/${TEST_TOKEN_ID}`
        try {
          const res = await apiGet<{
            asset_events: unknown[]
            next?: string
          }>(path, { limit: 3 })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.asset_events)).toBe(true)
          record("events.byNFT", "GET", path, res)
        } catch (e) {
          recordError("events.byNFT", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/events/collection/{slug} — pagination cursor works", async () => {
        const path = `/api/v2/events/collection/${TEST_COLLECTION_SLUG}`
        try {
          const page1 = await apiGet<{
            asset_events: unknown[]
            next?: string
          }>(path, { limit: 2 })
          expect(page1.status).toBe(200)
          if (page1.data.next) {
            const page2 = await apiGet<{
              asset_events: unknown[]
              next?: string
            }>(path, { limit: 2, next: page1.data.next })
            expect(page2.status).toBe(200)
            expect(Array.isArray(page2.data.asset_events)).toBe(true)
            record("events.byCollection.pagination", "GET", path, page2)
          } else {
            record("events.byCollection.pagination", "GET", path, page1)
          }
        } catch (e) {
          recordError("events.byCollection.pagination", "GET", path, e)
          throw e
        }
      }, 30_000)

      it("GET /api/v2/events/collection/{slug} — filters by event_type", async () => {
        const path = `/api/v2/events/collection/${TEST_COLLECTION_SLUG}`
        try {
          const res = await apiGet<{
            asset_events: unknown[]
            next?: string
          }>(path, { event_type: "sale", limit: 3 })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.asset_events)).toBe(true)
          record("events.byCollection.filtered", "GET", path, res)
        } catch (e) {
          recordError("events.byCollection.filtered", "GET", path, e)
          throw e
        }
      }, 15_000)
    })

    // -----------------------------------------------------------------------
    // Accounts
    // -----------------------------------------------------------------------
    describe("Accounts", () => {
      it("GET /api/v2/accounts/{address} — returns account info", async () => {
        const path = `/api/v2/accounts/${TEST_ACCOUNT}`
        try {
          const res = await apiGet(path)
          expect(res.status).toBe(200)
          const v = validateSchema(AccountSchema, res.data)
          record("accounts.get", "GET", path, res, v.violations)
          expect(v.success).toBe(true)
        } catch (e) {
          recordError("accounts.get", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/accounts/{address} — invalid address is handled gracefully", async () => {
        const path = "/api/v2/accounts/0xinvalid"
        try {
          const res = await apiGet(path)
          // API may return 200 with default data or 400/404 — either is acceptable
          expect(res.status).toBeLessThan(500)
          record("accounts.get.error", "GET", path, res)
        } catch (e) {
          recordError("accounts.get.error", "GET", path, e)
          throw e
        }
      }, 15_000)
    })

    // -----------------------------------------------------------------------
    // Tokens
    // -----------------------------------------------------------------------
    describe("Tokens", () => {
      it("GET /api/v2/tokens/trending — returns trending tokens", async () => {
        const path = "/api/v2/tokens/trending"
        try {
          const res = await apiGet<{ tokens: unknown[]; next?: string }>(path, {
            limit: 3,
          })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.tokens)).toBe(true)
          if (res.data.tokens.length > 0) {
            const v = validateSchema(TokenSchema, res.data.tokens[0])
            record("tokens.trending", "GET", path, res, v.violations)
            expect(v.success).toBe(true)
          } else {
            record("tokens.trending", "GET", path, res)
          }
        } catch (e) {
          recordError("tokens.trending", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/tokens/top — returns top tokens", async () => {
        const path = "/api/v2/tokens/top"
        try {
          const res = await apiGet<{ tokens: unknown[]; next?: string }>(path, {
            limit: 3,
          })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.tokens)).toBe(true)
          if (res.data.tokens.length > 0) {
            const v = validateSchema(TokenSchema, res.data.tokens[0])
            record("tokens.top", "GET", path, res, v.violations)
            expect(v.success).toBe(true)
          } else {
            record("tokens.top", "GET", path, res)
          }
        } catch (e) {
          recordError("tokens.top", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/chain/{chain}/token/{address} — returns token details", async () => {
        const path = `/api/v2/chain/${TEST_CHAIN}/token/${TEST_ERC20_ADDRESS}`
        try {
          const res = await apiGet(path)
          expect(res.status).toBe(200)
          const v = validateSchema(TokenDetailsSchema, res.data)
          record("tokens.get", "GET", path, res, v.violations)
          expect(v.success).toBe(true)
        } catch (e) {
          recordError("tokens.get", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/tokens/trending — pagination via cursor works", async () => {
        const path = "/api/v2/tokens/trending"
        try {
          const page1 = await apiGet<{ tokens: unknown[]; next?: string }>(
            path,
            { limit: 2 },
          )
          expect(page1.status).toBe(200)
          if (page1.data.next) {
            const page2 = await apiGet<{ tokens: unknown[]; next?: string }>(
              path,
              { limit: 2, cursor: page1.data.next },
            )
            expect(page2.status).toBe(200)
            expect(Array.isArray(page2.data.tokens)).toBe(true)
            record("tokens.trending.pagination", "GET", path, page2)
          } else {
            record("tokens.trending.pagination", "GET", path, page1)
          }
        } catch (e) {
          recordError("tokens.trending.pagination", "GET", path, e)
          throw e
        }
      }, 30_000)
    })

    // -----------------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------------
    describe("Search", () => {
      it("GET /api/v2/search — returns search results", async () => {
        const path = "/api/v2/search"
        try {
          const res = await apiGet<{ results: unknown[] }>(path, {
            query: "azuki",
            limit: 5,
          })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.results)).toBe(true)
          if (res.data.results.length > 0) {
            const v = validateSchema(SearchResultSchema, res.data.results[0])
            record("search.query", "GET", path, res, v.violations)
            expect(v.success).toBe(true)
          } else {
            record("search.query", "GET", path, res)
          }
        } catch (e) {
          recordError("search.query", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("GET /api/v2/search — filters by asset_types", async () => {
        const path = "/api/v2/search"
        try {
          const res = await apiGet<{ results: unknown[] }>(path, {
            query: "eth",
            asset_types: "token",
            limit: 3,
          })
          expect(res.status).toBe(200)
          expect(Array.isArray(res.data.results)).toBe(true)
          record("search.query.filtered", "GET", path, res)
        } catch (e) {
          recordError("search.query.filtered", "GET", path, e)
          throw e
        }
      }, 15_000)
    })

    // -----------------------------------------------------------------------
    // Swap Quote
    // -----------------------------------------------------------------------
    describe("Swap Quote", () => {
      it("GET /api/v2/swap/quote — returns swap quote", async () => {
        const path = "/api/v2/swap/quote"
        try {
          const res = await apiGet(path, {
            from_chain: TEST_CHAIN,
            from_address: TEST_USDC_ADDRESS,
            to_chain: TEST_CHAIN,
            to_address: "0x0000000000000000000000000000000000000000",
            quantity: "1000000", // 1 USDC
            address: TEST_ACCOUNT,
          })
          // Swap quote may return 200 or an error status if liquidity is unavailable
          expect(res.status).toBeLessThan(500)
          record("swap.quote", "GET", path, res)
        } catch (e) {
          recordError("swap.quote", "GET", path, e)
          throw e
        }
      }, 20_000)
    })

    // -----------------------------------------------------------------------
    // Fulfillment Data (POST endpoints)
    // -----------------------------------------------------------------------
    describe("Fulfillment Data", () => {
      it("POST /api/v2/listings/fulfillment_data — returns error for invalid payload", async () => {
        const path = "/api/v2/listings/fulfillment_data"
        try {
          const res = await apiPost(path, {
            listing: {
              hash: "0xinvalid",
              chain: TEST_CHAIN,
              protocol_address: "0x0",
            },
            fulfiller: { address: TEST_ACCOUNT },
          })
          // Invalid payload should return an error status (4xx or 5xx)
          expect(res.status).toBeGreaterThanOrEqual(400)
          record("fulfillment.listings", "POST", path, res)
        } catch (e) {
          recordError("fulfillment.listings", "POST", path, e)
          throw e
        }
      }, 15_000)

      it("POST /api/v2/offers/fulfillment_data — returns error for invalid payload", async () => {
        const path = "/api/v2/offers/fulfillment_data"
        try {
          const res = await apiPost(path, {
            offer: {
              hash: "0xinvalid",
              chain: TEST_CHAIN,
              protocol_address: "0x0",
            },
            fulfiller: { address: TEST_ACCOUNT },
          })
          // Invalid payload should return an error status (4xx or 5xx)
          expect(res.status).toBeGreaterThanOrEqual(400)
          record("fulfillment.offers", "POST", path, res)
        } catch (e) {
          recordError("fulfillment.offers", "POST", path, e)
          throw e
        }
      }, 15_000)
    })

    // -----------------------------------------------------------------------
    // Header Checks (cross-cutting)
    // -----------------------------------------------------------------------
    describe("Headers", () => {
      it("Rate-limit headers are present on a standard endpoint", async () => {
        const path = `/api/v2/collections/${TEST_COLLECTION_SLUG}`
        try {
          const res = await apiGet(path)
          expect(res.status).toBe(200)
          const rateLimitHeader =
            res.headers.get("x-ratelimit-remaining") ??
            res.headers.get("ratelimit-remaining") ??
            res.headers.get("x-ratelimit-limit") ??
            res.headers.get("ratelimit-limit")
          // Record whether rate-limit headers are present (not all endpoints expose them)
          const violations =
            rateLimitHeader === null ? ["no rate-limit headers found"] : []
          record("headers.rateLimit", "GET", path, res, violations)
        } catch (e) {
          recordError("headers.rateLimit", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("Cache-Control header is present on a cacheable endpoint", async () => {
        const path = `/api/v2/collections/${TEST_COLLECTION_SLUG}`
        try {
          const res = await apiGet(path)
          expect(res.status).toBe(200)
          const cacheControl = res.headers.get("cache-control")
          expect(cacheControl).toBeDefined()
          record("headers.cacheControl", "GET", path, res)
        } catch (e) {
          recordError("headers.cacheControl", "GET", path, e)
          throw e
        }
      }, 15_000)

      it("Request without API key is handled", async () => {
        const url = new URL(
          `${BASE_URL}/api/v2/collections/${TEST_COLLECTION_SLUG}`,
        )
        const start = performance.now()
        const res = await fetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        })
        const latencyMs = Math.round(performance.now() - start)
        const text = await res.text()
        const responseSize = new TextEncoder().encode(text).length
        // Some endpoints allow unauthenticated access; record the behavior
        expect(res.status).toBeLessThan(500)
        results.push({
          endpoint: "headers.noApiKey",
          method: "GET",
          path: url.pathname,
          status: "pass",
          statusCode: res.status,
          latencyMs,
          responseSize,
          rateLimitRemaining:
            res.headers.get("x-ratelimit-remaining") ??
            res.headers.get("ratelimit-remaining") ??
            undefined,
          cacheControl: res.headers.get("cache-control") ?? undefined,
        })
      }, 15_000)
    })

    // -----------------------------------------------------------------------
    // Report generation
    // -----------------------------------------------------------------------
    afterAll(async () => {
      const latencies = results
        .filter(r => r.latencyMs !== undefined)
        .map(r => r.latencyMs as number)

      const report = {
        summary: {
          total: results.length,
          passed: results.filter(r => r.status === "pass").length,
          failed: results.filter(r => r.status === "fail").length,
          skipped: results.filter(r => r.status === "skip").length,
          latencyPercentiles: {
            p50: percentile(latencies, 50),
            p90: percentile(latencies, 90),
            p95: percentile(latencies, 95),
            p99: percentile(latencies, 99),
          },
        },
        results,
      }

      const reportJson = JSON.stringify(report, null, 2)

      // Write report to stdout for CI capture
      console.log("\n=== REST API E2E Test Report ===")
      console.log(reportJson)

      // Also write to file
      const { writeFile, mkdir } = await import("node:fs/promises")
      const { join } = await import("node:path")
      const reportDir = join(process.cwd(), "test-reports")
      await mkdir(reportDir, { recursive: true })
      const reportPath = join(reportDir, "rest-api-e2e-report.json")
      await writeFile(reportPath, reportJson, "utf-8")
      console.log(`\nReport written to: ${reportPath}`)
    })
  },
  300_000,
) // 5 minute timeout for the whole suite
