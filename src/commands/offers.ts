import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { outputGet } from "../output.js"
import { parseIntOption } from "../parse.js"

export function offersCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("offers").description("Query NFT offers")

  cmd
    .command("all")
    .description("Get all offers for a collection")
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
          `/api/v2/offers/collection/${collection}/all`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            next: options.next,
            maker: options.maker,
          },
        )
      },
    )

  cmd
    .command("by-nft")
    .description("Get all offers for a specific NFT")
    .argument("<collection>", "Collection slug")
    .argument("<token-id>", "Token ID")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (
        collection: string,
        tokenId: string,
        options: { limit: string; next?: string },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/offers/collection/${collection}/nfts/${tokenId}`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            next: options.next,
          },
        )
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
        await outputGet(
          client,
          getFormat(),
          `/api/v2/offers/collection/${collection}`,
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
        `/api/v2/offers/collection/${collection}/nfts/${tokenId}/best`,
      )
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
        await outputGet(
          client,
          getFormat(),
          `/api/v2/offers/collection/${collection}/traits`,
          {
            type: options.type,
            value: options.value,
            limit: parseIntOption(options.limit, "--limit"),
            next: options.next,
          },
        )
      },
    )

  return cmd
}
