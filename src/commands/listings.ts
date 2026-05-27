import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import {
  addTraitsOption,
  parseIntOption,
  parseTraitsOption,
  readJsonBodyOption,
} from "../parse.js"
import type {
  CreateListingActionsRequest,
  CreateListingActionsResponse,
  CrossChainFulfillmentResponse,
} from "../types/index.js"

export function listingsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("listings").description("Query NFT listings")

  cmd
    .command("all")
    .description("Get all listings for a collection")
    .argument("<collection>", "Collection slug")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .option("--maker <address>", "Filter by order maker address")
    .action(
      async (
        collection: string,
        options: { limit: string; next?: string; maker?: string },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/listings/collection/${collection}/all`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            next: options.next,
            maker: options.maker,
          },
        )
      },
    )

  cmd
    .command("sweep")
    .description("Bulk-buy items from a collection (any payment token)")
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
    .option("--recipient <address>", "Different recipient address for NFTs")
    .action(
      async (options: {
        collection: string
        maxItems: number
        maxPricePerItem: string
        buyer: string
        paymentChain: string
        paymentToken: string
        recipient?: string
      }) => {
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
        const result = await client.post("/api/v2/listings/sweep", body)
        console.log(formatOutput(result, getFormat()))
      },
    )

  addTraitsOption(
    cmd
      .command("best")
      .description("Get best listings for a collection")
      .argument("<collection>", "Collection slug")
      .option("--limit <limit>", "Number of results", "20")
      .option("--next <cursor>", "Pagination cursor"),
  ).action(
    async (
      collection: string,
      options: { limit: string; next?: string; traits?: string },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/listings/collection/${collection}/best`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
          traits: options.traits
            ? parseTraitsOption(options.traits)
            : undefined,
        },
      )
    },
  )

  cmd
    .command("best-for-nft")
    .description("Get best listing for a specific NFT")
    .argument("<collection>", "Collection slug")
    .argument("<token-id>", "Token ID")
    .action(async (collection: string, tokenId: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/listings/collection/${collection}/nfts/${tokenId}/best`,
      )
    })

  cmd
    .command("cross-chain-fulfill")
    .description(
      "Get cross-chain fulfillment data for one or more listings. " +
        "Supports same-chain, cross-token, and cross-chain purchases.",
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
    .option("--recipient <address>", "Different recipient address for NFTs")
    .action(
      async (options: {
        hashes: string
        listingChain: string
        protocolAddress: string
        fulfiller: string
        paymentChain: string
        paymentToken: string
        recipient?: string
      }) => {
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
        const result = await client.post<CrossChainFulfillmentResponse>(
          "/api/v2/listings/cross_chain_fulfillment_data",
          body,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("actions")
    .description(
      "Get ordered approval + sign actions needed to create one or more listings",
    )
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the CreateListingActionsRequest body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<CreateListingActionsRequest>(
        options.body,
        "--body",
      )
      const result = await client.post<CreateListingActionsResponse>(
        "/api/v2/listings/actions",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
