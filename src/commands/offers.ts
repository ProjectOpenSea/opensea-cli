import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import {
  addSendOptions,
  requestedOffer,
  runMarketplaceSteps,
  type SendOptions,
} from "../marketplace/cli.js"
import { planActionSteps } from "../marketplace/guard.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import {
  addPaginationOptions,
  parseFloatOption,
  parseIntOption,
  parseTraitsOption,
  pathSegment,
  readJsonBodyOption,
} from "../parse.js"
import type {
  BuildOfferRequest,
  BuildOfferResponse,
  CreateOfferActionsRequest,
  CreateOfferActionsResponse,
  CreateOfferFulfillmentActionsRequest,
  CreateOfferFulfillmentActionsResponse,
  CriteriaOfferRequest,
  FulfillListingResponse,
  GetOrderResponse,
  Offer,
  OfferFulfillmentDataRequest,
  SignedOrderRequest,
} from "../types/index.js"
import { resolveChainId } from "../wallet/index.js"

export function offersCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("offers").description("Query NFT offers")

  addPaginationOptions(
    cmd
      .command("all")
      .description("Get all offers for a collection")
      .argument("<collection>", "Collection slug"),
  )
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
          `/api/v2/offers/collection/${pathSegment(collection)}/all`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            next: options.next,
            maker: options.maker,
          },
        )
      },
    )

  addPaginationOptions(
    cmd
      .command("by-nft")
      .description("Get all offers for a specific NFT")
      .argument("<collection>", "Collection slug")
      .argument("<token-id>", "Token ID"),
  ).action(
    async (
      collection: string,
      tokenId: string,
      options: { limit: string; next?: string },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/offers/collection/${pathSegment(collection)}/nfts/${pathSegment(tokenId)}`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        },
      )
    },
  )

  addPaginationOptions(
    cmd
      .command("collection")
      .description("Get collection offers")
      .argument("<collection>", "Collection slug"),
  ).action(
    async (collection: string, options: { limit: string; next?: string }) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/offers/collection/${pathSegment(collection)}`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        },
      )
    },
  )

  cmd
    .command("best-for-nft")
    .description("Get best offer for a specific NFT")
    .argument("<collection>", "Collection slug")
    .argument("<token-id>", "Token ID")
    .action(async (collection: string, tokenId: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/offers/collection/${pathSegment(collection)}/nfts/${pathSegment(tokenId)}/best`,
      )
    })

  addPaginationOptions(
    cmd
      .command("traits")
      .description(
        "Get trait offers for a collection: one string trait (--type/--value), a numeric range (--type with --min-value/--max-value), or several traits (--traits)",
      )
      .argument("<collection>", "Collection slug")
      .option("--type <type>", "Trait type")
      .option("--value <value>", "Trait value as a string")
      .option(
        "--mode <mode>",
        "Bid category (STRING, NUMERIC, MULTI); inferred from the other options when omitted",
      )
      .option("--float-value <n>", "Trait value as a decimal number")
      .option("--int-value <n>", "Trait value as an integer")
      .option("--min-value <n>", "Minimum value for a numeric trait range")
      .option("--max-value <n>", "Maximum value for a numeric trait range")
      .option(
        "--traits <json>",
        'Multi-trait filters (JSON array, e.g. \'[{"traitType":"Background","value":"Red"}]\')',
      ),
  ).action(
    async (
      collection: string,
      options: {
        type?: string
        value?: string
        mode?: string
        floatValue?: string
        intValue?: string
        minValue?: string
        maxValue?: string
        traits?: string
        limit: string
        next?: string
      },
    ) => {
      if (!options.type && !options.traits) {
        throw new Error("Provide --type or --traits")
      }
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/offers/collection/${pathSegment(collection)}/traits`,
        {
          type: options.type,
          value: options.value,
          mode: options.mode,
          float_value:
            options.floatValue !== undefined
              ? parseFloatOption(options.floatValue, "--float-value")
              : undefined,
          int_value:
            options.intValue !== undefined
              ? parseIntOption(options.intValue, "--int-value")
              : undefined,
          min_value:
            options.minValue !== undefined
              ? parseFloatOption(options.minValue, "--min-value")
              : undefined,
          max_value:
            options.maxValue !== undefined
              ? parseFloatOption(options.maxValue, "--max-value")
              : undefined,
          traits: options.traits
            ? parseTraitsOption(options.traits)
            : undefined,
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        },
      )
    },
  )

  addSendOptions(
    cmd
      .command("actions")
      .description(
        "Get ordered actions needed to create an offer; with --send, run them and post the signed offer",
      )
      .requiredOption(
        "--body <path>",
        "Path to JSON file with the CreateOfferActionsRequest body",
      ),
  ).action(async (options: SendOptions & { body: string }) => {
    const client = getClient()
    const request = readJsonBodyOption<CreateOfferActionsRequest>(
      options.body,
      "--body",
    )
    await runMarketplaceSteps({
      client,
      format: getFormat(),
      options,
      account: request.address,
      purpose: "offer creation",
      orderChain: request.item.chain,
      requestedOrder: () => requestedOffer(client, request),
      request: () =>
        client.post<CreateOfferActionsResponse>(
          "/api/v2/offers/actions",
          request,
        ),
      plan: (response, requestedOrder) => ({
        steps: planActionSteps(response.steps, request.address, {
          requestedOrder,
          chainId: resolveChainId(request.item.chain),
        }),
      }),
    })
  })

  addSendOptions(
    cmd
      .command("fulfillment-actions")
      .description(
        "Get ordered actions needed to fulfill an offer; with --send, accept it with the configured wallet",
      )
      .requiredOption(
        "--body <path>",
        "Path to JSON file with the offer fulfillment request body",
      ),
  ).action(async (options: SendOptions & { body: string }) => {
    const client = getClient()
    const request = readJsonBodyOption<CreateOfferFulfillmentActionsRequest>(
      options.body,
      "--body",
    )
    await runMarketplaceSteps({
      client,
      format: getFormat(),
      options,
      account: request.fulfiller.address,
      purpose: "offer fulfillment",
      acceptedOffer: async () => {
        const { offer } = request
        const response = await client.get<GetOrderResponse>(
          `/api/v2/orders/chain/${pathSegment(offer.chain)}/protocol/${pathSegment(offer.protocol_address)}/${pathSegment(offer.hash)}`,
        )
        return (response.order as { protocol_data?: { parameters?: unknown } })
          .protocol_data?.parameters
      },
      request: () =>
        client.post<CreateOfferFulfillmentActionsResponse>(
          "/api/v2/offers/fulfillment/actions",
          request,
        ),
      plan: response => ({
        steps: planActionSteps(response.steps, request.fulfiller.address, {
          chainId: resolveChainId(request.offer.chain),
        }),
      }),
    })
  })

  cmd
    .command("post")
    .description("Submit a signed item offer order")
    .argument("<chain>", "Chain the offer is on (e.g. ethereum, base)")
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
        const result = await client.post<Offer>(
          `/api/v2/orders/${pathSegment(chain)}/${pathSegment(options.protocol)}/offers`,
          request,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("build")
    .description(
      "Build the unsigned parameters for a collection or trait offer",
    )
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the BuildOfferRequest body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<BuildOfferRequest>(
        options.body,
        "--body",
      )
      const result = await client.post<BuildOfferResponse>(
        "/api/v2/offers/build",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("post-criteria")
    .description("Submit a signed collection or trait offer")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the signed criteria offer (protocol_data, criteria, protocol_address)",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<CriteriaOfferRequest>(
        options.body,
        "--body",
      )
      const result = await client.post<Offer>("/api/v2/offers", request)
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("fulfillment-data")
    .description("Get the transaction data needed to fulfill an offer")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the offer fulfillment request body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<OfferFulfillmentDataRequest>(
        options.body,
        "--body",
      )
      const result = await client.post<FulfillListingResponse>(
        "/api/v2/offers/fulfillment_data",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
