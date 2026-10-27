import { readFileSync } from "node:fs"
import { basename } from "node:path"
import { uploadToContext } from "@opensea/sdk"
import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import {
  addChainOption,
  addPaginationOptions,
  addSortDirectionOption,
  parseBooleanOption,
  parseIntOption,
  pathSegment,
  readJsonBodyOption,
} from "../parse.js"
import { CollectionsAPI } from "../sdk.js"
import type {
  BatchCollectionsRequest,
  Chain,
  CollectionBatchResponse,
  CollectionOfferAggregatesPaginatedResponse,
  CollectionOrderBy,
  ModifyCollectionRequest,
  SetCollectionVisibilityRequest,
  UpdateCollectionMetadataRequest,
} from "../types/index.js"
import { WALLET_PROVIDERS } from "../wallet/index.js"
import { openEvmWallet } from "./drops.js"

const PAGE_MEDIA_PLACEMENTS = [
  "hero_desktop",
  "hero_mobile",
  "about_preview",
  "about_section",
  "overview",
  "overview_background",
  "team",
]

export function collectionsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("collections").description(
    "Manage and query NFT collections",
  )

  cmd
    .command("get")
    .description("Get a single collection by slug")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/collections/${pathSegment(slug)}`,
      )
    })

  addPaginationOptions(
    addChainOption(cmd.command("list").description("List collections"))
      .option(
        "--order-by <orderBy>",
        "Order by field (created_date, one_day_change, seven_day_volume, seven_day_change, num_owners, market_cap)",
      )
      .option("--creator <username>", "Filter by creator username")
      .option("--include-hidden", "Include hidden collections"),
  ).action(
    async (options: {
      chain?: string
      orderBy?: string
      creator?: string
      includeHidden?: boolean
      limit: string
      next?: string
    }) => {
      const client = getClient()
      await outputGet(client, getFormat(), "/api/v2/collections", {
        chain: options.chain as Chain | undefined,
        order_by: options.orderBy as CollectionOrderBy | undefined,
        creator_username: options.creator,
        include_hidden: options.includeHidden,
        limit: parseIntOption(options.limit, "--limit"),
        next: options.next,
      })
    },
  )

  cmd
    .command("stats")
    .description("Get collection stats")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/collections/${pathSegment(slug)}/stats`,
      )
    })

  cmd
    .command("traits")
    .description("Get collection traits")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/traits/${pathSegment(slug)}`,
      )
    })

  cmd
    .command("trait-floors")
    .description(
      "Get the floor price of each text trait value with an active listing",
    )
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/traits/${pathSegment(slug)}/floors`,
      )
    })

  addPaginationOptions(
    cmd
      .command("pfp-profiles")
      .description(
        "Get profiles wearing a verified NFT from the collection as their profile picture",
      )
      .argument("<slug>", "Collection slug"),
    "Number of results (max 100)",
  ).action(async (slug: string, options: { limit: string; next?: string }) => {
    const client = getClient()
    await outputGet(
      client,
      getFormat(),
      `/api/v2/collections/${pathSegment(slug)}/pfp-profiles`,
      {
        limit: parseIntOption(options.limit, "--limit"),
        cursor: options.next,
      },
    )
  })

  addChainOption(
    cmd
      .command("top-pfp")
      .description(
        "Get collections ranked by how many accounts wear one of their verified NFTs as a profile picture",
      )
      .option("--limit <limit>", "Number of collections (1-50)", "20"),
  ).action(async (options: { limit: string; chain?: string }) => {
    const client = getClient()
    await outputGet(client, getFormat(), "/api/v2/pfp/top-collections", {
      limit: parseIntOption(options.limit, "--limit"),
      chains: options.chain as Chain | undefined,
    })
  })

  addPaginationOptions(
    cmd
      .command("trending")
      .description("Get trending collections by sales activity")
      .option(
        "--timeframe <timeframe>",
        "Time window (one_minute, five_minutes, fifteen_minutes, one_hour, one_day, seven_days, thirty_days, one_year, all_time)",
        "one_day",
      )
      .option(
        "--chains <chains>",
        "Comma-separated list of chains to filter by",
      )
      .option(
        "--category <category>",
        "Category (art, gaming, memberships, music, pfps, photography, domain-names, virtual-worlds, sports-collectibles)",
      ),
    "Number of results (max 100)",
  ).action(
    async (options: {
      timeframe: string
      chains?: string
      category?: string
      limit: string
      next?: string
    }) => {
      const client = getClient()
      await outputGet(client, getFormat(), "/api/v2/collections/trending", {
        timeframe: options.timeframe,
        chains: options.chains,
        category: options.category,
        limit: parseIntOption(options.limit, "--limit"),
        cursor: options.next,
      })
    },
  )

  addPaginationOptions(
    cmd
      .command("top")
      .description(
        "Get top collections ranked by volume, sales, or floor price",
      )
      .option(
        "--sort-by <field>",
        "Sort by (one_day_volume, seven_days_volume, thirty_days_volume, floor_price, one_day_sales, seven_days_sales, thirty_days_sales, total_volume, total_sales)",
        "one_day_volume",
      )
      .option(
        "--chains <chains>",
        "Comma-separated list of chains to filter by",
      )
      .option(
        "--category <category>",
        "Category (art, gaming, memberships, music, pfps, photography, domain-names, virtual-worlds, sports-collectibles)",
      ),
    "Number of results (max 100)",
    "50",
  ).action(
    async (options: {
      sortBy: string
      chains?: string
      category?: string
      limit: string
      next?: string
    }) => {
      const client = getClient()
      await outputGet(client, getFormat(), "/api/v2/collections/top", {
        sort_by: options.sortBy,
        chains: options.chains,
        category: options.category,
        limit: parseIntOption(options.limit, "--limit"),
        cursor: options.next,
      })
    },
  )

  cmd
    .command("batch")
    .description("Get multiple collections in one request by slug")
    .option(
      "--slugs <slugs>",
      "Comma-separated collection slugs (or use --body for JSON)",
    )
    .option(
      "--body <path>",
      "Path to JSON file with the batch request body (overrides --slugs)",
    )
    .action(async (options: { slugs?: string; body?: string }) => {
      const client = getClient()
      let request: BatchCollectionsRequest
      if (options.body) {
        request = readJsonBodyOption<BatchCollectionsRequest>(
          options.body,
          "--body",
        )
      } else if (options.slugs) {
        request = { slugs: options.slugs.split(",") }
      } else {
        throw new Error("Pass --slugs or --body")
      }
      const result = await client.post<CollectionBatchResponse>(
        "/api/v2/collections/batch",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  addSortDirectionOption(
    addPaginationOptions(
      cmd
        .command("offer-aggregates")
        .description("Get top offers for a collection grouped by price level")
        .argument("<slug>", "Collection slug"),
      "Number of results (max 100)",
    ),
  ).action(
    async (
      slug: string,
      options: { limit: string; next?: string; sortDirection?: string },
    ) => {
      const client = getClient()
      const result =
        await client.get<CollectionOfferAggregatesPaginatedResponse>(
          `/api/v2/collections/${pathSegment(slug)}/offer_aggregates`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            cursor: options.next,
            sort_direction: options.sortDirection,
          },
        )
      console.log(formatOutput(result, getFormat()))
    },
  )

  addSortDirectionOption(
    addPaginationOptions(
      cmd
        .command("holders")
        .description("Get holders of a collection")
        .argument("<slug>", "Collection slug"),
      "Number of results (max 100)",
    ),
  )
    .option("--owned-by <address>", "Filter to a single owner address")
    .action(
      async (
        slug: string,
        options: {
          limit: string
          next?: string
          sortDirection?: string
          ownedBy?: string
        },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/collections/${pathSegment(slug)}/holders`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            cursor: options.next,
            sort_direction: options.sortDirection,
            owned_by: options.ownedBy,
          },
        )
      },
    )

  cmd
    .command("floor-prices")
    .description("Get a collection's floor-price history")
    .argument("<slug>", "Collection slug")
    .option(
      "--timeframe <window>",
      "Time window (one_minute, five_minutes, fifteen_minutes, one_hour, one_day, seven_days, thirty_days, one_year, all_time)",
    )
    .option("--resolution <count>", "Number of data points to return")
    .action(
      async (
        slug: string,
        options: { timeframe?: string; resolution?: string },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/collections/${pathSegment(slug)}/floor_prices`,
          {
            timeframe: options.timeframe,
            resolution: options.resolution
              ? parseIntOption(options.resolution, "--resolution")
              : undefined,
          },
        )
      },
    )

  cmd
    .command("modify")
    .description(
      "Edit a collection's settings (name, description, fees, etc.) — collection editor auth required",
    )
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the ModifyCollectionRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<ModifyCollectionRequest>(
        options.body,
        "--body",
      )
      const result = await client.patch(
        `/api/v2/collections/${pathSegment(slug)}`,
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("update-metadata")
    .description("Update a collection's about/hero/overview metadata")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the UpdateCollectionMetadataRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<UpdateCollectionMetadataRequest>(
        options.body,
        "--body",
      )
      const result = await client.patch(
        `/api/v2/collections/${pathSegment(slug)}/metadata`,
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("get-metadata")
    .description(
      "Get a collection's saved page (hero, about, overview) in the update-metadata body shape, with its preview URL",
    )
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const collections = new CollectionsAPI(getClient())
      const result = await collections.pageMetadata(slug)
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("set-visibility")
    .description("Show or hide a collection")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--hidden <boolean>",
      "Whether the collection should be hidden (true or false)",
    )
    .action(async (slug: string, options: { hidden: string }) => {
      if (options.hidden !== "true" && options.hidden !== "false") {
        throw new Error("--hidden must be 'true' or 'false'")
      }
      const client = getClient()
      const body: SetCollectionVisibilityRequest = {
        hidden: options.hidden === "true",
      }
      const result = await client.patch(
        `/api/v2/collections/${pathSegment(slug)}/visibility`,
        body,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("upload-image")
    .description(
      "Request a presigned upload for a collection logo or banner image",
    )
    .argument("<slug>", "Collection slug")
    .argument(
      "<image_type>",
      "Image type: profile_picture (the logo) or banner_image",
    )
    .requiredOption(
      "--content-type <mime>",
      "MIME type of the image to upload (e.g. image/png)",
    )
    .action(
      async (
        slug: string,
        imageType: string,
        options: { contentType: string },
      ) => {
        const client = getClient()
        const result = await client.post(
          `/api/v2/collections/${pathSegment(slug)}/images/${pathSegment(imageType)}?content_type=${encodeURIComponent(options.contentType)}`,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("upload-page-media")
    .description(
      "Request an upload for a collection page image or MP4 video; with --file, upload it and print the token for update-metadata",
    )
    .argument("<slug>", "Collection slug")
    .argument(
      "<placement>",
      `Page placement (${PAGE_MEDIA_PLACEMENTS.join(", ")})`,
    )
    .requiredOption(
      "--content-type <mime>",
      "MIME type of the file (an image type, or video/mp4)",
    )
    .option("--file <path>", "Upload this file and print its token")
    .action(
      async (
        slug: string,
        placement: string,
        options: { contentType: string; file?: string },
      ) => {
        let bytes: Buffer | undefined
        if (options.file) {
          try {
            bytes = readFileSync(options.file)
          } catch (err) {
            throw new Error(
              `Could not read --file '${options.file}': ${(err as Error).message}`,
            )
          }
        }
        const collections = new CollectionsAPI(getClient())
        const context = await collections.createPageMediaUpload(
          slug,
          placement,
          options.contentType,
        )
        if (!bytes || !options.file) {
          console.log(formatOutput(context, getFormat()))
          return
        }
        const result = await uploadToContext(
          context,
          new Blob([new Uint8Array(bytes)], { type: options.contentType }),
          { filename: basename(options.file) },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("set-pricing-currency")
    .description(
      "Price secondary sales in the chain's USD stablecoin (USDG on Robinhood Chain) or its native currency",
    )
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--stablecoin <boolean>",
      "true for the USD stablecoin, false for the native currency",
    )
    .action(async (slug: string, options: { stablecoin: string }) => {
      const useStablecoin = parseBooleanOption(
        options.stablecoin,
        "--stablecoin",
      )
      const collections = new CollectionsAPI(getClient())
      const result = await collections.setPricingCurrency(slug, useStablecoin)
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("creator-fee-enforcement")
    .description(
      "Get whether creator fees are enforced onchain and whether the contract supports turning it on",
    )
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const collections = new CollectionsAPI(getClient())
      const result = await collections.creatorFeeEnforcement(slug)
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("set-creator-fee-enforcement")
    .description(
      "Build the transactions that turn creator fee enforcement on or off; with --send, sign and send them from the contract owner's wallet",
    )
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--enabled <boolean>",
      "true to enforce creator fees, false to stop",
    )
    .option(
      "--send",
      "Sign and send the transactions in order with the configured EVM wallet",
    )
    .option(
      "--wallet-provider <provider>",
      `Wallet provider to use with --send (${WALLET_PROVIDERS.join(", ")})`,
    )
    .action(
      async (
        slug: string,
        options: { enabled: string; send?: boolean; walletProvider?: string },
      ) => {
        const enabled = parseBooleanOption(options.enabled, "--enabled")
        const collections = new CollectionsAPI(getClient())
        const format = getFormat()
        if (!options.send) {
          const result =
            await collections.buildCreatorFeeEnforcementTransactions(
              slug,
              enabled,
            )
          console.log(formatOutput(result, format))
          return
        }

        const { transactions } =
          await collections.buildCreatorFeeEnforcementTransactions(
            slug,
            enabled,
          )
        if (transactions.length === 0) {
          console.error(
            `Creator fee enforcement is already ${enabled ? "on" : "off"}; nothing to send.`,
          )
          console.log(formatOutput({ hashes: [] }, format))
          return
        }
        const { wallet } = await openEvmWallet(
          options.walletProvider,
          "creator fee enforcement",
        )
        const results = await collections.sendTransactions(
          transactions,
          wallet,
          {
            onSending: sending =>
              console.error(
                `Sending creator fee enforcement transaction to ${sending.to} on chain ${sending.chain} (${sending.chainId})...`,
              ),
            onSent: sent => console.error(`Sent ${sent.hash}`),
          },
        )
        console.log(formatOutput({ hashes: results.map(r => r.hash) }, format))
      },
    )

  cmd
    .command("refresh")
    .description("Queue a refresh of a collection's metadata from its contract")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const collections = new CollectionsAPI(getClient())
      const result = await collections.refresh(slug)
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
