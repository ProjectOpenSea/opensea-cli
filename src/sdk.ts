import { OpenSeaClient } from "./client.js"
import type {
  Account,
  AssetEvent,
  Chain,
  Collection,
  CollectionOrderBy,
  CollectionStats,
  Contract,
  EventType,
  GetTraitsResponse,
  Listing,
  NFT,
  Offer,
  OpenSeaClientConfig,
  SearchAssetType,
  SearchResponse,
  SwapQuoteResponse,
  Token,
  TokenDetails,
} from "./types/index.js"

export class OpenSeaCLI {
  private client: OpenSeaClient

  readonly collections: CollectionsAPI
  readonly nfts: NFTsAPI
  readonly listings: ListingsAPI
  readonly offers: OffersAPI
  readonly events: EventsAPI
  readonly accounts: AccountsAPI
  readonly tokens: TokensAPI
  readonly search: SearchAPI
  readonly swaps: SwapsAPI

  constructor(config: OpenSeaClientConfig) {
    this.client = new OpenSeaClient(config)
    this.collections = new CollectionsAPI(this.client)
    this.nfts = new NFTsAPI(this.client)
    this.listings = new ListingsAPI(this.client)
    this.offers = new OffersAPI(this.client)
    this.events = new EventsAPI(this.client)
    this.accounts = new AccountsAPI(this.client)
    this.tokens = new TokensAPI(this.client)
    this.search = new SearchAPI(this.client)
    this.swaps = new SwapsAPI(this.client)
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

class SwapsAPI {
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
}
