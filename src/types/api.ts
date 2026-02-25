export type Chain =
  | "ethereum"
  | "polygon"
  | "base"
  | "blast"
  | "arbitrum"
  | "avalanche"
  | "optimism"
  | "solana"
  | "zora"
  | "sei"
  | "b3"
  | "bera_chain"
  | "ape_chain"
  | "flow"
  | "ronin"
  | "abstract"
  | "shape"
  | "unichain"
  | "gunzilla"
  | "hyperevm"
  | "somnia"
  | "monad"

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

export interface Fee {
  fee: number
  recipient: string
  required: boolean
}

export interface PaymentToken {
  name: string
  symbol: string
  decimals: number
  address: string
  chain: Chain
  image_url?: string
  eth_price?: string
  usd_price?: string
}

export interface Collection {
  name: string
  collection: string
  description: string
  image_url: string
  banner_image_url: string
  owner: string
  safelist_status: SafelistStatus
  category: string
  is_disabled: boolean
  is_nsfw: boolean
  trait_offers_enabled: boolean
  collection_offers_enabled: boolean
  opensea_url: string
  project_url: string
  wiki_url: string
  discord_url: string
  telegram_url: string
  twitter_username: string
  instagram_username: string
  contracts: { address: string; chain: Chain }[]
  editors: string[]
  fees: Fee[]
  rarity: {
    strategy_id: string
    strategy_version: string
    calculated_at: string
    max_rank: number
    tokens_scored: number
  } | null
  payment_tokens: PaymentToken[]
  total_supply: number
  created_date: string
  required_zone?: string
}

export interface CollectionStats {
  total: {
    volume: number
    sales: number
    average_price: number
    num_owners: number
    market_cap: number
    floor_price: number
    floor_price_symbol: string
  }
  intervals: {
    interval: "one_day" | "seven_day" | "thirty_day"
    volume: number
    volume_diff: number
    volume_change: number
    sales: number
    sales_diff: number
    average_price: number
  }[]
}

export interface NFT {
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
  traits: Trait[] | null
  creator: string
  owners: { address: string; quantity: number }[]
  rarity: {
    strategy_id: string | null
    strategy_version: string | null
    rank: number | null
    score: number | null
    calculated_at: string
    max_rank: number | null
    tokens_scored: number | null
    ranking_features: { unique_attribute_count: number } | null
  } | null
}

export interface Trait {
  trait_type: string
  display_type: string
  max_value: string
  value: string | number
}

export interface Price {
  currency: string
  decimals: number
  value: string
}

export interface Order {
  order_hash: string
  chain: string
  protocol_data: Record<string, unknown>
  protocol_address: string
  price: Price
}

export interface Offer extends Order {
  criteria?: {
    collection: { slug: string }
    contract: { address: string }
    encoded_token_ids?: string
    trait?: { type: string; value: string }
  }
  status: string
}

export interface Listing extends Omit<Order, "price"> {
  type: string
  price: { current: Price }
  remaining_quantity: number
  status: string
}

export interface EventPayment {
  quantity: string
  token_address: string
  decimals: number
  symbol: string
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

export interface Contract {
  address: string
  chain: string
  collection: string | null
  name: string
  contract_standard: string
}

export interface Account {
  address: string
  username: string
  profile_image_url: string
  banner_image_url: string
  website: string
  social_media_accounts: { platform: string; username: string }[]
  bio: string
  joined_date: string
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

export interface PaginatedResponse<T> {
  next?: string
  results: T[]
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

export interface SearchCollectionResult {
  slug: string
  name: string
  description: string
  imageUrl: string
  chain: { identifier: string; name: string }
  stats: {
    totalSupply: number
    ownerCount: number
    volume: { usd: number }
    sales: number
  } | null
  floorPrice: {
    pricePerItem: {
      usd: number
      native: { unit: number; symbol: string }
    }
  } | null
}

export interface SearchNFTResult {
  tokenId: string
  name: string
  description: string
  imageUrl: string
  contractAddress: string
  collection: { slug: string; name: string }
  chain: { identifier: string; name: string }
  bestListing: {
    pricePerItem: {
      usd: number
      native: { unit: number; symbol: string }
    }
  } | null
  owner: { address: string; displayName: string } | null
}

export interface SearchTokenResult {
  name: string
  symbol: string
  imageUrl: string
  usdPrice: string
  contractAddress: string
  chain: { identifier: string; name: string }
  stats: {
    marketCapUsd: number
    oneDay: { priceChange: number; volume: number }
  } | null
}

export interface SearchAccountResult {
  address: string
  username: string
  imageUrl: string
  isVerified: boolean
}
