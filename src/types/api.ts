/**
 * API types for the OpenSea CLI.
 *
 * Types that match the OpenSea API spec are imported from @opensea/api-types.
 * CLI-specific types (swap, search UI, token details) are defined locally.
 */

import type { components } from "@opensea/api-types"

// ── Re-exports from @opensea/api-types ──────────────────────────────
// These are the canonical API types. When the spec changes, they update
// automatically after running `pnpm --filter @opensea/api-types run build`.

type Schemas = components["schemas"]

export type Chain = Schemas["ChainIdentifier"]
export type Fee = Schemas["Fee"]
export type PaymentToken = Schemas["PaymentToken"]
export type Price = Schemas["Price"]
export type Trait = Schemas["Trait"]
export type Contract = Schemas["Contract"]
export type Nft = Schemas["Nft"]
export type NftDetailed = Schemas["NftDetailed"]
export type Owner = Schemas["Owner"]
export type Rarity = Schemas["Rarity"]
export type CollectionRarity = Schemas["CollectionRarity"]
export type Order = Schemas["Order"]
export type Offer = Schemas["Offer"]
export type Listing = Schemas["Listing"]
export type ListingPrice = Schemas["ListingPrice"]
export type Payment = Schemas["Payment"]
export type Event = Schemas["Event"]
export type SaleEvent = Schemas["SaleEvent"]
export type TransferEvent = Schemas["TransferEvent"]
export type OrderEvent = Schemas["OrderEvent"]
export type SimpleAccount = Schemas["SimpleAccount"]
export type SocialMediaAccount = Schemas["SocialMediaAccount"]
export type ProtocolData = Schemas["ProtocolData"]
export type IntervalStat = Schemas["IntervalStat"]
export type Total = Schemas["Total"]
export type PricingCurrencies = Schemas["PricingCurrencies"]

// ── API response types from @opensea/api-types ──────────────────────

export type CollectionResponse = Schemas["CollectionResponse"]
export type CollectionDetailedResponse = Schemas["CollectionDetailedResponse"]
export type CollectionPaginatedResponse = Schemas["CollectionPaginatedResponse"]
export type CollectionStatsResponse = Schemas["CollectionStatsResponse"]
export type NftResponse = Schemas["NftResponse"]
export type NftListResponse = Schemas["NftListResponse"]
export type OrdersResponse = Schemas["OrdersResponse"]
export type OffersResponse = Schemas["OffersResponse"]
export type ListingsResponse = Schemas["ListingsResponse"]
export type GetOrderResponse = Schemas["GetOrderResponse"]
export type AssetEventsResponse = Schemas["AssetEventsResponse"]
export type AccountResponse = Schemas["AccountResponse"]
export type ContractResponse = Schemas["ContractResponse"]
export type FulfillListingResponse = Schemas["FulfillListingResponse"]

// ── CLI-specific types (not from API spec) ──────────────────────────

export type SafelistStatus =
  | "not_requested"
  | "requested"
  | "approved"
  | "verified"
  | "disabled_top_trending"

export type CollectionOrderBy =
  | "created_date"
  | "one_day_change"
  | "seven_day_volume"
  | "seven_day_change"
  | "num_owners"
  | "market_cap"

export type EventType =
  | "sale"
  | "transfer"
  | "mint"
  | "listing"
  | "offer"
  | "trait_offer"
  | "collection_offer"

export type OrderSide = "ask" | "bid"

// ── Legacy type aliases (backward compat for CLI consumers) ─────────
// These map old CLI-specific names to the generated types.

export type {
  AccountResponse as Account,
  CollectionDetailedResponse as Collection,
  CollectionStatsResponse as CollectionStats,
  NftDetailed as NFT,
  Payment as EventPayment,
}

export interface EventAsset {
  identifier: string
  collection: string
  contract: string
  token_standard: string
  name: string
  description: string
  image_url: string
  metadata_url: string
  opensea_url: string
  updated_at: string
  is_disabled: boolean
  is_nsfw: boolean
}

export interface AssetEvent {
  event_type: string
  event_timestamp: number
  chain: string
  quantity: number
  [key: string]: unknown
}

export interface TraitCategories {
  [traitType: string]: "string" | "number" | "date"
}

export interface TraitCounts {
  [traitValue: string]: number
}

export interface GetTraitsResponse {
  categories: TraitCategories
  counts: { [traitType: string]: TraitCounts }
}

export interface Token {
  address: string
  chain: string
  name: string
  symbol: string
  image_url?: string
  usd_price: string
  decimals: number
  market_cap_usd?: number
  volume_24h?: number
  price_change_24h?: number
  opensea_url: string
}

export interface TokenDetails {
  address: string
  chain: string
  name: string
  symbol: string
  image_url?: string
  description?: string
  usd_price: string
  decimals: number
  stats?: TokenStats
  socials?: TokenSocials
  opensea_url: string
}

export interface TokenStats {
  market_cap_usd?: number
  fdv_usd?: number
  circulating_supply?: number
  max_supply?: number
  total_supply?: number
  volume_24h?: number
  price_change_1h?: number
  price_change_24h?: number
  price_change_7d?: number
  price_change_30d?: number
}

export interface TokenSocials {
  website?: string
  twitter_handle?: string
  telegram_identifier?: string
}

export interface SwapQuote {
  total_price_usd: number
  total_cost_usd: number
  slippage_tolerance: number
  estimated_duration_ms: number
  marketplace_fee_bps: number
}

export interface SwapTransaction {
  chain: string
  to?: string
  data: string
  value?: string
}

export interface SwapQuoteResponse {
  quote: SwapQuote
  transactions: SwapTransaction[]
}

export type SearchAssetType = "collection" | "nft" | "token" | "account"

export interface SearchResultCollection {
  collection: string
  name: string
  image_url: string | null
  is_disabled: boolean
  is_nsfw: boolean
  opensea_url: string
}

export interface SearchResultToken {
  address: string
  chain: string
  name: string
  symbol: string
  image_url: string | null
  usd_price: string
  decimals: number
  opensea_url: string
}

export interface SearchResultNFT {
  identifier: string
  collection: string
  contract: string
  name: string | null
  image_url: string | null
  opensea_url: string
}

export interface SearchResultAccount {
  address: string
  username: string | null
  profile_image_url: string | null
  opensea_url: string
}

export interface SearchResult {
  type: SearchAssetType
  collection?: SearchResultCollection
  token?: SearchResultToken
  nft?: SearchResultNFT
  account?: SearchResultAccount
}

export interface SearchResponse {
  results: SearchResult[]
}
