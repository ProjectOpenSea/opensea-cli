import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { parseIntOption } from "../parse.js"
import type { AssetEvent } from "../types/index.js"

export function eventsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("events").description("Query marketplace events")

  cmd
    .command("list")
    .description("List events")
    .option(
      "--event-type <type>",
      "Event type (sale, transfer, mint, listing, offer, trait_offer, collection_offer)",
    )
    .option("--after <timestamp>", "Filter events after this Unix timestamp")
    .option("--before <timestamp>", "Filter events before this Unix timestamp")
    .option("--chain <chain>", "Filter by chain")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (options: {
        eventType?: string
        after?: string
        before?: string
        chain?: string
        limit: string
        next?: string
      }) => {
        const client = getClient()
        const result = await client.get<{
          asset_events: AssetEvent[]
          next?: string
        }>("/api/v2/events", {
          event_type: options.eventType,
          after: options.after
            ? parseIntOption(options.after, "--after")
            : undefined,
          before: options.before
            ? parseIntOption(options.before, "--before")
            : undefined,
          chain: options.chain,
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        })
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("by-account")
    .description("Get events for an account")
    .argument("<address>", "Account address")
    .option("--event-type <type>", "Event type")
    .option("--chain <chain>", "Filter by chain")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (
        address: string,
        options: {
          eventType?: string
          chain?: string
          limit: string
          next?: string
        },
      ) => {
        const client = getClient()
        const result = await client.get<{
          asset_events: AssetEvent[]
          next?: string
        }>(`/api/v2/events/accounts/${address}`, {
          event_type: options.eventType,
          chain: options.chain,
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        })
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("by-collection")
    .description("Get events for a collection")
    .argument("<slug>", "Collection slug")
    .option("--event-type <type>", "Event type")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (
        slug: string,
        options: {
          eventType?: string
          limit: string
          next?: string
        },
      ) => {
        const client = getClient()
        const result = await client.get<{
          asset_events: AssetEvent[]
          next?: string
        }>(`/api/v2/events/collection/${slug}`, {
          event_type: options.eventType,
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        })
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("by-nft")
    .description("Get events for a specific NFT")
    .argument("<chain>", "Chain")
    .argument("<contract>", "Contract address")
    .argument("<token-id>", "Token ID")
    .option("--event-type <type>", "Event type")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (
        chain: string,
        contract: string,
        tokenId: string,
        options: {
          eventType?: string
          limit: string
          next?: string
        },
      ) => {
        const client = getClient()
        const result = await client.get<{
          asset_events: AssetEvent[]
          next?: string
        }>(
          `/api/v2/events/chain/${chain}/contract/${contract}/nfts/${tokenId}`,
          {
            event_type: options.eventType,
            limit: parseIntOption(options.limit, "--limit"),
            next: options.next,
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  return cmd
}
