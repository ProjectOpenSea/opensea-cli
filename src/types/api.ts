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
export type EventBase = Schemas["EventBase"]
export type SaleEvent = Schemas["SaleEvent"]
export type TransferEvent = Schemas["TransferEvent"]
export type OrderEvent = Schemas["OrderEvent"]
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
export type OffersResponse = Schemas["OffersResponse"]
export type ListingsResponse = Schemas["ListingsResponse"]
export type GetOrderResponse = Schemas["GetOrderResponse"]
export type AssetEventsResponse = Schemas["AssetEventsResponse"]
export type AccountResponse = Schemas["AccountResponse"]
export type ContractResponse = Schemas["ContractResponse"]
export type FulfillListingResponse = Schemas["FulfillListingResponse"]

// ── Drop types from @opensea/api-types ─────────────────────────────

export type DropResponse = Schemas["DropResponse"]
export type DropDetailedResponse = Schemas["DropDetailedResponse"]
export type DropStageResponse = Schemas["DropStageResponse"]
export type DropPaginatedResponse = Schemas["DropPaginatedResponse"]
export type DropMintRequest = Schemas["DropMintRequest"]
export type DropMintResponse = Schemas["DropMintResponse"]
export type CrossChainDropMintRequest = Schemas["CrossChainDropMintRequest"]
export type CrossChainDropMintResponse = Schemas["CrossChainDropMintResponse"]
export type DropEligibilityResponse = Schemas["DropEligibilityResponse"]
export type DropDeployRequest = Schemas["DropDeployRequest"]
export type DropDeployResponse = Schemas["DropDeployResponse"]
export type DropDeployReceiptResponse = Schemas["DropDeployReceiptResponse"]
export type AccountResolveResponse = Schemas["AccountResolveResponse"]
export type AssetMetadataResponse = Schemas["AssetMetadataResponse"]

// ── New endpoint types (api-types 0.4.0) ────────────────────────────

export type BatchTokensRequest = Schemas["BatchTokensRequest"]
export type TokenBatchResponse = Schemas["TokenBatchResponse"]
export type BatchNftsRequest = Schemas["BatchNftsRequest"]
export type NftBatchResponse = Schemas["NftBatchResponse"]
export type BatchCollectionsRequest = Schemas["BatchCollectionsRequest"]
export type CollectionBatchResponse = Schemas["CollectionBatchResponse"]
export type CreateListingActionsRequest = Schemas["CreateListingActionsRequest"]
export type CreateListingActionsResponse =
  Schemas["CreateListingActionsResponse"]
export type TransferRequest = Schemas["TransferRequest"]
export type TransferResponse = Schemas["TransferResponse"]
export type CollectionOfferAggregatesPaginatedResponse =
  Schemas["CollectionOfferAggregatesPaginatedResponse"]
export type CollectionHoldersPaginatedResponse =
  Schemas["CollectionHoldersPaginatedResponse"]
export type FloorPriceHistoryResponse = Schemas["FloorPriceHistoryResponse"]
export type PriceHistoryResponse = Schemas["PriceHistoryResponse"]
export type OhlcvResponse = Schemas["OhlcvResponse"]
export type TokenSwapActivityPaginatedResponse =
  Schemas["TokenSwapActivityPaginatedResponse"]
export type TokenActivityStatsResponse = Schemas["TokenActivityStatsResponse"]
export type TokenActivityWindowStatsResponse =
  Schemas["TokenActivityWindowStatsResponse"]
export type TokenAccountActivityPaginatedResponse =
  Schemas["TokenAccountActivityPaginatedResponse"]
export type TokenHoldersResponse = Schemas["TokenHoldersResponse"]
export type TokenLiquidityPoolsResponse = Schemas["TokenLiquidityPoolsResponse"]
export type OwnersPaginatedResponse = Schemas["OwnersPaginatedResponse"]
export type NftAnalyticsResponse = Schemas["NftAnalyticsResponse"]
export type PortfolioStatsResponse = Schemas["PortfolioStatsResponse"]
export type PortfolioHistoryResponse = Schemas["PortfolioHistoryResponse"]
export type ProfileCollectionsResponse = Schemas["ProfileCollectionsResponse"]
export type WalletPnlResponse = Schemas["WalletPnlResponse"]
export type ClosedPositionsResponse = Schemas["ClosedPositionsResponse"]
export type ClosedPositionResponse = Schemas["ClosedPositionResponse"]
export type PositionTokenTransfersResponse =
  Schemas["PositionTokenTransfersResponse"]
export type PositionTokenTransferResponse =
  Schemas["PositionTokenTransferResponse"]

// ── Query helpers ───────────────────────────────────────────────────

/**
 * Single trait filter passed to collection-scoped read endpoints (NFTs by
 * collection, best listings by collection, events by collection). Multiple
 * filters are AND-combined: returned items must match every trait.
 */
export interface TraitFilter {
  traitType: string
  value: string
}

export type TokenActivityStatsWindow = "5m" | "1h" | "4h" | "24h"

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

/**
 * The NFT shape returned inside event payloads (as `asset` on OrderEvent and
 * `nft` on SaleEvent/TransferEvent). Identical to the canonical `Nft` schema
 * from @opensea/api-types — re-exported under the legacy name for SDK
 * consumers.
 */
export type EventAsset = Nft

/**
 * A single entry from `AssetEventsResponse.asset_events`. The OpenSea events
 * endpoint returns a `oneOf` discriminated union of OrderEvent, SaleEvent, and
 * TransferEvent. We source the type from the response schema so that adding a
 * new event variant upstream automatically propagates here.
 */
export type AssetEvent = AssetEventsResponse["asset_events"][number]

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

// Token shapes sourced from the canonical schemas in @opensea/api-types so the
// SDK surface stays in lockstep with the API spec.
export type Token = Schemas["TokenResponse"]
export type TokenDetails = Schemas["TokenDetailedResponse"]
export type TokenStats = Schemas["TokenStatsResponse"]
export type TokenSocials = Schemas["TokenSocialsResponse"]

export type SwapQuote = Schemas["SwapQuoteDetails"]
export type SwapTransaction = Schemas["SwapTransactionResponse"]
export type SwapQuoteResponse = Schemas["SwapQuoteResponse"]

export type SearchAssetType = "collection" | "nft" | "token" | "account"

export type SearchResultCollection = Schemas["CollectionSearchResponse"]
export type SearchResultToken = Schemas["TokenSearchResponse"]
export type SearchResultNFT = Schemas["NftSearchResponse"]
export type SearchResultAccount = Schemas["AccountSearchResponse"]
export type SearchResult = Schemas["SearchResultResponse"]
export type SearchResponse = Schemas["SearchResponse"]

export type ChainInfo = Schemas["ChainResponse"]
export type ChainListResponse = Schemas["ChainListResponse"]

export type TokenBalance = Schemas["TokenBalanceResponse"]
export type TokenBalancePaginatedResponse =
  Schemas["TokenBalancePaginatedResponse"]

export type TokenBalanceSortBy =
  | "USD_VALUE"
  | "MARKET_CAP"
  | "ONE_DAY_VOLUME"
  | "PRICE"
  | "ONE_DAY_PRICE_CHANGE"
  | "SEVEN_DAY_PRICE_CHANGE"

export type CrossChainFulfillmentRequest =
  Schemas["CrossChainFulfillmentRequest"]
export type CrossChainFulfillmentResponse =
  Schemas["CrossChainFulfillmentResponse"]
export type SwapTransactionResponse = Schemas["SwapTransactionResponse"]
export type SwapExecuteRequest = Schemas["SwapExecuteRequest"]
export type SwapExecuteResponse = Schemas["SwapExecuteResponse"]

export type SwapQuoteInput = Schemas["SwapQuoteInput"]
export type TransactionReceiptRequest = Schemas["TransactionReceiptRequest"]
export type TransactionReceiptResponse = Schemas["TransactionReceiptResponse"]
export type SweepCollectionRequest = Schemas["SweepCollectionRequest"]
export type SweepCollectionResponse = Schemas["SweepCollectionResponse"]

export interface ValidateMetadataResponse {
  assetIdentifier: {
    chain: string
    contractAddress: string
    tokenId: string
  }
  tokenUri?: string
  metadata?: {
    name?: string
    description?: string
    originalImageUrl?: string
    processedImageUrl?: string
    originalAnimationUrl?: string
    processedAnimationUrl?: string
    externalUrl?: string
    backgroundColor?: string
    attributes: {
      traitType: string
      value: string
      displayType?: string
    }[]
  }
  error?: {
    errorType: string
    message: string
    url?: string
    statusCode?: number
  }
}

// ── Scoped-token write endpoints (social, favorites, orders, profile,
//    drops, collections, wallets) ────────────────────────────────────

export type WatchlistRequest = Schemas["WatchlistRequest"]
export type FavoriteResponse = Schemas["FavoriteResponse"]
export type CancelRequest = Schemas["CancelRequest"]
export type WalletUnlinkResponse = Schemas["WalletUnlinkResponse"]
export type WalletAgentStatusResponse = Schemas["WalletAgentStatusResponse"]

export type UpdateProfileSettingsRequest =
  Schemas["UpdateProfileSettingsRequest"]
export type UpdateProfileSettingsResponse =
  Schemas["UpdateProfileSettingsResponse"]
export type ClaimAccountUsernameRequest = Schemas["ClaimAccountUsernameRequest"]
export type ClaimAccountUsernameResponse =
  Schemas["ClaimAccountUsernameResponse"]
export type UploadProfileImageRequest = Schemas["UploadProfileImageRequest"]
export type UploadContext = Schemas["UploadContext"]
export type SetNftPfpRequest = Schemas["SetNftPfpRequest"]
export type NftPfpResponse = Schemas["NftPfpResponse"]
export type ClearNftPfpResponse = Schemas["ClearNftPfpResponse"]
export type CreateProfileShelfRequest = Schemas["CreateProfileShelfRequest"]
export type ReorderProfileShelvesRequest =
  Schemas["ReorderProfileShelvesRequest"]
export type UpdateProfileShelfRequest = Schemas["UpdateProfileShelfRequest"]
export type ProfileShelfResponse = Schemas["ProfileShelfResponse"]
export type ProfileShelfActionResponse = Schemas["ProfileShelfActionResponse"]

export type SaveDropEditsRequest = Schemas["SaveDropEditsRequest"]
export type SavePrerevealDropItemRequest =
  Schemas["SavePrerevealDropItemRequest"]
export type SaveSelfMintDropItemRequest = Schemas["SaveSelfMintDropItemRequest"]
export type UpdateSelfMintDropItemRequest =
  Schemas["UpdateSelfMintDropItemRequest"]
export type UpdateDropItemRequest = Schemas["UpdateDropItemRequest"]
export type UploadDropItemMediaRequest = Schemas["UploadDropItemMediaRequest"]
export type SaveDropItemMediaRequest = Schemas["SaveDropItemMediaRequest"]
export type ValidateDropAllowlistRequest =
  Schemas["ValidateDropAllowlistRequest"]

export type ModifyCollectionRequest = Schemas["ModifyCollectionRequest"]
export type UpdateCollectionMetadataRequest =
  Schemas["UpdateCollectionMetadataRequest"]
export type SetCollectionVisibilityRequest =
  Schemas["SetCollectionVisibilityRequest"]

// ── Tool Registry types ─────────────────────────────────────────────

export type RegisteredToolResponse = Schemas["RegisteredToolResponse"]
export type ToolSearchPaginatedResponse = Schemas["ToolSearchPaginatedResponse"]
export type ToolListPaginatedResponse = Schemas["ToolListPaginatedResponse"]
export type ToolActivityPaginatedResponse =
  Schemas["ToolActivityPaginatedResponse"]
