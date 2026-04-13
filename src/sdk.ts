import { OpenSeaClient } from "./client.js"
import { checkHealth } from "./health.js"
import type {
  Account,
  AccountResolveResponse,
  AssetEvent,
  Chain,
  ChainListResponse,
  Collection,
  CollectionOrderBy,
  CollectionPaginatedResponse,
  CollectionStats,
  Contract,
  DropDetailedResponse,
  DropMintResponse,
  DropPaginatedResponse,
  EventType,
  GetTraitsResponse,
  HealthResult,
  Listing,
  NFT,
  Offer,
  OpenSeaClientConfig,
  SearchAssetType,
  SearchResponse,
  SwapQuoteResponse,
  Token,
  TokenBalancePaginatedResponse,
  TokenBalanceSortBy,
  TokenDetails,
  ValidateMetadataResponse,
} from "./types/index.js"
import type { TransactionResult, WalletAdapter } from "./wallet/index.js"
import { resolveChainId } from "./wallet/index.js"

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
    options?: { limit?: number; next?: string },
  ): Promise<{ nfts: NFT[]; next?: string }> {
    return this.client.get(`/api/v2/collection/${slug}/nfts`, {
      limit: options?.limit,
      next: options?.next,
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
}

class ListingsAPI {
  constructor(private client: OpenSeaClient) {}

  async all(
    collectionSlug: string,
    options?: { limit?: number; next?: string },
  ): Promise<{ listings: Listing[]; next?: string }> {
    return this.client.get(
      `/api/v2/listings/collection/${collectionSlug}/all`,
      { limit: options?.limit, next: options?.next },
    )
  }

  async best(
    collectionSlug: string,
    options?: { limit?: number; next?: string },
  ): Promise<{ listings: Listing[]; next?: string }> {
    return this.client.get(
      `/api/v2/listings/collection/${collectionSlug}/best`,
      { limit: options?.limit, next: options?.next },
    )
  }

  async bestForNFT(collectionSlug: string, tokenId: string): Promise<Listing> {
    return this.client.get(
      `/api/v2/listings/collection/${collectionSlug}/nfts/${tokenId}/best`,
    )
  }
}

class OffersAPI {
  constructor(private client: OpenSeaClient) {}

  async all(
    collectionSlug: string,
    options?: { limit?: number; next?: string },
  ): Promise<{ offers: Offer[]; next?: string }> {
    return this.client.get(`/api/v2/offers/collection/${collectionSlug}/all`, {
      limit: options?.limit,
      next: options?.next,
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
    },
  ): Promise<{ asset_events: AssetEvent[]; next?: string }> {
    return this.client.get(`/api/v2/events/collection/${collectionSlug}`, {
      event_type: options?.eventType,
      limit: options?.limit,
      next: options?.next,
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
}

class HealthAPI {
  constructor(private client: OpenSeaClient) {}

  async check(): Promise<HealthResult> {
    return checkHealth(this.client)
  }
}
