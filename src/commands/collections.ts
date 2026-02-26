import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { parseIntOption } from "../parse.js"
import type {
  Chain,
  Collection,
  CollectionOrderBy,
  CollectionStats,
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

  return cmd
}
