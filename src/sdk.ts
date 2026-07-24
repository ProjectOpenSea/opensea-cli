import { OpenSeaClient } from "./client.js"
import { checkHealth } from "./health.js"
import type {
  Account,
  AccountResolveResponse,
  AssetEvent,
  AssetMetadataResponse,
  BatchCollectionsRequest,
  BatchNftsRequest,
  BatchTokensRequest,
  Chain,
  ChainListResponse,
  ClosedPositionsResponse,
  Collection,
  CollectionBatchResponse,
  CollectionDetailedResponse,
  CollectionHoldersPaginatedResponse,
  CollectionOfferAggregatesPaginatedResponse,
  CollectionOrderBy,
  CollectionPaginatedResponse,
  CollectionStats,
  Contract,
  CreateListingActionsRequest,
  CreateListingActionsResponse,
  CrossChainDropMintRequest,
  CrossChainDropMintResponse,
  CrossChainFulfillmentResponse,
  DropDeployReceiptResponse,
  DropDeployRequest,
  DropDeployResponse,
  DropDetailedResponse,
  DropMintResponse,
  DropPaginatedResponse,
  EventType,
  FloorPriceHistoryResponse,
  GetTraitsResponse,
  HealthResult,
  Listing,
  NFT,
  NftAnalyticsResponse,
  NftBatchResponse,
  Offer,
  OhlcvResponse,
  OpenSeaClientConfig,
  OwnersPaginatedResponse,
  PortfolioHistoryResponse,
  PortfolioStatsResponse,
  PositionTokenTransfersResponse,
  PriceHistoryResponse,
  ProfileCollectionsResponse,
  RegisteredToolResponse,
  SearchAssetType,
  SearchResponse,
  SwapExecuteRequest,
  SwapExecuteResponse,
  SwapQuoteResponse,
  SweepCollectionRequest,
  SweepCollectionResponse,
  Token,
  TokenAccountActivityPaginatedResponse,
  TokenActivityStatsResponse,
  TokenActivityStatsWindow,
  TokenBalancePaginatedResponse,
  TokenBalanceSortBy,
  TokenBatchResponse,
  TokenDetails,
  TokenHoldersResponse,
  TokenLiquidityPoolsResponse,
  TokenSwapActivityPaginatedResponse,
  ToolActivityPaginatedResponse,
  ToolListPaginatedResponse,
  ToolSearchPaginatedResponse,
  TraitFilter,
  TransactionReceiptRequest,
  TransactionReceiptResponse,
  TransferRequest,
  TransferResponse,
  ValidateMetadataResponse,
  WalletAgentStatusResponse,
  WalletPnlResponse,
} from "./types/index.js"
import type { TransactionResult, WalletAdapter } from "./wallet/index.js"
import { resolveChainId } from "./wallet/index.js"

function encodeTraits(traits?: TraitFilter[]): string | undefined {
  if (!traits || traits.length === 0) return undefined
  return JSON.stringify(traits)
}

function convertToSmallestUnit(amount: string, decimals: number): string {
  const [whole = "0", frac = ""] = amount.split(".")
  if (frac.length > decimals) {
    throw new Error(
      `Too many decimal places (${frac.length}) for token with ${decimals} decimals`,
    )
  }
  const paddedFrac = frac.padEnd(decimals, "0")
  return (
    BigInt(whole) * BigInt(10) ** BigInt(decimals) +
    BigInt(paddedFrac)
  ).toString()
}

export async function resolveQuantity(
  client: OpenSeaClient,
  chain: string,
  tokenAddress: string,
  quantity: string,
): Promise<string> {
  if (/^\d+$/.test(quantity)) {
    return quantity
  }
  if (!/^\d+\.\d+$/.test(quantity)) {
    throw new Error(
      `Invalid quantity "${quantity}": must be an integer or decimal number`,
    )
  }
  const token = await client.get<TokenDetails>(
    `/api/v2/chain/${chain}/token/${tokenAddress}`,
  )
  return convertToSmallestUnit(quantity, token.decimals)
}

/** @internal Exported for testing only */
export { convertToSmallestUnit as _convertToSmallestUnit }

export class OpenSeaCLI {
  private client: OpenSeaClient

  readonly chains: ChainsAPI
  readonly collections: CollectionsAPI
  readonly drops: DropsAPI
  readonly nfts: NFTsAPI
  readonly listings: ListingsAPI
  readonly offers: OffersAPI
  readonly events: EventsAPI
  readonly accounts: AccountsAPI
  readonly tokens: TokensAPI
  readonly search: SearchAPI
  readonly swaps: SwapsAPI
  readonly transactions: TransactionsAPI
  readonly assets: AssetsAPI
  readonly tools: ToolsAPI
  readonly health: HealthAPI

  constructor(config: OpenSeaClientConfig) {
    this.client = new OpenSeaClient(config)
    this.chains = new ChainsAPI(this.client)
    this.collections = new CollectionsAPI(this.client)
    this.drops = new DropsAPI(this.client)
    this.nfts = new NFTsAPI(this.client)
    this.listings = new ListingsAPI(this.client)
    this.offers = new OffersAPI(this.client)
    this.events = new EventsAPI(this.client)
    this.accounts = new AccountsAPI(this.client)
    this.tokens = new TokensAPI(this.client)
    this.search = new SearchAPI(this.client)
    this.swaps = new SwapsAPI(this.client)
    this.transactions = new TransactionsAPI(this.client)
    this.assets = new AssetsAPI(this.client)
    this.tools = new ToolsAPI(this.client)
    this.health = new HealthAPI(this.client)
  }
}

class ChainsAPI {
  constructor(private client: OpenSeaClient) {}

  async list(): Promise<ChainListResponse> {
    return this.client.get("/api/v2/chains")
  }
}

class CollectionsAPI {
  constructor(private client: OpenSeaClient) {}

  async get(slug: string): Promise<Collection> {
    return this.client.get<Collection>(`/api/v2/collections/${slug}`)
  }

  async list(options?: {
    chain?: Chain
    limit?: number
    next?: string
    orderBy?: CollectionOrderBy
    creatorUsername?: string
    includeHidden?: boolean
  }): Promise<{ collections: Collection[]; next?: string }> {
    return this.client.get("/api/v2/collections", {
      chain: options?.chain,
      limit: options?.limit,
      next: options?.next,
      order_by: options?.orderBy,
      creator_username: options?.creatorUsername,
      include_hidden: options?.includeHidden,
    })
  }

  async stats(slug: string): Promise<CollectionStats> {
    return this.client.get<CollectionStats>(`/api/v2/collections/${slug}/stats`)
  }

  async traits(slug: string): Promise<GetTraitsResponse> {
    return this.client.get<GetTraitsResponse>(`/api/v2/traits/${slug}`)
  }

  async trending(options?: {
    timeframe?: string
    chains?: string[]
    category?: string
    limit?: number
    next?: string
  }): Promise<CollectionPaginatedResponse> {
    return this.client.get("/api/v2/collections/trending", {
      timeframe: options?.timeframe,
      chains: options?.chains?.join(","),
      category: options?.category,
      limit: options?.limit,
      cursor: options?.next,
    })
  }

  async top(options?: {
    sortBy?: string
    chains?: string[]
    category?: string
    limit?: number
    next?: string
  }): Promise<CollectionPaginatedResponse> {
    return this.client.get("/api/v2/collections/top", {
      sort_by: options?.sortBy,
      chains: options?.chains?.join(","),
      category: options?.category,
      limit: options?.limit,
      cursor: options?.next,
    })
  }

  async batch(
    request: BatchCollectionsRequest,
  ): Promise<CollectionBatchResponse> {
    return this.client.post("/api/v2/collections/batch", request)
  }

  async offerAggregates(
    slug: string,
    options?: { limit?: number; next?: string; sortDirection?: "asc" | "desc" },
  ): Promise<CollectionOfferAggregatesPaginatedResponse> {
    return this.client.get(`/api/v2/collections/${slug}/offer_aggregates`, {
      limit: options?.limit,
      cursor: options?.next,
      sort_direction: options?.sortDirection,
    })
  }

  async holders(
    slug: string,
    options?: {
      limit?: number
      next?: string
      sortDirection?: "asc" | "desc"
      ownedBy?: string
    },
  ): Promise<CollectionHoldersPaginatedResponse> {
    return this.client.get(`/api/v2/collections/${slug}/holders`, {
      limit: options?.limit,
      cursor: options?.next,
      sort_direction: options?.sortDirection,
      owned_by: options?.ownedBy,
    })
  }

  async floorPrices(
    slug: string,
    options?: { timeframe?: string; resolution?: number },
  ): Promise<FloorPriceHistoryResponse> {
    return this.client.get(`/api/v2/collections/${slug}/floor_prices`, {
      timeframe: options?.timeframe,
      resolution: options?.resolution,
    })
  }
}

class DropsAPI {
  constructor(private client: OpenSeaClient) {}

  async list(options?: {
    type?: string
    chains?: string[]
    limit?: number
    next?: string
  }): Promise<DropPaginatedResponse> {
    return this.client.get("/api/v2/drops", {
      type: options?.type,
      chains: options?.chains?.join(","),
      limit: options?.limit,
      cursor: options?.next,
    })
  }

  async get(slug: string): Promise<DropDetailedResponse> {
    return this.client.get(`/api/v2/drops/${slug}`)
  }

  async mint(
    slug: string,
    options: { minter: string; quantity?: number },
  ): Promise<DropMintResponse> {
    return this.client.post(`/api/v2/drops/${slug}/mint`, {
      minter: options.minter,
      quantity: options.quantity ?? 1,
    })
  }

  /**
   * Build ordered transactions for paying on one chain and minting on
   * another. Submit them in order, then poll `transactions.receipt` with the
   * returned `receipt_request` until the status is terminal.
   */
  async crossChainMint(
    slug: string,
    request: CrossChainDropMintRequest,
  ): Promise<CrossChainDropMintResponse> {
    return this.client.post(`/api/v2/drops/${slug}/cross_chain_mint`, request)
  }

  async deploy(request: DropDeployRequest): Promise<DropDeployResponse> {
    return this.client.post("/api/v2/drops/deploy", request)
  }

  async deployReceipt(
    chain: Chain,
    txHash: string,
  ): Promise<DropDeployReceiptResponse> {
    return this.client.get(`/api/v2/drops/deploy/${chain}/${txHash}/receipt`)
  }
}

class NFTsAPI {
  constructor(private client: OpenSeaClient) {}

  async get(
    chain: Chain,
    address: string,
    identifier: string,
  ): Promise<{ nft: NFT }> {
    return this.client.get(
      `/api/v2/chain/${chain}/contract/${address}/nfts/${identifier}`,
    )
  }

  async listByCollection(
    slug: string,
    options?: { limit?: number; next?: string; traits?: TraitFilter[] },
  ): Promise<{ nfts: NFT[]; next?: string }> {
    return this.client.get(`/api/v2/collection/${slug}/nfts`, {
      limit: options?.limit,
      next: options?.next,
      traits: encodeTraits(options?.traits),
    })
  }

  async listByContract(
    chain: Chain,
    address: string,
    options?: { limit?: number; next?: string },
  ): Promise<{ nfts: NFT[]; next?: string }> {
    return this.client.get(`/api/v2/chain/${chain}/contract/${address}/nfts`, {
      limit: options?.limit,
      next: options?.next,
    })
  }

  async listByAccount(
    chain: Chain,
    address: string,
    options?: { limit?: number; next?: string },
  ): Promise<{ nfts: NFT[]; next?: string }> {
    return this.client.get(`/api/v2/chain/${chain}/account/${address}/nfts`, {
      limit: options?.limit,
      next: options?.next,
    })
  }

  async refresh(
    chain: Chain,
    address: string,
    identifier: string,
  ): Promise<void> {
    await this.client.post(
      `/api/v2/chain/${chain}/contract/${address}/nfts/${identifier}/refresh`,
    )
  }

  async getContract(chain: Chain, address: string): Promise<Contract> {
    return this.client.get(`/api/v2/chain/${chain}/contract/${address}`)
  }

  async validateMetadata(
    chain: Chain,
    address: string,
    identifier: string,
    options?: { ignoreCachedItemUrls?: boolean },
  ): Promise<ValidateMetadataResponse> {
    const params: Record<string, unknown> = {}
    if (options?.ignoreCachedItemUrls) {
      params.ignoreCachedItemUrls = true
    }
    return this.client.post(
      `/api/v2/chain/${chain}/contract/${address}/nfts/${identifier}/validate-metadata`,
      undefined,
      params,
    )
  }

  async getCollection(
    chain: Chain,
    address: string,
    identifier: string,
  ): Promise<CollectionDetailedResponse> {
    return this.client.get(
      `/api/v2/chain/${chain}/contract/${address}/nfts/${identifier}/collection`,
    )
  }

  async getMetadata(
    chain: Chain,
    address: string,
    tokenId: string,
  ): Promise<AssetMetadataResponse> {
    return this.client.get(`/api/v2/metadata/${chain}/${address}/${tokenId}`)
  }

  async batch(request: BatchNftsRequest): Promise<NftBatchResponse> {
    return this.client.post("/api/v2/nfts/batch", request)
  }

  async owners(
    chain: Chain,
    address: string,
    identifier: string,
    options?: { limit?: number; next?: string },
  ): Promise<OwnersPaginatedResponse> {
    return this.client.get(
      `/api/v2/chain/${chain}/contract/${address}/nfts/${identifier}/owners`,
      { limit: options?.limit, next: options?.next },
    )
  }

  async analytics(
    chain: Chain,
    address: string,
    identifier: string,
  ): Promise<NftAnalyticsResponse> {
    return this.client.get(
      `/api/v2/chain/${chain}/contract/${address}/nfts/${identifier}/analytics`,
    )
  }
}

class ListingsAPI {
  constructor(private client: OpenSeaClient) {}

  async all(
    collectionSlug: string,
    options?: { limit?: number; next?: string; maker?: string },
  ): Promise<{ listings: Listing[]; next?: string }> {
    return this.client.get(
      `/api/v2/listings/collection/${collectionSlug}/all`,
      {
        limit: options?.limit,
        next: options?.next,
        maker: options?.maker,
      },
    )
  }

  async best(
    collectionSlug: string,
    options?: { limit?: number; next?: string; traits?: TraitFilter[] },
  ): Promise<{ listings: Listing[]; next?: string }> {
    return this.client.get(
      `/api/v2/listings/collection/${collectionSlug}/best`,
      {
        limit: options?.limit,
        next: options?.next,
        traits: encodeTraits(options?.traits),
      },
    )
  }

  async bestForNFT(collectionSlug: string, tokenId: string): Promise<Listing> {
    return this.client.get(
      `/api/v2/listings/collection/${collectionSlug}/nfts/${tokenId}/best`,
    )
  }

  async sweep(
    request: SweepCollectionRequest,
  ): Promise<SweepCollectionResponse> {
    return this.client.post("/api/v2/listings/sweep", request)
  }

  async crossChainFulfillmentData(options: {
    listings: Array<{
      hash: string
      chain: string
      protocolAddress: string
    }>
    fulfillerAddress: string
    paymentChain: string
    paymentTokenAddress: string
    recipient?: string
  }): Promise<CrossChainFulfillmentResponse> {
    const body: Record<string, unknown> = {
      listings: options.listings.map(l => ({
        hash: l.hash,
        chain: l.chain,
        protocol_address: l.protocolAddress,
      })),
      fulfiller: { address: options.fulfillerAddress },
      payment: {
        chain: options.paymentChain,
        token_address: options.paymentTokenAddress,
      },
    }
    if (options.recipient) {
      body.recipient = options.recipient
    }
    return this.client.post(
      "/api/v2/listings/cross_chain_fulfillment_data",
      body,
    )
  }

  async actions(
    request: CreateListingActionsRequest,
  ): Promise<CreateListingActionsResponse> {
    return this.client.post("/api/v2/listings/actions", request)
  }
}

class OffersAPI {
  constructor(private client: OpenSeaClient) {}

  async all(
    collectionSlug: string,
    options?: { limit?: number; next?: string; maker?: string },
  ): Promise<{ offers: Offer[]; next?: string }> {
    return this.client.get(`/api/v2/offers/collection/${collectionSlug}/all`, {
      limit: options?.limit,
      next: options?.next,
      maker: options?.maker,
    })
  }

  async collection(
    collectionSlug: string,
    options?: { limit?: number; next?: string },
  ): Promise<{ offers: Offer[]; next?: string }> {
    return this.client.get(`/api/v2/offers/collection/${collectionSlug}`, {
      limit: options?.limit,
      next: options?.next,
    })
  }

  async byNFT(
    collectionSlug: string,
    tokenId: string,
    options?: { limit?: number; next?: string },
  ): Promise<{ offers: Offer[]; next?: string }> {
    return this.client.get(
      `/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}`,
      { limit: options?.limit, next: options?.next },
    )
  }

  async bestForNFT(collectionSlug: string, tokenId: string): Promise<Offer> {
    return this.client.get(
      `/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}/best`,
    )
  }

  async traits(
    collectionSlug: string,
    options: {
      type: string
      value: string
      limit?: number
      next?: string
    },
  ): Promise<{ offers: Offer[]; next?: string }> {
    return this.client.get(
      `/api/v2/offers/collection/${collectionSlug}/traits`,
      {
        type: options.type,
        value: options.value,
        limit: options.limit,
        next: options.next,
      },
    )
  }
}

class EventsAPI {
  constructor(private client: OpenSeaClient) {}

  async list(options?: {
    eventType?: EventType
    after?: number
    before?: number
    limit?: number
    next?: string
    chain?: Chain
  }): Promise<{ asset_events: AssetEvent[]; next?: string }> {
    return this.client.get("/api/v2/events", {
      event_type: options?.eventType,
      after: options?.after,
      before: options?.before,
      limit: options?.limit,
      next: options?.next,
      chain: options?.chain,
    })
  }

  async byAccount(
    address: string,
    options?: {
      eventType?: EventType
      limit?: number
      next?: string
      chain?: Chain
    },
  ): Promise<{ asset_events: AssetEvent[]; next?: string }> {
    return this.client.get(`/api/v2/events/accounts/${address}`, {
      event_type: options?.eventType,
      limit: options?.limit,
      next: options?.next,
      chain: options?.chain,
    })
  }

  async byCollection(
    collectionSlug: string,
    options?: {
      eventType?: EventType
      limit?: number
      next?: string
      traits?: TraitFilter[]
    },
  ): Promise<{ asset_events: AssetEvent[]; next?: string }> {
    return this.client.get(`/api/v2/events/collection/${collectionSlug}`, {
      event_type: options?.eventType,
      limit: options?.limit,
      next: options?.next,
      traits: encodeTraits(options?.traits),
    })
  }

  async byNFT(
    chain: Chain,
    address: string,
    identifier: string,
    options?: {
      eventType?: EventType
      limit?: number
      next?: string
    },
  ): Promise<{ asset_events: AssetEvent[]; next?: string }> {
    return this.client.get(
      `/api/v2/events/chain/${chain}/contract/${address}/nfts/${identifier}`,
      {
        event_type: options?.eventType,
        limit: options?.limit,
        next: options?.next,
      },
    )
  }
}

class AccountsAPI {
  constructor(private client: OpenSeaClient) {}

  async get(address: string): Promise<Account> {
    return this.client.get(`/api/v2/accounts/${address}`)
  }

  async markAgent(wallet: string): Promise<WalletAgentStatusResponse> {
    return this.client.put(
      `/api/v2/accounts/wallets/${encodeURIComponent(wallet)}/agent`,
    )
  }

  async removeAgent(wallet: string): Promise<WalletAgentStatusResponse> {
    return this.client.delete(
      `/api/v2/accounts/wallets/${encodeURIComponent(wallet)}/agent`,
    )
  }

  async tokens(
    address: string,
    options?: {
      chains?: string[]
      limit?: number
      sortBy?: TokenBalanceSortBy
      sortDirection?: "asc" | "desc"
      disableSpamFiltering?: boolean
      next?: string
    },
  ): Promise<TokenBalancePaginatedResponse> {
    return this.client.get(`/api/v2/account/${address}/tokens`, {
      chains: options?.chains?.join(","),
      limit: options?.limit,
      sort_by: options?.sortBy,
      sort_direction: options?.sortDirection,
      disable_spam_filtering: options?.disableSpamFiltering,
      cursor: options?.next,
    })
  }

  async resolve(identifier: string): Promise<AccountResolveResponse> {
    return this.client.get(`/api/v2/accounts/resolve/${identifier}`)
  }

  async portfolio(
    address: string,
    options?: { timeframe?: "HOUR" | "DAY" | "WEEK" | "MONTH" },
  ): Promise<PortfolioStatsResponse> {
    return this.client.get(`/api/v2/account/${address}/portfolio`, {
      timeframe: options?.timeframe,
    })
  }

  async portfolioHistory(
    address: string,
    options?: { timeframe?: "HOUR" | "DAY" | "WEEK" | "MONTH" },
  ): Promise<PortfolioHistoryResponse> {
    return this.client.get(`/api/v2/account/${address}/portfolio/history`, {
      timeframe: options?.timeframe,
    })
  }

  async pnl(address: string): Promise<WalletPnlResponse> {
    return this.client.get(`/api/v2/account/${address}/pnl`)
  }

  async closedPositions(
    address: string,
    options?: { sortBy?: string; limit?: number; next?: string },
  ): Promise<ClosedPositionsResponse> {
    return this.client.get(`/api/v2/account/${address}/pnl/closed-positions`, {
      sort_by: options?.sortBy,
      limit: options?.limit,
      next: options?.next,
    })
  }

  async tokenTransfers(
    address: string,
    options: {
      contractAddress: string
      chain: string
      limit?: number
      next?: string
    },
  ): Promise<PositionTokenTransfersResponse> {
    return this.client.get(`/api/v2/account/${address}/pnl/token-transfers`, {
      contract_address: options.contractAddress,
      chain: options.chain,
      limit: options.limit,
      next: options.next,
    })
  }

  async profileOffers(
    address: string,
    options?: {
      after?: string
      limit?: number
      collectionSlugs?: string[]
      chains?: string[]
      sortBy?: string
      sortDirection?: "asc" | "desc"
    },
  ): Promise<{ offers: Offer[]; next?: string }> {
    return this.client.get(`/api/v2/account/${address}/offers`, {
      after: options?.after,
      limit: options?.limit,
      collection_slugs: options?.collectionSlugs?.join(","),
      chains: options?.chains?.join(","),
      sort_by: options?.sortBy,
      sort_direction: options?.sortDirection,
    })
  }

  async profileOffersReceived(
    address: string,
    options?: {
      after?: string
      limit?: number
      collectionSlugs?: string[]
      chains?: string[]
      sortBy?: string
      sortDirection?: "asc" | "desc"
    },
  ): Promise<{ offers: Offer[]; next?: string }> {
    return this.client.get(`/api/v2/account/${address}/offers_received`, {
      after: options?.after,
      limit: options?.limit,
      collection_slugs: options?.collectionSlugs?.join(","),
      chains: options?.chains?.join(","),
      sort_by: options?.sortBy,
      sort_direction: options?.sortDirection,
    })
  }

  async profileListings(
    address: string,
    options?: {
      after?: string
      limit?: number
      collectionSlugs?: string[]
      chains?: string[]
      sortBy?: string
      sortDirection?: "asc" | "desc"
    },
  ): Promise<{ listings: Listing[]; next?: string }> {
    return this.client.get(`/api/v2/account/${address}/listings`, {
      after: options?.after,
      limit: options?.limit,
      collection_slugs: options?.collectionSlugs?.join(","),
      chains: options?.chains?.join(","),
      sort_by: options?.sortBy,
      sort_direction: options?.sortDirection,
    })
  }

  async profileFavorites(
    address: string,
    options?: {
      after?: string
      limit?: number
      sortBy?: string
      sortDirection?: "asc" | "desc"
      chains?: string[]
    },
  ): Promise<{ nfts: NFT[]; next?: string }> {
    return this.client.get(`/api/v2/account/${address}/favorites`, {
      after: options?.after,
      limit: options?.limit,
      sort_by: options?.sortBy,
      sort_direction: options?.sortDirection,
      chains: options?.chains?.join(","),
    })
  }

  async profileCollections(
    address: string,
    options?: {
      after?: string
      limit?: number
      chains?: string[]
    },
  ): Promise<ProfileCollectionsResponse> {
    return this.client.get(`/api/v2/account/${address}/collections`, {
      after: options?.after,
      limit: options?.limit,
      chains: options?.chains?.join(","),
    })
  }
}

class TokensAPI {
  constructor(private client: OpenSeaClient) {}

  async trending(options?: {
    limit?: number
    chains?: string[]
    next?: string
  }): Promise<{ tokens: Token[]; next?: string }> {
    // The tokens API uses "cursor" as its query param instead of "next".
    // The SDK accepts "next" for consistency with all other endpoints.
    return this.client.get("/api/v2/tokens/trending", {
      limit: options?.limit,
      chains: options?.chains?.join(","),
      cursor: options?.next,
    })
  }

  async top(options?: {
    limit?: number
    chains?: string[]
    next?: string
  }): Promise<{ tokens: Token[]; next?: string }> {
    // The tokens API uses "cursor" as its query param instead of "next".
    // The SDK accepts "next" for consistency with all other endpoints.
    return this.client.get("/api/v2/tokens/top", {
      limit: options?.limit,
      chains: options?.chains?.join(","),
      cursor: options?.next,
    })
  }

  async get(chain: Chain, address: string): Promise<TokenDetails> {
    return this.client.get(`/api/v2/chain/${chain}/token/${address}`)
  }

  async batch(request: BatchTokensRequest): Promise<TokenBatchResponse> {
    return this.client.post("/api/v2/tokens/batch", request)
  }

  async priceHistory(
    chain: Chain,
    address: string,
    options: {
      startTime: string
      endTime?: string
      bucketSize?: string
    },
  ): Promise<PriceHistoryResponse> {
    return this.client.get(
      `/api/v2/chain/${chain}/token/${address}/price_history`,
      {
        start_time: options.startTime,
        end_time: options.endTime,
        bucket_size: options.bucketSize,
      },
    )
  }

  async ohlcv(
    chain: Chain,
    address: string,
    options: {
      startTime: string
      bucketSize: string
      endTime?: string
      fillTimeWindow?: boolean
    },
  ): Promise<OhlcvResponse> {
    return this.client.get(`/api/v2/chain/${chain}/token/${address}/ohlcv`, {
      start_time: options.startTime,
      bucket_size: options.bucketSize,
      end_time: options.endTime,
      fill_time_window: options.fillTimeWindow,
    })
  }

  async activity(
    chain: Chain,
    address: string,
    options?: { limit?: number; next?: string },
  ): Promise<TokenSwapActivityPaginatedResponse> {
    return this.client.get(`/api/v2/chain/${chain}/token/${address}/activity`, {
      limit: options?.limit,
      cursor: options?.next,
    })
  }

  async activityStats(
    chain: Chain,
    address: string,
    options?: { windows?: TokenActivityStatsWindow[] },
  ): Promise<TokenActivityStatsResponse> {
    return this.client.get(
      `/api/v2/chain/${chain}/token/${address}/activity/stats`,
      { windows: options?.windows?.join(",") },
    )
  }

  async accountActivity(
    address: string,
    options?: {
      chains?: string[]
      tokens?: string[]
      type?: string[]
      limit?: number
      next?: string
    },
  ): Promise<TokenAccountActivityPaginatedResponse> {
    return this.client.get(`/api/v2/account/${address}/token-activity`, {
      chains: options?.chains?.join(","),
      tokens: options?.tokens?.join(","),
      type: options?.type?.join(","),
      limit: options?.limit,
      next: options?.next,
    })
  }

  async holders(
    chain: Chain,
    address: string,
    options?: {
      limit?: number
      next?: string
      sortBy?: "QUANTITY"
      sortDirection?: "asc" | "desc"
    },
  ): Promise<TokenHoldersResponse> {
    return this.client.get(`/api/v2/chain/${chain}/token/${address}/holders`, {
      limit: options?.limit,
      cursor: options?.next,
      sort_by: options?.sortBy,
      sort_direction: options?.sortDirection,
    })
  }

  async liquidityPools(
    chain: Chain,
    address: string,
    options?: { limit?: number },
  ): Promise<TokenLiquidityPoolsResponse> {
    return this.client.get(
      `/api/v2/chain/${chain}/token/${address}/liquidity-pools`,
      {
        limit: options?.limit,
      },
    )
  }
}

class SearchAPI {
  constructor(private client: OpenSeaClient) {}

  async query(
    query: string,
    options?: {
      assetTypes?: SearchAssetType[]
      chains?: string[]
      limit?: number
    },
  ): Promise<SearchResponse> {
    return this.client.get<SearchResponse>("/api/v2/search", {
      query,
      asset_types: options?.assetTypes?.join(","),
      chains: options?.chains?.join(","),
      limit: options?.limit,
    })
  }
}

export class SwapsAPI {
  constructor(private client: OpenSeaClient) {}

  async quote(options: {
    fromChain: string
    fromAddress: string
    toChain: string
    toAddress: string
    quantity: string
    address: string
    slippage?: number
    recipient?: string
  }): Promise<SwapQuoteResponse> {
    return this.client.get("/api/v2/swap/quote", {
      from_chain: options.fromChain,
      from_address: options.fromAddress,
      to_chain: options.toChain,
      to_address: options.toAddress,
      quantity: options.quantity,
      address: options.address,
      slippage: options.slippage,
      recipient: options.recipient,
    })
  }

  /**
   * Get a swap quote and execute all transactions using the provided wallet adapter.
   * Returns an array of transaction results (one per transaction in the quote).
   *
   * @param options - Swap parameters (chains, addresses, quantity, etc.)
   * @param wallet - Wallet adapter to sign and send transactions
   * @param callbacks - Optional callbacks for progress reporting and skipped txs
   */
  async execute(
    options: {
      fromChain: string
      fromAddress: string
      toChain: string
      toAddress: string
      quantity: string
      slippage?: number
      recipient?: string
      address?: string
    },
    wallet: WalletAdapter,
    callbacks?: {
      onQuote?: (quote: SwapQuoteResponse) => void
      onSending?: (tx: { to: string; chain: string; chainId: number }) => void
      onSkipped?: (tx: { chain: string; reason: string }) => void
    },
  ): Promise<TransactionResult[]> {
    const address = options.address ?? (await wallet.getAddress())
    const quote = await this.quote({ ...options, address })

    callbacks?.onQuote?.(quote)

    if (!quote.transactions || quote.transactions.length === 0) {
      throw new Error(
        "Swap quote returned zero transactions — the swap may not be available for these tokens/chains.",
      )
    }

    const results: TransactionResult[] = []

    for (const tx of quote.transactions) {
      if (!tx.to) {
        callbacks?.onSkipped?.({
          chain: tx.chain,
          reason: "missing 'to' address",
        })
        continue
      }
      const chainId = resolveChainId(tx.chain)
      callbacks?.onSending?.({ to: tx.to, chain: tx.chain, chainId })
      const result = await wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value ?? "0",
        chainId,
      })
      results.push(result)
    }

    if (results.length === 0) {
      throw new Error(
        "All swap transactions were skipped (no valid 'to' addresses). The quote may be malformed.",
      )
    }

    return results
  }

  /**
   * Multi-asset swap: get executable transactions for token-to-token swaps with
   * arbitrary numbers of from/to assets. Returns the quote alongside the
   * transactions to sign and submit. POST /api/v2/swap/execute.
   */
  async executeMulti(
    request: SwapExecuteRequest,
  ): Promise<SwapExecuteResponse> {
    return this.client.post("/api/v2/swap/execute", request)
  }
}

export class TransactionsAPI {
  constructor(private client: OpenSeaClient) {}

  /**
   * Fetch the receipt/status for a submitted transaction. Works for all
   * transaction types: listing fulfillments, cross-chain buys and mints, sweeps,
   * offer fulfillments, and token swaps.
   */
  async receipt(
    request: TransactionReceiptRequest,
  ): Promise<TransactionReceiptResponse> {
    return this.client.post("/api/v2/transactions/receipt", request)
  }
}

export class AssetsAPI {
  constructor(private client: OpenSeaClient) {}

  /**
   * Build transactions to transfer NFTs or fungible tokens between wallets.
   * Returns an ordered list of transactions to submit onchain.
   */
  async transfer(request: TransferRequest): Promise<TransferResponse> {
    return this.client.post("/api/v2/assets/transfer", request)
  }
}

class ToolsAPI {
  constructor(private client: OpenSeaClient) {}

  async search(options?: {
    query?: string
    registryChain?: string
    tags?: string[]
    accessType?: string
    creator?: string
    sortBy?: string
    limit?: number
    next?: string
  }): Promise<ToolSearchPaginatedResponse> {
    return this.client.get<ToolSearchPaginatedResponse>(
      "/api/v2/tools/search",
      {
        query: options?.query,
        registry_chain: options?.registryChain,
        tags: options?.tags?.join(","),
        access_type: options?.accessType,
        creator: options?.creator,
        sort_by: options?.sortBy,
        limit: options?.limit,
        cursor: options?.next,
      },
    )
  }

  async get(
    registryChain: string,
    registryAddr: string,
    toolId: string,
  ): Promise<RegisteredToolResponse> {
    return this.client.get<RegisteredToolResponse>(
      `/api/v2/tools/${registryChain}/${registryAddr}/${toolId}`,
    )
  }

  async list(options?: {
    sortBy?: string
    type?: string
    limit?: number
    next?: string
  }): Promise<ToolListPaginatedResponse> {
    return this.client.get<ToolListPaginatedResponse>("/api/v2/tools", {
      sort_by: options?.sortBy,
      type: options?.type,
      limit: options?.limit,
      cursor: options?.next,
    })
  }

  async activity(
    registryChain: string,
    registryAddr: string,
    toolId: string,
    options?: {
      includeCreatorPayments?: boolean
      limit?: number
      offset?: number
    },
  ): Promise<ToolActivityPaginatedResponse> {
    return this.client.get<ToolActivityPaginatedResponse>(
      `/api/v2/tools/${registryChain}/${registryAddr}/${toolId}/activity`,
      {
        include_creator_payments: options?.includeCreatorPayments,
        limit: options?.limit,
        offset: options?.offset,
      },
    )
  }
}

class HealthAPI {
  constructor(private client: OpenSeaClient) {}

  async check(): Promise<HealthResult> {
    return checkHealth(this.client)
  }
}
