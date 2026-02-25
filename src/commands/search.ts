import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import { formatOutput } from "../output.js"
import type {
  SearchAccountResult,
  SearchCollectionResult,
  SearchNFTResult,
  SearchTokenResult,
} from "../types/index.js"

const SEARCH_COLLECTIONS_QUERY = `
query SearchCollections($query: String!, $limit: Int, $chains: [ChainIdentifier!]) {
  collectionsByQuery(query: $query, limit: $limit, chains: $chains) {
    slug
    name
    description
    imageUrl
    chain {
      identifier
      name
    }
    stats {
      totalSupply
      ownerCount
      volume {
        usd
      }
      sales
    }
    floorPrice {
      pricePerItem {
        usd
        native {
          unit
          symbol
        }
      }
    }
  }
}`

const SEARCH_NFTS_QUERY = `
query SearchItems($query: String!, $collectionSlug: String, $limit: Int, $chains: [ChainIdentifier!]) {
  itemsByQuery(query: $query, collectionSlug: $collectionSlug, limit: $limit, chains: $chains) {
    tokenId
    name
    description
    imageUrl
    contractAddress
    collection {
      slug
      name
    }
    chain {
      identifier
      name
    }
    bestListing {
      pricePerItem {
        usd
        native {
          unit
          symbol
        }
      }
    }
    owner {
      address
      displayName
    }
  }
}`

const SEARCH_TOKENS_QUERY = `
query SearchCurrencies($query: String!, $limit: Int, $chain: ChainIdentifier) {
  currenciesByQuery(query: $query, limit: $limit, chain: $chain, allowlistOnly: false) {
    name
    symbol
    imageUrl
    usdPrice
    contractAddress
    chain {
      identifier
      name
    }
    stats {
      marketCapUsd
      oneDay {
        priceChange
        volume
      }
    }
  }
}`

const SEARCH_ACCOUNTS_QUERY = `
query SearchAccounts($query: String!, $limit: Int) {
  accountsByQuery(query: $query, limit: $limit) {
    address
    username
    imageUrl
    isVerified
  }
}`

export function searchCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => "json" | "table",
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
          limit: Number.parseInt(options.limit, 10),
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
          limit: Number.parseInt(options.limit, 10),
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
          limit: Number.parseInt(options.limit, 10),
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
        limit: Number.parseInt(options.limit, 10),
      })
      console.log(formatOutput(result.accountsByQuery, getFormat()))
    })

  return cmd
}
