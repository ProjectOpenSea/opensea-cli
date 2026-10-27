import { randomUUID } from "node:crypto"
import { uploadToContext } from "@opensea/sdk"
import { OpenSeaClient } from "./client.js"
import { checkHealth } from "./health.js"
import { pathSegment } from "./parse.js"
import type {
  Account,
  AccountResolveResponse,
  AgentAccountStatusResponse,
  AgentProfileRelationshipsResponse,
  AgentRelationshipListResponse,
  AgentRelationshipMutationResponse,
  AgentRelationshipRemovalResponse,
  AgentRelationshipRole,
  AssetEvent,
  AssetMetadataResponse,
  BatchCollectionsRequest,
  BatchNftsRequest,
  BatchTokensRequest,
  BuildOfferRequest,
  BuildOfferResponse,
  Chain,
  ChainListResponse,
  ClosedPositionsResponse,
  Collection,
  CollectionBatchResponse,
  CollectionDetailedResponse,
  CollectionHoldersPaginatedResponse,
  CollectionOfferAggregatesPaginatedResponse,
  CollectionOrderBy,
  CollectionPageMetadataResponse,
  CollectionPaginatedResponse,
  CollectionPfpProfilesResponse,
  CollectionRefreshResponse,
  CollectionStats,
  CollectionTransactionResponse,
  CollectionTransactionsResponse,
  Contract,
  CreateCancelOrderActionsRequest,
  CreateCancelOrderActionsResponse,
  CreateListingActionsRequest,
  CreateListingActionsResponse,
  CreateListingFulfillmentActionsRequest,
  CreateListingFulfillmentActionsResponse,
  CreateOfferActionsRequest,
  CreateOfferActionsResponse,
  CreateOfferFulfillmentActionsRequest,
  CreateOfferFulfillmentActionsResponse,
  CreatorFeeEnforcementStatusResponse,
  CriteriaOfferRequest,
  CrossChainDropMintRequest,
  CrossChainDropMintResponse,
  CrossChainFulfillmentResponse,
  DropDeployReceiptResponse,
  DropDeployRequest,
  DropDeployResponse,
  DropDetailedResponse,
  DropItemsPaginatedResponse,
  DropMetadataUploadProgressResponse,
  DropMetadataUploadResponse,
  DropMintResponse,
  DropPaginatedResponse,
  DropTransactionResponse,
  EventType,
  FloorPriceHistoryResponse,
  FulfillListingResponse,
  GetOrderResponse,
  GetTraitsResponse,
  HealthResult,
  Listing,
  ListingFulfillmentDataRequest,
  NFT,
  NftAnalyticsResponse,
  NftBatchResponse,
  Offer,
  OfferFulfillmentDataRequest,
  OhlcvResponse,
  OpenSeaClientConfig,
  OwnersPaginatedResponse,
  PaymentToken,
  PortfolioHistoryResponse,
  PortfolioStatsResponse,
  PositionTokenTransfersResponse,
  PriceHistoryResponse,
  ProfileCollectionsResponse,
  RegisteredToolResponse,
  SaveDropItemMediaBatchRequest,
  SaveDropItemMediaResponse,
  SearchAssetType,
  SearchResponse,
  SetCollectionPricingCurrencyResponse,
  SignedOrderRequest,
  StandardizedNftFacetsResponse,
  StandardizedNftListResponse,
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
  ToolUsageRequest,
  ToolUsageResponse,
  TopPfpCollectionsResponse,
  TraitFilter,
  TraitFloorsResponse,
  TransactionReceiptRequest,
  TransactionReceiptResponse,
  TransferRequest,
  TransferResponse,
  UploadContext,
  UploadDropItemMediaRequest,
  ValidateMetadataResponse,
  WalletPnlResponse,
  WalletVisibilityResponse,
} from "./types/index.js"
import type {
  EvmWalletAdapter,
  TransactionResult,
  WalletAdapter,
} from "./wallet/index.js"
import { requireEvmAdapter, resolveChainId } from "./wallet/index.js"

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
    `/api/v2/chain/${pathSegment(chain)}/token/${pathSegment(tokenAddress)}`,
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
  readonly orders: OrdersAPI
  readonly events: EventsAPI
  readonly accounts: AccountsAPI
  readonly agent: AgentAPI
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
    this.orders = new OrdersAPI(this.client)
    this.events = new EventsAPI(this.client)
    this.accounts = new AccountsAPI(this.client)
    this.agent = new AgentAPI(this.client)
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

export class CollectionsAPI {
  constructor(private client: OpenSeaClient) {}

  async get(slug: string): Promise<Collection> {
    return this.client.get<Collection>(
      `/api/v2/collections/${pathSegment(slug)}`,
    )
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
    return this.client.get<CollectionStats>(
      `/api/v2/collections/${pathSegment(slug)}/stats`,
    )
  }

  async traits(slug: string): Promise<GetTraitsResponse> {
    return this.client.get<GetTraitsResponse>(
      `/api/v2/traits/${pathSegment(slug)}`,
    )
  }

  /** Floor price per text trait value with at least one active listing. */
  async traitFloors(slug: string): Promise<TraitFloorsResponse> {
    return this.client.get(`/api/v2/traits/${pathSegment(slug)}/floors`)
  }

  async pfpProfiles(
    slug: string,
    options?: { limit?: number; next?: string },
  ): Promise<CollectionPfpProfilesResponse> {
    return this.client.get(
      `/api/v2/collections/${pathSegment(slug)}/pfp-profiles`,
      { limit: options?.limit, cursor: options?.next },
    )
  }

  /**
   * Collections ranked by verified NFT profile-picture wearer count. `limit`
   * (1-50) is required; omit `chain` to rank across every chain.
   */
  async topPfp(options: {
    limit: number
    chain?: Chain
  }): Promise<TopPfpCollectionsResponse> {
    return this.client.get("/api/v2/pfp/top-collections", {
      limit: options.limit,
      chains: options.chain,
    })
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
    return this.client.get(
      `/api/v2/collections/${pathSegment(slug)}/offer_aggregates`,
      {
        limit: options?.limit,
        cursor: options?.next,
        sort_direction: options?.sortDirection,
      },
    )
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
    return this.client.get(`/api/v2/collections/${pathSegment(slug)}/holders`, {
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
    return this.client.get(
      `/api/v2/collections/${pathSegment(slug)}/floor_prices`,
      {
        timeframe: options?.timeframe,
        resolution: options?.resolution,
      },
    )
  }

  /**
   * The collection page as saved: hero, about and overview, in the shape of
   * the `update-metadata` request body, plus the page's preview URL.
   */
  async pageMetadata(slug: string): Promise<CollectionPageMetadataResponse> {
    return this.client.get(`/api/v2/collections/${pathSegment(slug)}/metadata`)
  }

  /**
   * Request an upload context for an image or MP4 video on the collection
   * page. `placement` is one of hero_desktop, hero_mobile, about_preview,
   * about_section, overview, overview_background or team. Pass the token
   * from the upload in the metadata update as `{ image: { token } }` or
   * `{ video: { token } }`.
   */
  async createPageMediaUpload(
    slug: string,
    placement: string,
    contentType: string,
  ): Promise<UploadContext> {
    return this.client.post(
      `/api/v2/collections/${pathSegment(slug)}/media/${pathSegment(placement)}?content_type=${encodeURIComponent(contentType)}`,
    )
  }

  /**
   * Price secondary sales in the chain's USD stablecoin (USDG on Robinhood
   * Chain) or its native currency. `workflow_id` is null when the collection
   * is already priced that way.
   */
  async setPricingCurrency(
    slug: string,
    useStablecoin: boolean,
  ): Promise<SetCollectionPricingCurrencyResponse> {
    return this.client.post(
      `/api/v2/collections/${pathSegment(slug)}/pricing_currency`,
      { use_stablecoin: useStablecoin },
    )
  }

  async creatorFeeEnforcement(
    slug: string,
  ): Promise<CreatorFeeEnforcementStatusResponse> {
    return this.client.get(
      `/api/v2/collections/${pathSegment(slug)}/creator_fee_enforcement`,
    )
  }

  /**
   * Build the transactions that turn creator fee enforcement on or off. Send
   * them in order from each one's `from`, the contract's onchain owner. The
   * list is empty when the contract is already in the requested state.
   */
  async buildCreatorFeeEnforcementTransactions(
    slug: string,
    enabled: boolean,
  ): Promise<CollectionTransactionsResponse> {
    return this.client.post(
      `/api/v2/collections/${pathSegment(slug)}/creator_fee_enforcement`,
      { enabled },
    )
  }

  /**
   * Sign and send collection transactions in order, one at a time. Refuses
   * the whole list before sending anything when the wallet is not every
   * transaction's `from`, since a transaction from any other address
   * reverts. `onSent` fires after each send, so a caller can report the
   * hashes already onchain when a later send fails.
   */
  async sendTransactions(
    txs: CollectionTransactionResponse[],
    wallet: WalletAdapter,
    callbacks?: {
      onSending?: (tx: { to: string; chain: string; chainId: number }) => void
      onSent?: (result: TransactionResult) => void
    },
  ): Promise<TransactionResult[]> {
    const evmWallet = requireEvmAdapter(wallet, "collection transactions")
    const address = (await evmWallet.getAddress()).toLowerCase()
    const foreign = txs.find(tx => tx.from.toLowerCase() !== address)
    if (foreign) {
      throw new Error(
        `Wallet ${address} is not the contract owner ${foreign.from}. The transaction must be sent from ${foreign.from}, or it reverts.`,
      )
    }
    const results: TransactionResult[] = []
    for (const tx of txs) {
      const result = await sendDropTransaction(evmWallet, tx, callbacks)
      callbacks?.onSent?.(result)
      results.push(result)
    }
    return results
  }

  /** Queue a refresh of the collection's metadata from its contract. */
  async refresh(slug: string): Promise<CollectionRefreshResponse> {
    return this.client.post(`/api/v2/collections/${pathSegment(slug)}/refresh`)
  }
}

/**
 * Send a drop transaction from `wallet`. Drop endpoints return `value` as
 * decimal or hex wei; the wallet gets decimal wei either way.
 */
function sendDropTransaction(
  wallet: EvmWalletAdapter,
  tx: { to: string; data: string; value: string; chain: string },
  callbacks?: {
    onSending?: (tx: { to: string; chain: string; chainId: number }) => void
  },
): Promise<TransactionResult> {
  let value: string
  try {
    value = BigInt(tx.value).toString()
  } catch {
    throw new Error(`Drop transaction has an invalid value: ${tx.value}`)
  }
  const chainId = resolveChainId(tx.chain)
  callbacks?.onSending?.({ to: tx.to, chain: tx.chain, chainId })
  return wallet.sendTransaction({ to: tx.to, data: tx.data, value, chainId })
}

/** Poll interval and timeout for the drop wait helpers, validated. */
function pollTiming(options?: { intervalMs?: number; timeoutMs?: number }): {
  intervalMs: number
  timeoutMs: number
} {
  const intervalMs = options?.intervalMs ?? 5_000
  const timeoutMs = options?.timeoutMs ?? 600_000
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new RangeError(
      `intervalMs must be a positive number, got ${intervalMs}`,
    )
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError(
      `timeoutMs must be a non-negative number, got ${timeoutMs}`,
    )
  }
  return { intervalMs, timeoutMs }
}

/** Most filenames one `createItemMediaUpload` request takes. */
const ITEM_MEDIA_UPLOAD_CHUNK_SIZE = 50
/** Most filenames one `saveItemMediaBatch` request takes. */
const ITEM_MEDIA_BATCH_MAX_FILES = 15_000

/**
 * A file for `DropsAPI.uploadItemMedia`. `data` may be a function, called
 * only when that file is uploaded, so a large drop is never held in memory at
 * once.
 */
export interface DropUploadFile {
  /** Name the file is uploaded and saved under, such as `1.png`. */
  filename: string
  data: Blob | (() => Blob | Promise<Blob>)
}

export interface UploadItemMediaResult {
  /** The batch the files were uploaded in and saved from. */
  upload_batch_id: string
  /** Number of items saved. */
  item_count: number
  success: boolean
}

/**
 * Run `task` for indexes 0 to `count - 1`, at most `concurrency` at a time.
 * The first failure stops new tasks from starting and is rethrown once the
 * running ones settle.
 */
async function runWithConcurrency(
  count: number,
  concurrency: number,
  task: (index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  let failure: { error: unknown } | undefined
  const worker = async () => {
    while (!failure && next < count) {
      const index = next++
      try {
        await task(index)
      } catch (error) {
        failure ??= { error }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, count) }, worker),
  )
  if (failure) throw failure.error
}

export class DropsAPI {
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
    return this.client.get(`/api/v2/drops/${pathSegment(slug)}`)
  }

  /** The drop's saved items, including a draft's, one page at a time. */
  async items(
    slug: string,
    options?: { limit?: number; next?: string },
  ): Promise<DropItemsPaginatedResponse> {
    return this.client.get(`/api/v2/drops/${pathSegment(slug)}/items`, {
      limit: options?.limit,
      next: options?.next,
    })
  }

  async mint(
    slug: string,
    options: { minter: string; quantity?: number },
  ): Promise<DropMintResponse> {
    return this.client.post(`/api/v2/drops/${pathSegment(slug)}/mint`, {
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
    return this.client.post(
      `/api/v2/drops/${pathSegment(slug)}/cross_chain_mint`,
      request,
    )
  }

  async deploy(request: DropDeployRequest): Promise<DropDeployResponse> {
    return this.client.post("/api/v2/drops/deploy", request)
  }

  async deployReceipt(
    chain: Chain,
    txHash: string,
  ): Promise<DropDeployReceiptResponse> {
    return this.client.get(
      `/api/v2/drops/deploy/${pathSegment(chain)}/${pathSegment(txHash)}/receipt`,
    )
  }

  /**
   * Sign and send a deploy transaction built by `deploy`. `sender` is the
   * `sender` the deploy was requested for; a wallet with any other address is
   * refused, since the API built the deploy for that address. The deploy
   * response carries `value` as hex wei, and it is passed to the wallet as
   * decimal wei like every other drop transaction.
   */
  async sendDeployTransaction(
    tx: DropDeployResponse,
    sender: string,
    wallet: WalletAdapter,
    callbacks?: {
      onSending?: (tx: { to: string; chain: string; chainId: number }) => void
    },
  ): Promise<TransactionResult> {
    const evmWallet = requireEvmAdapter(wallet, "drop deploy")
    const address = await evmWallet.getAddress()
    if (address.toLowerCase() !== sender.toLowerCase()) {
      throw new Error(
        `Wallet ${address} is not the deploy sender ${sender}. The deploy was built for ${sender}; send it from that wallet, or request a new deploy with the wallet's address as sender.`,
      )
    }
    const { to } = tx
    if (to === null) {
      throw new Error(
        "This deploy is a contract-creation transaction with no `to` address, which the wallet adapters cannot send yet. Run without --send and broadcast it with no `to` from your own wallet, or deploy with token_type erc721_clone.",
      )
    }
    return sendDropTransaction(evmWallet, { ...tx, to }, callbacks)
  }

  /**
   * Sign and send a mint transaction built by `mint`. Any EVM wallet can send
   * it: the request's `minter` receives the tokens, whoever pays.
   */
  async sendMintTransaction(
    tx: DropMintResponse,
    wallet: WalletAdapter,
    callbacks?: {
      onSending?: (tx: { to: string; chain: string; chainId: number }) => void
    },
  ): Promise<TransactionResult> {
    const evmWallet = requireEvmAdapter(wallet, "drop mint")
    return sendDropTransaction(evmWallet, tx, callbacks)
  }

  /**
   * Poll a deploy receipt until it reports a collection slug or a `failed`
   * status, and return that receipt. A `success` receipt without a slug keeps
   * polling, since the collection can materialize after the contract lands.
   * Throws when `timeoutMs` passes first.
   */
  async waitForDeployReceipt(
    chain: Chain,
    txHash: string,
    options?: {
      intervalMs?: number
      timeoutMs?: number
      onProgress?: (receipt: DropDeployReceiptResponse) => void
    },
  ): Promise<DropDeployReceiptResponse> {
    const { intervalMs, timeoutMs } = pollTiming(options)
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const receipt = await this.deployReceipt(chain, txHash)
      options?.onProgress?.(receipt)
      if (receipt.status === "failed" || receipt.collection_slug) {
        return receipt
      }
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        const detail = receipt.contract_address
          ? `the contract is at ${receipt.contract_address} but its collection slug has not appeared yet`
          : `its status is still ${receipt.status}`
        throw new Error(
          `Timed out after ${timeoutMs}ms waiting for deploy ${txHash}; ${detail}`,
        )
      }
      await new Promise(resolve =>
        setTimeout(resolve, Math.min(intervalMs, remainingMs)),
      )
    }
  }

  /**
   * Build the transaction that publishes the drop's saved draft onchain. Send
   * it from `from`, the contract's onchain owner, with `sendTransaction`.
   */
  async buildPublishTransaction(
    slug: string,
  ): Promise<DropTransactionResponse> {
    return this.client.post(`/api/v2/drops/${pathSegment(slug)}/publish`)
  }

  async buildUnpublishTransaction(
    slug: string,
  ): Promise<DropTransactionResponse> {
    return this.client.post(`/api/v2/drops/${pathSegment(slug)}/unpublish`)
  }

  /**
   * Sign and send a publish or unpublish transaction. Refuses a wallet whose
   * address is not the transaction's `from`: the API sets `from` to the
   * contract's onchain owner, and a transaction from any other address
   * reverts.
   */
  async sendTransaction(
    tx: DropTransactionResponse,
    wallet: WalletAdapter,
    callbacks?: {
      onSending?: (tx: { to: string; chain: string; chainId: number }) => void
    },
  ): Promise<TransactionResult> {
    const evmWallet = requireEvmAdapter(wallet, "drop transactions")
    const address = await evmWallet.getAddress()
    if (address.toLowerCase() !== tx.from.toLowerCase()) {
      throw new Error(
        `Wallet ${address} is not the contract owner ${tx.from}. The transaction must be sent from ${tx.from}, or it reverts.`,
      )
    }
    return sendDropTransaction(evmWallet, tx, callbacks)
  }

  /** Start uploading the drop's item media and metadata to IPFS. */
  async uploadMetadataToIpfs(
    slug: string,
  ): Promise<DropMetadataUploadResponse> {
    return this.client.post(`/api/v2/drops/${pathSegment(slug)}/metadata/ipfs`)
  }

  async getMetadataIpfsProgress(
    slug: string,
    workflowExecutionId: string,
  ): Promise<DropMetadataUploadProgressResponse> {
    return this.client.get(
      `/api/v2/drops/${pathSegment(slug)}/metadata/ipfs/${pathSegment(workflowExecutionId)}`,
    )
  }

  /**
   * Poll an IPFS metadata upload until its status is no longer `running`, and
   * return that final progress. Throws when `timeoutMs` passes first.
   */
  async waitForMetadataIpfs(
    slug: string,
    workflowExecutionId: string,
    options?: {
      intervalMs?: number
      timeoutMs?: number
      onProgress?: (progress: DropMetadataUploadProgressResponse) => void
    },
  ): Promise<DropMetadataUploadProgressResponse> {
    const { intervalMs, timeoutMs } = pollTiming(options)
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const progress = await this.getMetadataIpfsProgress(
        slug,
        workflowExecutionId,
      )
      options?.onProgress?.(progress)
      if (progress.status !== "running") return progress
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        throw new Error(
          `Timed out after ${timeoutMs}ms waiting for IPFS upload ${workflowExecutionId}; it is still running`,
        )
      }
      await new Promise(resolve =>
        setTimeout(resolve, Math.min(intervalMs, remainingMs)),
      )
    }
  }

  /**
   * Request an upload context for the drop's metadata manifest CSV. Upload
   * the file with `uploadToContext`; the token is not passed to a later call.
   */
  async createManifestUpload(slug: string): Promise<UploadContext> {
    return this.client.post(`/api/v2/drops/${pathSegment(slug)}/items/manifest`)
  }

  /**
   * Request upload contexts for up to 50 item media files, one per filename
   * in the same order. To save the items in bulk, pass the same
   * `upload_batch_id` on every request for one set of files, then save them
   * with `saveItemMediaBatch`. `uploadItemMedia` does all of this.
   */
  async createItemMediaUpload(
    slug: string,
    request: UploadDropItemMediaRequest,
  ): Promise<UploadContext[]> {
    return this.client.post(
      `/api/v2/drops/${pathSegment(slug)}/items/media`,
      request,
    )
  }

  /**
   * Save the drop's items from files uploaded with one `upload_batch_id`,
   * naming them by filename (up to 15,000). Each save replaces the drop's
   * items. A manifest uploaded with `createManifestUpload` supplies token ids
   * and metadata; without one, items are numbered 1 to n in the order of
   * `filenames`.
   */
  async saveItemMediaBatch(
    slug: string,
    request: SaveDropItemMediaBatchRequest,
  ): Promise<SaveDropItemMediaResponse> {
    return this.client.post(
      `/api/v2/drops/${pathSegment(slug)}/items/media/save-batch`,
      request,
    )
  }

  /**
   * Upload a set of item media files and save them as the drop's items, in
   * one upload batch. It uses `uploadBatchId`, or a new UUID, on every upload
   * request, requests upload contexts 50 files at a time and uploads each
   * chunk before requesting the next (the contexts are short-lived), then
   * saves every file by filename with `saveItemMediaBatch`. With `manifest`,
   * the manifest CSV is uploaded first so the save reads it; without one,
   * items are numbered 1 to n in the order of `files`.
   *
   * Filenames must be unique, and the API's filename rules apply (see
   * `UploadDropItemMediaRequest`). The save replaces the drop's items.
   */
  async uploadItemMedia(
    slug: string,
    files: DropUploadFile[],
    options?: {
      uploadBatchId?: string
      manifest?: DropUploadFile
      /** Storage uploads to run at once. Defaults to 4. */
      concurrency?: number
      onProgress?: (progress: { uploaded: number; total: number }) => void
      signal?: AbortSignal
    },
  ): Promise<UploadItemMediaResult> {
    const concurrency = options?.concurrency ?? 4
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError(
        `concurrency must be a positive integer, got ${concurrency}`,
      )
    }
    if (files.length === 0) {
      throw new Error("No item media files to upload")
    }
    if (files.length > ITEM_MEDIA_BATCH_MAX_FILES) {
      throw new Error(
        `A batch save takes at most ${ITEM_MEDIA_BATCH_MAX_FILES} files, got ${files.length}`,
      )
    }
    const filenames = files.map(file => file.filename)
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const name of filenames) {
      if (seen.has(name)) duplicates.add(name)
      seen.add(name)
    }
    if (duplicates.size > 0) {
      throw new Error(
        `Filenames must be unique; listed more than once: ${[...duplicates].join(", ")}`,
      )
    }

    const uploadBatchId = options?.uploadBatchId ?? randomUUID()
    const signal = options?.signal
    const readData = async (file: DropUploadFile) =>
      typeof file.data === "function" ? await file.data() : file.data

    if (options?.manifest) {
      const context = await this.createManifestUpload(slug)
      await uploadToContext(context, await readData(options.manifest), {
        filename: options.manifest.filename,
        signal,
      })
    }

    let uploaded = 0
    for (
      let start = 0;
      start < files.length;
      start += ITEM_MEDIA_UPLOAD_CHUNK_SIZE
    ) {
      signal?.throwIfAborted()
      const chunk = files.slice(start, start + ITEM_MEDIA_UPLOAD_CHUNK_SIZE)
      const contexts = await this.createItemMediaUpload(slug, {
        filenames: chunk.map(file => file.filename),
        upload_batch_id: uploadBatchId,
      })
      if (!Array.isArray(contexts) || contexts.length !== chunk.length) {
        throw new Error(
          `Expected ${chunk.length} upload contexts, got ${Array.isArray(contexts) ? contexts.length : typeof contexts}`,
        )
      }
      await runWithConcurrency(chunk.length, concurrency, async index => {
        const file = chunk[index] as DropUploadFile
        try {
          await uploadToContext(
            contexts[index] as UploadContext,
            await readData(file),
            { filename: file.filename, signal },
          )
        } catch (error) {
          throw new Error(
            `Uploading ${file.filename} failed: ${(error as Error).message}`,
            { cause: error },
          )
        }
        uploaded++
        options?.onProgress?.({ uploaded, total: files.length })
      })
    }

    signal?.throwIfAborted()
    const saved = await this.saveItemMediaBatch(slug, {
      upload_batch_id: uploadBatchId,
      filenames,
    })
    return {
      upload_batch_id: uploadBatchId,
      item_count: filenames.length,
      success: saved.success,
    }
  }
}

/** Normalized-attribute filters shared by the collection group endpoints. */
export interface NftGroupFacetFilters {
  franchise?: string[]
  grader?: string[]
  grade?: string[]
  subject?: string[]
  year?: string[]
  set?: string[]
  language?: string[]
  edition?: string[]
  productType?: string[]
}

function groupFacetFilterParams(
  filters?: NftGroupFacetFilters,
): Record<string, string[] | undefined> {
  return {
    franchise: filters?.franchise,
    grader: filters?.grader,
    grade: filters?.grade,
    subject: filters?.subject,
    year: filters?.year,
    set: filters?.set,
    language: filters?.language,
    edition: filters?.edition,
    product_type: filters?.productType,
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
      `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(address)}/nfts/${pathSegment(identifier)}`,
    )
  }

  async listByCollection(
    slug: string,
    options?: { limit?: number; next?: string; traits?: TraitFilter[] },
  ): Promise<{ nfts: NFT[]; next?: string }> {
    return this.client.get(`/api/v2/collection/${pathSegment(slug)}/nfts`, {
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
    return this.client.get(
      `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(address)}/nfts`,
      {
        limit: options?.limit,
        next: options?.next,
      },
    )
  }

  /**
   * List an account's NFTs. `includeAutoHidden` also returns NFTs hidden
   * automatically because a third party minted or sent them to the account.
   * NFTs the holder hid themselves stay out of the response, and NFTs removed
   * for policy violations are not returned either.
   */
  async listByAccount(
    chain: Chain,
    address: string,
    options?: { limit?: number; next?: string; includeAutoHidden?: boolean },
  ): Promise<{ nfts: NFT[]; next?: string }> {
    return this.client.get(
      `/api/v2/chain/${pathSegment(chain)}/account/${pathSegment(address)}/nfts`,
      {
        limit: options?.limit,
        next: options?.next,
        // Param keys go out verbatim, so spell the wire name here.
        include_auto_hidden: options?.includeAutoHidden,
      },
    )
  }

  /**
   * Search NFTs across every collection in a group, such as `trading_cards`,
   * by normalized attributes. Facet filters are sent as repeated parameters
   * and match any of their values; separate filters are AND-combined.
   */
  async listByGroup(
    group: string,
    options?: NftGroupFacetFilters & {
      collectionSlugs?: string[]
      query?: string
      isListed?: boolean
      minEstimatedValueUsd?: number
      maxEstimatedValueUsd?: number
      sortBy?: string
      sortDirection?: "asc" | "desc"
      limit?: number
      next?: string
    },
  ): Promise<StandardizedNftListResponse> {
    return this.client.get(`/api/v2/nfts/group/${pathSegment(group)}`, {
      collection_slugs: options?.collectionSlugs,
      query: options?.query,
      is_listed: options?.isListed,
      min_estimated_value_usd: options?.minEstimatedValueUsd,
      max_estimated_value_usd: options?.maxEstimatedValueUsd,
      sort_by: options?.sortBy,
      sort_direction: options?.sortDirection,
      limit: options?.limit,
      next: options?.next,
      ...groupFacetFilterParams(options),
    })
  }

  /**
   * Get each normalized attribute's values in a collection group with the
   * number of matching NFTs. Each facet is narrowed by the other types'
   * filters, so it keeps listing all of its own values.
   */
  async groupFacets(
    group: string,
    options?: NftGroupFacetFilters & {
      facetTypes?: string[]
      collectionSlugs?: string[]
    },
  ): Promise<StandardizedNftFacetsResponse> {
    return this.client.get(`/api/v2/nfts/group/${pathSegment(group)}/facets`, {
      facet_types: options?.facetTypes,
      collection_slugs: options?.collectionSlugs,
      ...groupFacetFilterParams(options),
    })
  }

  async refresh(
    chain: Chain,
    address: string,
    identifier: string,
  ): Promise<void> {
    await this.client.post(
      `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(address)}/nfts/${pathSegment(identifier)}/refresh`,
    )
  }

  async getContract(chain: Chain, address: string): Promise<Contract> {
    return this.client.get(
      `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(address)}`,
    )
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
      `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(address)}/nfts/${pathSegment(identifier)}/validate-metadata`,
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
      `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(address)}/nfts/${pathSegment(identifier)}/collection`,
    )
  }

  async getMetadata(
    chain: Chain,
    address: string,
    tokenId: string,
  ): Promise<AssetMetadataResponse> {
    return this.client.get(
      `/api/v2/metadata/${pathSegment(chain)}/${pathSegment(address)}/${pathSegment(tokenId)}`,
    )
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
      `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(address)}/nfts/${pathSegment(identifier)}/owners`,
      { limit: options?.limit, next: options?.next },
    )
  }

  async analytics(
    chain: Chain,
    address: string,
    identifier: string,
  ): Promise<NftAnalyticsResponse> {
    return this.client.get(
      `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(address)}/nfts/${pathSegment(identifier)}/analytics`,
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
      `/api/v2/listings/collection/${pathSegment(collectionSlug)}/all`,
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
      `/api/v2/listings/collection/${pathSegment(collectionSlug)}/best`,
      {
        limit: options?.limit,
        next: options?.next,
        traits: encodeTraits(options?.traits),
      },
    )
  }

  async bestForNFT(collectionSlug: string, tokenId: string): Promise<Listing> {
    return this.client.get(
      `/api/v2/listings/collection/${pathSegment(collectionSlug)}/nfts/${pathSegment(tokenId)}/best`,
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

  async fulfillmentActions(
    request: CreateListingFulfillmentActionsRequest,
  ): Promise<CreateListingFulfillmentActionsResponse> {
    return this.client.post("/api/v2/listings/fulfillment/actions", request)
  }

  async post(
    chain: string,
    protocol: string,
    request: SignedOrderRequest,
  ): Promise<Listing> {
    return this.client.post(
      `/api/v2/orders/${pathSegment(chain)}/${pathSegment(protocol)}/listings`,
      request,
    )
  }

  async fulfillmentData(
    request: ListingFulfillmentDataRequest,
  ): Promise<FulfillListingResponse> {
    return this.client.post("/api/v2/listings/fulfillment_data", request)
  }
}

class OffersAPI {
  constructor(private client: OpenSeaClient) {}

  async all(
    collectionSlug: string,
    options?: { limit?: number; next?: string; maker?: string },
  ): Promise<{ offers: Offer[]; next?: string }> {
    return this.client.get(
      `/api/v2/offers/collection/${pathSegment(collectionSlug)}/all`,
      {
        limit: options?.limit,
        next: options?.next,
        maker: options?.maker,
      },
    )
  }

  async collection(
    collectionSlug: string,
    options?: { limit?: number; next?: string },
  ): Promise<{ offers: Offer[]; next?: string }> {
    return this.client.get(
      `/api/v2/offers/collection/${pathSegment(collectionSlug)}`,
      {
        limit: options?.limit,
        next: options?.next,
      },
    )
  }

  async byNFT(
    collectionSlug: string,
    tokenId: string,
    options?: { limit?: number; next?: string },
  ): Promise<{ offers: Offer[]; next?: string }> {
    return this.client.get(
      `/api/v2/offers/collection/${pathSegment(collectionSlug)}/nfts/${pathSegment(tokenId)}`,
      { limit: options?.limit, next: options?.next },
    )
  }

  async bestForNFT(collectionSlug: string, tokenId: string): Promise<Offer> {
    return this.client.get(
      `/api/v2/offers/collection/${pathSegment(collectionSlug)}/nfts/${pathSegment(tokenId)}/best`,
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
      `/api/v2/offers/collection/${pathSegment(collectionSlug)}/traits`,
      {
        type: options.type,
        value: options.value,
        limit: options.limit,
        next: options.next,
      },
    )
  }

  async actions(
    request: CreateOfferActionsRequest,
  ): Promise<CreateOfferActionsResponse> {
    return this.client.post("/api/v2/offers/actions", request)
  }

  async fulfillmentActions(
    request: CreateOfferFulfillmentActionsRequest,
  ): Promise<CreateOfferFulfillmentActionsResponse> {
    return this.client.post("/api/v2/offers/fulfillment/actions", request)
  }

  async post(
    chain: string,
    protocol: string,
    request: SignedOrderRequest,
  ): Promise<Offer> {
    return this.client.post(
      `/api/v2/orders/${pathSegment(chain)}/${pathSegment(protocol)}/offers`,
      request,
    )
  }

  async build(request: BuildOfferRequest): Promise<BuildOfferResponse> {
    return this.client.post("/api/v2/offers/build", request)
  }

  async postCriteria(request: CriteriaOfferRequest): Promise<Offer> {
    return this.client.post("/api/v2/offers", request)
  }

  async fulfillmentData(
    request: OfferFulfillmentDataRequest,
  ): Promise<FulfillListingResponse> {
    return this.client.post("/api/v2/offers/fulfillment_data", request)
  }
}

class OrdersAPI {
  constructor(private client: OpenSeaClient) {}

  async get(
    chain: string,
    protocolAddress: string,
    orderHash: string,
  ): Promise<GetOrderResponse> {
    return this.client.get(
      `/api/v2/orders/chain/${pathSegment(chain)}/protocol/${pathSegment(protocolAddress)}/${pathSegment(orderHash)}`,
    )
  }

  async cancelActions(
    chain: string,
    protocolAddress: string,
    orderIdentifier: string,
    request: CreateCancelOrderActionsRequest,
  ): Promise<CreateCancelOrderActionsResponse> {
    return this.client.post(
      `/api/v2/orders/chain/${pathSegment(chain)}/protocol/${pathSegment(protocolAddress)}/${pathSegment(orderIdentifier)}/cancel/actions`,
      request,
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
    /**
     * @deprecated Ignored and not sent. `GET /api/v2/events` has no `chain`
     * parameter, so it never filtered. Use `byAccount` with `chain`, or
     * `byNFT`, for chain-scoped events.
     */
    chain?: Chain
  }): Promise<{ asset_events: AssetEvent[]; next?: string }> {
    return this.client.get("/api/v2/events", {
      event_type: options?.eventType,
      after: options?.after,
      before: options?.before,
      limit: options?.limit,
      next: options?.next,
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
    return this.client.get(`/api/v2/events/accounts/${pathSegment(address)}`, {
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
    return this.client.get(
      `/api/v2/events/collection/${pathSegment(collectionSlug)}`,
      {
        event_type: options?.eventType,
        limit: options?.limit,
        next: options?.next,
        traits: encodeTraits(options?.traits),
      },
    )
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
      `/api/v2/events/chain/${pathSegment(chain)}/contract/${pathSegment(address)}/nfts/${pathSegment(identifier)}`,
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
    return this.client.get(`/api/v2/accounts/${pathSegment(address)}`)
  }

  async makePrivate(wallet: string): Promise<WalletVisibilityResponse> {
    return this.client.put(
      `/api/v2/accounts/wallets/${pathSegment(wallet)}/private`,
    )
  }

  async makePublic(wallet: string): Promise<WalletVisibilityResponse> {
    return this.client.delete(
      `/api/v2/accounts/wallets/${pathSegment(wallet)}/private`,
    )
  }

  async agentRelationships(
    addressOrUsername: string,
  ): Promise<AgentProfileRelationshipsResponse> {
    return this.client.get(
      `/api/v2/accounts/${pathSegment(addressOrUsername)}/agent-relationships`,
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
    return this.client.get(`/api/v2/account/${pathSegment(address)}/tokens`, {
      chains: options?.chains?.join(","),
      limit: options?.limit,
      sort_by: options?.sortBy,
      sort_direction: options?.sortDirection,
      disable_spam_filtering: options?.disableSpamFiltering,
      cursor: options?.next,
    })
  }

  async resolve(identifier: string): Promise<AccountResolveResponse> {
    return this.client.get(
      `/api/v2/accounts/resolve/${pathSegment(identifier)}`,
    )
  }

  async portfolio(
    address: string,
    options?: { timeframe?: "HOUR" | "DAY" | "WEEK" | "MONTH" },
  ): Promise<PortfolioStatsResponse> {
    return this.client.get(
      `/api/v2/account/${pathSegment(address)}/portfolio`,
      {
        timeframe: options?.timeframe,
      },
    )
  }

  async portfolioHistory(
    address: string,
    options?: { timeframe?: "HOUR" | "DAY" | "WEEK" | "MONTH" },
  ): Promise<PortfolioHistoryResponse> {
    return this.client.get(
      `/api/v2/account/${pathSegment(address)}/portfolio/history`,
      {
        timeframe: options?.timeframe,
      },
    )
  }

  async pnl(address: string): Promise<WalletPnlResponse> {
    return this.client.get(`/api/v2/account/${pathSegment(address)}/pnl`)
  }

  async closedPositions(
    address: string,
    options?: { sortBy?: string; limit?: number; next?: string },
  ): Promise<ClosedPositionsResponse> {
    return this.client.get(
      `/api/v2/account/${pathSegment(address)}/pnl/closed-positions`,
      {
        sort_by: options?.sortBy,
        limit: options?.limit,
        next: options?.next,
      },
    )
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
    return this.client.get(
      `/api/v2/account/${pathSegment(address)}/pnl/token-transfers`,
      {
        contract_address: options.contractAddress,
        chain: options.chain,
        limit: options.limit,
        next: options.next,
      },
    )
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
    return this.client.get(`/api/v2/account/${pathSegment(address)}/offers`, {
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
    return this.client.get(
      `/api/v2/account/${pathSegment(address)}/offers_received`,
      {
        after: options?.after,
        limit: options?.limit,
        collection_slugs: options?.collectionSlugs?.join(","),
        chains: options?.chains?.join(","),
        sort_by: options?.sortBy,
        sort_direction: options?.sortDirection,
      },
    )
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
    return this.client.get(`/api/v2/account/${pathSegment(address)}/listings`, {
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
    return this.client.get(
      `/api/v2/account/${pathSegment(address)}/favorites`,
      {
        after: options?.after,
        limit: options?.limit,
        sort_by: options?.sortBy,
        sort_direction: options?.sortDirection,
        chains: options?.chains?.join(","),
      },
    )
  }

  async profileCollections(
    address: string,
    options?: {
      after?: string
      limit?: number
      chains?: string[]
    },
  ): Promise<ProfileCollectionsResponse> {
    return this.client.get(
      `/api/v2/account/${pathSegment(address)}/collections`,
      {
        after: options?.after,
        limit: options?.limit,
        chains: options?.chains?.join(","),
      },
    )
  }
}

/**
 * Agent accounts and the two-sided ownership handshake.
 *
 * An agent is an account, not a flag on a wallet. Ownership is a relationship
 * between two accounts that both sides confirm. It is a declaration, not an
 * authorization: naming an account as your agent grants it no ability to act
 * for you. It is self-reported and OpenSea does not verify it.
 *
 * An agent can have no owner at all, and at most one confirmed owner. Either
 * side may withdraw or revoke at any time, which deletes the relationship.
 * Only confirmed relationships are public; a pending proposal is visible to
 * the two parties alone.
 *
 * The writes need the `write:wallets` scope and {@link AgentAPI.list} needs
 * `read:wallets`. Authenticate with both or the list call returns 403
 * "Insufficient permissions".
 */
class AgentAPI {
  constructor(private client: OpenSeaClient) {}

  /**
   * Declare the authenticated account an agent. `changed` is false when it
   * already was one.
   */
  async declare(): Promise<AgentAccountStatusResponse> {
    return this.client.put("/api/v2/accounts/agent")
  }

  /** Withdraw the authenticated account's agent declaration. */
  async withdraw(): Promise<AgentAccountStatusResponse> {
    return this.client.delete("/api/v2/accounts/agent")
  }

  /**
   * Propose a relationship. `callerRole` is the caller's own side: `AGENT`
   * means "I am an agent and this account owns me".
   *
   * Proposing something already awaiting you confirms it, so a client that
   * cannot tell who moved first can just call this.
   */
  async propose(
    counterpartyAddress: string,
    callerRole: AgentRelationshipRole,
  ): Promise<AgentRelationshipMutationResponse> {
    return this.client.post("/api/v2/accounts/agent-relationships", {
      counterparty_address: counterpartyAddress,
      caller_role: callerRole,
    })
  }

  /** Confirm a relationship proposed to the authenticated account. */
  async confirm(
    counterpartyAddress: string,
    callerRole: AgentRelationshipRole,
  ): Promise<AgentRelationshipMutationResponse> {
    return this.client.post("/api/v2/accounts/agent-relationships/confirm", {
      counterparty_address: counterpartyAddress,
      caller_role: callerRole,
    })
  }

  /**
   * Withdraw a proposal or revoke a confirmed relationship. `removed` is
   * false when no such relationship existed.
   *
   * Sent as query parameters rather than a body because fetch, OkHttp and
   * urllib all drop DELETE bodies by default and proxies may strip them.
   */
  async revoke(
    counterpartyAddress: string,
    callerRole: AgentRelationshipRole,
  ): Promise<AgentRelationshipRemovalResponse> {
    return this.client.delete(
      "/api/v2/accounts/agent-relationships",
      undefined,
      {
        counterparty_address: counterpartyAddress,
        caller_role: callerRole,
      },
    )
  }

  /**
   * List the authenticated account's own relationships, including proposals
   * still awaiting either side. Requires `read:wallets`.
   */
  async list(): Promise<AgentRelationshipListResponse> {
    return this.client.get("/api/v2/accounts/agent-relationships")
  }

  /**
   * Public agent relationships for any profile. API key only, no wallet auth.
   * Shows confirmed relationships alone.
   */
  async profile(
    addressOrUsername: string,
  ): Promise<AgentProfileRelationshipsResponse> {
    return this.client.get(
      `/api/v2/accounts/${pathSegment(addressOrUsername)}/agent-relationships`,
    )
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
    return this.client.get(
      `/api/v2/chain/${pathSegment(chain)}/token/${pathSegment(address)}`,
    )
  }

  async paymentToken(chain: Chain, address: string): Promise<PaymentToken> {
    return this.client.get(
      `/api/v2/chain/${pathSegment(chain)}/payment_token/${pathSegment(address)}`,
    )
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
      `/api/v2/chain/${pathSegment(chain)}/token/${pathSegment(address)}/price_history`,
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
    return this.client.get(
      `/api/v2/chain/${pathSegment(chain)}/token/${pathSegment(address)}/ohlcv`,
      {
        start_time: options.startTime,
        bucket_size: options.bucketSize,
        end_time: options.endTime,
        fill_time_window: options.fillTimeWindow,
      },
    )
  }

  async activity(
    chain: Chain,
    address: string,
    options?: { limit?: number; next?: string },
  ): Promise<TokenSwapActivityPaginatedResponse> {
    return this.client.get(
      `/api/v2/chain/${pathSegment(chain)}/token/${pathSegment(address)}/activity`,
      {
        limit: options?.limit,
        cursor: options?.next,
      },
    )
  }

  async activityStats(
    chain: Chain,
    address: string,
    options?: { windows?: TokenActivityStatsWindow[] },
  ): Promise<TokenActivityStatsResponse> {
    return this.client.get(
      `/api/v2/chain/${pathSegment(chain)}/token/${pathSegment(address)}/activity/stats`,
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
    return this.client.get(
      `/api/v2/account/${pathSegment(address)}/token-activity`,
      {
        chains: options?.chains?.join(","),
        tokens: options?.tokens?.join(","),
        type: options?.type?.join(","),
        limit: options?.limit,
        next: options?.next,
      },
    )
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
    return this.client.get(
      `/api/v2/chain/${pathSegment(chain)}/token/${pathSegment(address)}/holders`,
      {
        limit: options?.limit,
        cursor: options?.next,
        sort_by: options?.sortBy,
        sort_direction: options?.sortDirection,
      },
    )
  }

  async liquidityPools(
    chain: Chain,
    address: string,
    options?: { limit?: number },
  ): Promise<TokenLiquidityPoolsResponse> {
    return this.client.get(
      `/api/v2/chain/${pathSegment(chain)}/token/${pathSegment(address)}/liquidity-pools`,
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
    // The union, not `EvmWalletAdapter`: `createWalletFromEnv()` returns `WalletAdapter`, so
    // narrowing this parameter would stop `execute(opts, createWalletFromEnv())` compiling and
    // force every caller to narrow first. The method builds `to`/`data`/`value`/`chainId`
    // transactions and so needs an EVM wallet, which it checks below instead.
    wallet: WalletAdapter,
    callbacks?: {
      onQuote?: (quote: SwapQuoteResponse) => void
      onSending?: (tx: { to: string; chain: string; chainId: number }) => void
      onSkipped?: (tx: { chain: string; reason: string }) => void
    },
  ): Promise<TransactionResult[]> {
    // Rejects a Solana wallet here rather than failing later on a missing `sendTransaction`,
    // and before the quote request. Matches how the x402 scheme guards its own boundary.
    const evmWallet = requireEvmAdapter(wallet, "swap execution")

    const address = options.address ?? (await evmWallet.getAddress())
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
      const result = await evmWallet.sendTransaction({
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
      `/api/v2/tools/${pathSegment(registryChain)}/${pathSegment(registryAddr)}/${pathSegment(toolId)}`,
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

  /**
   * Report a tool invocation. Metrics only: the response says whether the report was verified,
   * and nothing about the tool call itself depends on it.
   */
  async reportUsage(usage: ToolUsageRequest): Promise<ToolUsageResponse> {
    return this.client.post<ToolUsageResponse>("/api/v2/tools/usage", usage)
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
      `/api/v2/tools/${pathSegment(registryChain)}/${pathSegment(registryAddr)}/${pathSegment(toolId)}/activity`,
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
