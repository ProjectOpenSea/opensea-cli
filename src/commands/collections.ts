import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { parseIntOption, readJsonBodyOption } from "../parse.js"
import type {
  BatchCollectionsRequest,
  Chain,
  Collection,
  CollectionBatchResponse,
  CollectionHoldersPaginatedResponse,
  CollectionOfferAggregatesPaginatedResponse,
  CollectionOrderBy,
  CollectionPaginatedResponse,
  CollectionStats,
  FloorPriceHistoryResponse,
  GetTraitsResponse,
} from "../types/index.js"

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
      const result = await client.get<Collection>(`/api/v2/collections/${slug}`)
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("list")
    .description("List collections")
    .option("--chain <chain>", "Filter by chain")
    .option(
      "--order-by <orderBy>",
      "Order by field (created_date, one_day_change, seven_day_volume, seven_day_change, num_owners, market_cap)",
    )
    .option("--creator <username>", "Filter by creator username")
    .option("--include-hidden", "Include hidden collections")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (options: {
        chain?: string
        orderBy?: string
        creator?: string
        includeHidden?: boolean
        limit: string
        next?: string
      }) => {
        const client = getClient()
        const result = await client.get<{
          collections: Collection[]
          next?: string
        }>("/api/v2/collections", {
          chain: options.chain as Chain | undefined,
          order_by: options.orderBy as CollectionOrderBy | undefined,
          creator_username: options.creator,
          include_hidden: options.includeHidden,
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        })
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("stats")
    .description("Get collection stats")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      const result = await client.get<CollectionStats>(
        `/api/v2/collections/${slug}/stats`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("traits")
    .description("Get collection traits")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      const result = await client.get<GetTraitsResponse>(
        `/api/v2/traits/${slug}`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("trending")
    .description("Get trending collections by sales activity")
    .option(
      "--timeframe <timeframe>",
      "Time window (one_minute, five_minutes, fifteen_minutes, one_hour, one_day, seven_days, thirty_days, one_year, all_time)",
      "one_day",
    )
    .option("--chains <chains>", "Comma-separated list of chains to filter by")
    .option(
      "--category <category>",
      "Category (art, gaming, memberships, music, pfps, photography, domain-names, virtual-worlds, sports-collectibles)",
    )
    .option("--limit <limit>", "Number of results (max 100)", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (options: {
        timeframe: string
        chains?: string
        category?: string
        limit: string
        next?: string
      }) => {
        const client = getClient()
        const result = await client.get<CollectionPaginatedResponse>(
          "/api/v2/collections/trending",
          {
            timeframe: options.timeframe,
            chains: options.chains,
            category: options.category,
            limit: parseIntOption(options.limit, "--limit"),
            cursor: options.next,
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("top")
    .description("Get top collections ranked by volume, sales, or floor price")
    .option(
      "--sort-by <field>",
      "Sort by (one_day_volume, seven_days_volume, thirty_days_volume, floor_price, one_day_sales, seven_days_sales, thirty_days_sales, total_volume, total_sales)",
      "one_day_volume",
    )
    .option("--chains <chains>", "Comma-separated list of chains to filter by")
    .option(
      "--category <category>",
      "Category (art, gaming, memberships, music, pfps, photography, domain-names, virtual-worlds, sports-collectibles)",
    )
    .option("--limit <limit>", "Number of results (max 100)", "50")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (options: {
        sortBy: string
        chains?: string
        category?: string
        limit: string
        next?: string
      }) => {
        const client = getClient()
        const result = await client.get<CollectionPaginatedResponse>(
          "/api/v2/collections/top",
          {
            sort_by: options.sortBy,
            chains: options.chains,
            category: options.category,
            limit: parseIntOption(options.limit, "--limit"),
            cursor: options.next,
          },
        )
        console.log(formatOutput(result, getFormat()))
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

  cmd
    .command("offer-aggregates")
    .description("Get top offers for a collection grouped by price level")
    .argument("<slug>", "Collection slug")
    .option("--limit <limit>", "Number of results (max 100)", "20")
    .option("--next <cursor>", "Pagination cursor")
    .option("--sort-direction <dir>", "Sort direction (asc, desc)")
    .action(
      async (
        slug: string,
        options: { limit: string; next?: string; sortDirection?: string },
      ) => {
        const client = getClient()
        const result =
          await client.get<CollectionOfferAggregatesPaginatedResponse>(
            `/api/v2/collections/${slug}/offer_aggregates`,
            {
              limit: parseIntOption(options.limit, "--limit"),
              cursor: options.next,
              sort_direction: options.sortDirection,
            },
          )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("holders")
    .description("Get holders of a collection")
    .argument("<slug>", "Collection slug")
    .option("--limit <limit>", "Number of results (max 100)", "20")
    .option("--next <cursor>", "Pagination cursor")
    .option("--sort-direction <dir>", "Sort direction (asc, desc)")
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
        const result = await client.get<CollectionHoldersPaginatedResponse>(
          `/api/v2/collections/${slug}/holders`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            cursor: options.next,
            sort_direction: options.sortDirection,
            owned_by: options.ownedBy,
          },
        )
        console.log(formatOutput(result, getFormat()))
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
        const result = await client.get<FloorPriceHistoryResponse>(
          `/api/v2/collections/${slug}/floor_prices`,
          {
            timeframe: options.timeframe,
            resolution: options.resolution
              ? parseIntOption(options.resolution, "--resolution")
              : undefined,
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  return cmd
}
