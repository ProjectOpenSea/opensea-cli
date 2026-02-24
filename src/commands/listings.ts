import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import { formatOutput } from "../output.js"
import type { Listing } from "../types/index.js"

export function listingsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => "json" | "table",
): Command {
  const cmd = new Command("listings").description("Query NFT listings")

  cmd
    .command("all")
    .description("Get all listings for a collection")
    .argument("<collection>", "Collection slug")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (collection: string, options: { limit: string; next?: string }) => {
        const client = getClient()
        const result = await client.get<{
          listings: Listing[]
          next?: string
        }>(`/api/v2/listings/collection/${collection}/all`, {
          limit: Number.parseInt(options.limit, 10),
          next: options.next,
        })
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("best")
    .description("Get best listings for a collection")
    .argument("<collection>", "Collection slug")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (collection: string, options: { limit: string; next?: string }) => {
        const client = getClient()
        const result = await client.get<{
          listings: Listing[]
          next?: string
        }>(`/api/v2/listings/collection/${collection}/best`, {
          limit: Number.parseInt(options.limit, 10),
          next: options.next,
        })
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("best-for-nft")
    .description("Get best listing for a specific NFT")
    .argument("<collection>", "Collection slug")
    .argument("<token-id>", "Token ID")
    .action(async (collection: string, tokenId: string) => {
      const client = getClient()
      const result = await client.get<Listing>(
        `/api/v2/listings/collection/${collection}/nfts/${tokenId}/best`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
