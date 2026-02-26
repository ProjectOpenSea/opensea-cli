import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { parseIntOption } from "../parse.js"
import {
  SEARCH_ACCOUNTS_QUERY,
  SEARCH_COLLECTIONS_QUERY,
  SEARCH_NFTS_QUERY,
  SEARCH_TOKENS_QUERY,
} from "../queries.js"
import type {
  SearchAccountResult,
  SearchCollectionResult,
  SearchNFTResult,
  SearchTokenResult,
} from "../types/index.js"

export function searchCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("search").description(
    "Search for collections, NFTs, tokens, and accounts",
  )

  cmd
    .command("collections")
    .description("Search collections by name or slug")
    .argument("<query>", "Search query")
    .option("--chains <chains>", "Filter by chains (comma-separated)")
    .option("--limit <limit>", "Number of results", "10")
    .action(
      async (query: string, options: { chains?: string; limit: string }) => {
        const client = getClient()
        const result = await client.graphql<{
          collectionsByQuery: SearchCollectionResult[]
        }>(SEARCH_COLLECTIONS_QUERY, {
          query,
          limit: parseIntOption(options.limit, "--limit"),
          chains: options.chains?.split(","),
        })
        console.log(formatOutput(result.collectionsByQuery, getFormat()))
      },
    )

  cmd
    .command("nfts")
    .description("Search NFTs by name")
    .argument("<query>", "Search query")
    .option("--collection <slug>", "Filter by collection slug")
    .option("--chains <chains>", "Filter by chains (comma-separated)")
    .option("--limit <limit>", "Number of results", "10")
    .action(
      async (
        query: string,
        options: { collection?: string; chains?: string; limit: string },
      ) => {
        const client = getClient()
        const result = await client.graphql<{
          itemsByQuery: SearchNFTResult[]
        }>(SEARCH_NFTS_QUERY, {
          query,
          collectionSlug: options.collection,
          limit: parseIntOption(options.limit, "--limit"),
          chains: options.chains?.split(","),
        })
        console.log(formatOutput(result.itemsByQuery, getFormat()))
      },
    )

  cmd
    .command("tokens")
    .description("Search tokens/currencies by name or symbol")
    .argument("<query>", "Search query")
    .option("--chain <chain>", "Filter by chain")
    .option("--limit <limit>", "Number of results", "10")
    .action(
      async (query: string, options: { chain?: string; limit: string }) => {
        const client = getClient()
        const result = await client.graphql<{
          currenciesByQuery: SearchTokenResult[]
        }>(SEARCH_TOKENS_QUERY, {
          query,
          limit: parseIntOption(options.limit, "--limit"),
          chain: options.chain,
        })
        console.log(formatOutput(result.currenciesByQuery, getFormat()))
      },
    )

  cmd
    .command("accounts")
    .description("Search accounts by username or address")
    .argument("<query>", "Search query")
    .option("--limit <limit>", "Number of results", "10")
    .action(async (query: string, options: { limit: string }) => {
      const client = getClient()
      const result = await client.graphql<{
        accountsByQuery: SearchAccountResult[]
      }>(SEARCH_ACCOUNTS_QUERY, {
        query,
        limit: parseIntOption(options.limit, "--limit"),
      })
      console.log(formatOutput(result.accountsByQuery, getFormat()))
    })

  return cmd
}
