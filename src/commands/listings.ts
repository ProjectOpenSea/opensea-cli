import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import {
  addSendOptions,
  requestedListing,
  runMarketplaceSteps,
  type SendOptions,
} from "../marketplace/cli.js"
import {
  normalizeSeaportOrder,
  planActionSteps,
  planSwapTransactions,
} from "../marketplace/guard.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import {
  addPaginationOptions,
  addTraitsOption,
  parseIntOption,
  parseTraitsOption,
  pathSegment,
  readJsonBodyOption,
} from "../parse.js"
import type {
  CreateListingActionsRequest,
  CreateListingActionsResponse,
  CreateListingFulfillmentActionsRequest,
  CreateListingFulfillmentActionsResponse,
  CrossChainFulfillmentResponse,
  FulfillListingResponse,
  GetOrderResponse,
  Listing,
  ListingFulfillmentDataRequest,
  SignedOrderRequest,
  SweepCollectionResponse,
} from "../types/index.js"
import { resolveChainId } from "../wallet/index.js"

/**
 * What buying `hashes` costs in `paymentToken`, from each listing's own
 * consideration. Undefined when a listing cannot be loaded or is not priced
 * in that ERC-20, so an approval for it is refused rather than guessed.
 */
async function listingsPaymentAmount(
  client: OpenSeaClient,
  chain: string,
  protocolAddress: string,
  hashes: string[],
  paymentToken: string,
): Promise<bigint | undefined> {
  let total = 0n
  for (const hash of hashes) {
    const response = await client.get<GetOrderResponse>(
      `/api/v2/orders/chain/${pathSegment(chain)}/protocol/${pathSegment(protocolAddress)}/${pathSegment(hash)}`,
    )
    const order = normalizeSeaportOrder(
      (response.order as { protocol_data?: { parameters?: unknown } })
        .protocol_data?.parameters,
      { counterOptional: true },
    )
    const payments = order?.consideration.filter(
      item =>
        item.itemType === 1 &&
        item.token.toLowerCase() === paymentToken.toLowerCase(),
    )
    if (!payments || payments.length === 0) return undefined
    for (const item of payments) {
      const start = BigInt(item.startAmount)
      const end = BigInt(item.endAmount)
      total += start > end ? start : end
    }
  }
  return total
}

export function listingsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("listings").description("Query NFT listings")

  addPaginationOptions(
    cmd
      .command("all")
      .description("Get all listings for a collection")
      .argument("<collection>", "Collection slug"),
  )
    .option("--maker <address>", "Filter by order maker address")
    .option(
      "--include-private-listings",
      "Include private listings (excluded by default)",
    )
    .action(
      async (
        collection: string,
        options: {
          limit: string
          next?: string
          maker?: string
          includePrivateListings?: boolean
        },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/listings/collection/${pathSegment(collection)}/all`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            next: options.next,
            maker: options.maker,
            include_private_listings: options.includePrivateListings,
          },
        )
      },
    )

  addSendOptions(
    cmd
      .command("sweep")
      .description(
        "Bulk-buy items from a collection (any payment token); with --send, buy with the configured wallet",
      )
      .requiredOption("--collection <slug>", "Collection slug to sweep")
      .requiredOption("--max-items <n>", "Maximum number of items to buy", v =>
        parseIntOption(v, "--max-items"),
      )
      .requiredOption(
        "--max-price-per-item <wei>",
        "Maximum price per item in wei of the payment token",
      )
      .requiredOption("--buyer <address>", "Buyer wallet address")
      .requiredOption(
        "--payment-chain <chain>",
        "Chain slug of the payment token (EVM or SVM)",
      )
      .requiredOption(
        "--payment-token <address>",
        "Payment token contract address (0x0...0 for native)",
      )
      .option("--recipient <address>", "Different recipient address for NFTs"),
  ).action(
    async (
      options: SendOptions & {
        collection: string
        maxItems: number
        maxPricePerItem: string
        buyer: string
        paymentChain: string
        paymentToken: string
        recipient?: string
      },
    ) => {
      const client = getClient()
      const body: Record<string, unknown> = {
        collection_slug: options.collection,
        max_items: options.maxItems,
        max_price_per_item: options.maxPricePerItem,
        buyer: options.buyer,
        payment: {
          chain: options.paymentChain,
          token_address: options.paymentToken,
        },
      }
      if (options.recipient) {
        body.recipient = options.recipient
      }
      await runMarketplaceSteps({
        client,
        format: getFormat(),
        options,
        account: options.buyer,
        recipient: options.recipient,
        purpose: "sweep",
        request: () =>
          client.post<SweepCollectionResponse>("/api/v2/listings/sweep", body),
        plan: response => ({
          steps: planActionSteps(response.steps, options.buyer),
          warnings: response.errors?.map(e => e.message),
        }),
      })
    },
  )

  addTraitsOption(
    addPaginationOptions(
      cmd
        .command("best")
        .description("Get best listings for a collection")
        .argument("<collection>", "Collection slug")
        .option(
          "--include-private-listings",
          "Include private listings (excluded by default)",
        ),
    ),
  ).action(
    async (
      collection: string,
      options: {
        limit: string
        next?: string
        traits?: string
        includePrivateListings?: boolean
      },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/listings/collection/${pathSegment(collection)}/best`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
          traits: options.traits
            ? parseTraitsOption(options.traits)
            : undefined,
          include_private_listings: options.includePrivateListings,
        },
      )
    },
  )

  cmd
    .command("best-for-nft")
    .description("Get best listing for a specific NFT")
    .argument("<collection>", "Collection slug")
    .argument("<token-id>", "Token ID")
    .option(
      "--include-private-listings",
      "Include private listings (excluded by default)",
    )
    .action(
      async (
        collection: string,
        tokenId: string,
        options: { includePrivateListings?: boolean },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/listings/collection/${pathSegment(collection)}/nfts/${pathSegment(tokenId)}/best`,
          { include_private_listings: options.includePrivateListings },
        )
      },
    )

  addSendOptions(
    cmd
      .command("cross-chain-fulfill")
      .description(
        "Get cross-chain fulfillment data for one or more listings. " +
          "Supports same-chain, cross-token, and cross-chain purchases. " +
          "--send runs only Seaport calls and payment-token approvals",
      )
      .requiredOption(
        "--hashes <hashes>",
        "Comma-separated order hashes to fulfill",
      )
      .requiredOption(
        "--listing-chain <chain>",
        "Chain slug where the listings live (must be EVM)",
      )
      .requiredOption(
        "--protocol-address <address>",
        "Seaport contract address for the listings",
      )
      .requiredOption("--fulfiller <address>", "Buyer wallet address")
      .requiredOption(
        "--payment-chain <chain>",
        "Chain slug of the payment token (EVM or SVM)",
      )
      .requiredOption(
        "--payment-token <address>",
        "Payment token contract address (0x0...0 for native)",
      )
      .option("--recipient <address>", "Different recipient address for NFTs"),
  ).action(
    async (
      options: SendOptions & {
        hashes: string
        listingChain: string
        protocolAddress: string
        fulfiller: string
        paymentChain: string
        paymentToken: string
        recipient?: string
      },
    ) => {
      const client = getClient()
      const hashes = options.hashes.split(",").map(h => h.trim())
      const listings = hashes.map(hash => ({
        hash,
        chain: options.listingChain,
        protocol_address: options.protocolAddress,
      }))
      const body: Record<string, unknown> = {
        listings,
        fulfiller: { address: options.fulfiller },
        payment: {
          chain: options.paymentChain,
          token_address: options.paymentToken,
        },
      }
      if (options.recipient) {
        body.recipient = options.recipient
      }
      await runMarketplaceSteps({
        client,
        format: getFormat(),
        options,
        account: options.fulfiller,
        recipient: options.recipient,
        purpose: "listing fulfillment",
        request: () =>
          client.post<CrossChainFulfillmentResponse>(
            "/api/v2/listings/cross_chain_fulfillment_data",
            body,
          ),
        paymentAmount: () =>
          listingsPaymentAmount(
            client,
            options.listingChain,
            options.protocolAddress,
            hashes,
            options.paymentToken,
          ),
        plan: (response, _requested, paymentAmount) => ({
          steps: planSwapTransactions(
            response.transactions,
            options.fulfiller,
            options.paymentToken,
            {
              chainIds: [
                resolveChainId(options.listingChain),
                resolveChainId(options.paymentChain),
              ],
              paymentAmount,
            },
          ),
        }),
      })
    },
  )

  addSendOptions(
    cmd
      .command("actions")
      .description(
        "Get ordered approval + sign actions needed to create one or more listings; with --send, run them and post the signed listing",
      )
      .requiredOption(
        "--body <path>",
        "Path to JSON file with the CreateListingActionsRequest body",
      ),
  ).action(async (options: SendOptions & { body: string }) => {
    const client = getClient()
    const request = readJsonBodyOption<CreateListingActionsRequest>(
      options.body,
      "--body",
    )
    await runMarketplaceSteps({
      client,
      format: getFormat(),
      options,
      account: request.address,
      purpose: "listing creation",
      orderChain: request.items[0]?.chain,
      requestedOrder: () => requestedListing(client, request),
      request: () =>
        client.post<CreateListingActionsResponse>(
          "/api/v2/listings/actions",
          request,
        ),
      plan: (response, requestedOrder) => ({
        steps: planActionSteps(response.steps, request.address, {
          requestedOrder,
          chainId: resolveChainId(request.items[0]?.chain ?? ""),
        }),
      }),
    })
  })

  addSendOptions(
    cmd
      .command("fulfillment-actions")
      .description(
        "Get ordered actions needed to fulfill a listing; with --send, buy it with the configured wallet",
      )
      .requiredOption(
        "--body <path>",
        "Path to JSON file with the listing fulfillment request body",
      ),
  ).action(async (options: SendOptions & { body: string }) => {
    const client = getClient()
    const request = readJsonBodyOption<CreateListingFulfillmentActionsRequest>(
      options.body,
      "--body",
    )
    await runMarketplaceSteps({
      client,
      format: getFormat(),
      options,
      account: request.fulfiller.address,
      recipient: request.recipient,
      purpose: "listing fulfillment",
      request: () =>
        client.post<CreateListingFulfillmentActionsResponse>(
          "/api/v2/listings/fulfillment/actions",
          request,
        ),
      plan: response => ({
        steps: planActionSteps(response.steps, request.fulfiller.address, {
          chainId: resolveChainId(request.listing.chain),
        }),
      }),
    })
  })

  cmd
    .command("post")
    .description("Submit a signed listing order")
    .argument("<chain>", "Chain the listing is on (e.g. ethereum, base)")
    .option("--protocol <protocol>", "Order protocol", "seaport")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the signed order (parameters, signature, protocol_address)",
    )
    .action(
      async (chain: string, options: { protocol: string; body: string }) => {
        const client = getClient()
        const request = readJsonBodyOption<SignedOrderRequest>(
          options.body,
          "--body",
        )
        const result = await client.post<Listing>(
          `/api/v2/orders/${pathSegment(chain)}/${pathSegment(options.protocol)}/listings`,
          request,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("fulfillment-data")
    .description("Get the transaction data needed to fulfill a listing")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the listing fulfillment request body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<ListingFulfillmentDataRequest>(
        options.body,
        "--body",
      )
      const result = await client.post<FulfillListingResponse>(
        "/api/v2/listings/fulfillment_data",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
