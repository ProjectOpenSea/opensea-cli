import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { parseIntOption } from "../parse.js"
import type { SearchResponse } from "../types/index.js"

export function searchCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("search")
    .description("Search across collections, tokens, NFTs, and accounts")
    .argument("<query>", "Search query")
    .option(
      "--types <types>",
      "Filter by type (comma-separated: collection,nft,token,account)",
    )
    .option("--chains <chains>", "Filter by chains (comma-separated)")
    .option("--limit <limit>", "Number of results", "20")
    .action(
      async (
        query: string,
        options: {
          types?: string
          chains?: string
          limit: string
        },
      ) => {
        const client = getClient()
        const params: Record<string, unknown> = {
          query,
          limit: parseIntOption(options.limit, "--limit"),
        }
        if (options.types) {
          params.asset_types = options.types
        }
        if (options.chains) {
          params.chains = options.chains
        }
        const result = await client.get<SearchResponse>(
          "/api/v2/search",
          params,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  return cmd
}
