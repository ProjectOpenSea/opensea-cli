import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import { formatOutput } from "../output.js"
import type { Offer } from "../types/index.js"

export function offersCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => "json" | "table",
): Command {
  const cmd = new Command("offers").description("Query NFT offers")

  cmd
    .command("all")
    .description("Get all offers for a collection")
    .argument("<collection>", "Collection slug")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (collection: string, options: { limit: string; next?: string }) => {
        const client = getClient()
        const result = await client.get<{
          offers: Offer[]
          next?: string
        }>(`/api/v2/offers/collection/${collection}/all`, {
          limit: Number.parseInt(options.limit, 10),
          next: options.next,
        })
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("collection")
    .description("Get collection offers")
    .argument("<collection>", "Collection slug")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (collection: string, options: { limit: string; next?: string }) => {
        const client = getClient()
        const result = await client.get<{
          offers: Offer[]
          next?: string
        }>(`/api/v2/offers/collection/${collection}`, {
          limit: Number.parseInt(options.limit, 10),
          next: options.next,
        })
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("best-for-nft")
    .description("Get best offer for a specific NFT")
    .argument("<collection>", "Collection slug")
    .argument("<token-id>", "Token ID")
    .action(async (collection: string, tokenId: string) => {
      const client = getClient()
      const result = await client.get<Offer>(
        `/api/v2/offers/collection/${collection}/nfts/${tokenId}/best`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("traits")
    .description("Get trait offers for a collection")
    .argument("<collection>", "Collection slug")
    .requiredOption("--type <type>", "Trait type (required)")
    .requiredOption("--value <value>", "Trait value (required)")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (
        collection: string,
        options: {
          type: string
          value: string
          limit: string
          next?: string
        },
      ) => {
        const client = getClient()
        const result = await client.get<{
          offers: Offer[]
          next?: string
        }>(`/api/v2/offers/collection/${collection}/traits`, {
          type: options.type,
          value: options.value,
          limit: Number.parseInt(options.limit, 10),
          next: options.next,
        })
        console.log(formatOutput(result, getFormat()))
      },
    )

  return cmd
}
