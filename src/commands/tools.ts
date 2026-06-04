import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { outputGet } from "../output.js"
import { parseIntOption } from "../parse.js"

export function toolsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("tools").description(
    "Search, list, and inspect registered AI agent tools (ERC-8257)",
  )

  cmd
    .command("search")
    .description("Search registered tools by name, tags, creator, or criteria")
    .option("--query <text>", "Search query text")
    .option("--registry-chain <chain>", "Filter by registry chain ID")
    .option("--tags <tags>", "Comma-separated tags to filter by")
    .option(
      "--access-type <type>",
      "Filter by access type (open, nft_gated, subscription)",
    )
    .option("--creator <address>", "Filter by creator address")
    .option(
      "--sort-by <sort>",
      "Sort order (relevance, newest, most_used)",
      "relevance",
    )
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (options: {
        query?: string
        registryChain?: string
        tags?: string
        accessType?: string
        creator?: string
        sortBy: string
        limit: string
        next?: string
      }) => {
        const client = getClient()
        await outputGet(client, getFormat(), "/api/v2/tools/search", {
          query: options.query,
          registry_chain: options.registryChain,
          tags: options.tags,
          access_type: options.accessType,
          creator: options.creator,
          sort_by: options.sortBy,
          limit: parseIntOption(options.limit, "--limit"),
          "cursor.value": options.next,
        })
      },
    )

  cmd
    .command("get")
    .description(
      "Get detailed info about a registered tool by its composite key",
    )
    .argument("<registry_chain>", "Registry chain ID (e.g., 8453 for Base)")
    .argument("<registry_addr>", "Registry contract address")
    .argument("<tool_id>", "Numeric tool ID")
    .action(
      async (registryChain: string, registryAddr: string, toolId: string) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/tools/${registryChain}/${registryAddr}/${toolId}`,
        )
      },
    )

  cmd
    .command("list")
    .description("List registered tools with optional sorting and filtering")
    .option("--sort-by <sort>", "Sort order (newest, oldest)", "newest")
    .option(
      "--type <type>",
      "Filter by access type (open, nft_gated, token_gated, subscription, gated)",
    )
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (options: {
        sortBy: string
        type?: string
        limit: string
        next?: string
      }) => {
        const client = getClient()
        await outputGet(client, getFormat(), "/api/v2/tools", {
          sort_by: options.sortBy,
          type: options.type,
          limit: parseIntOption(options.limit, "--limit"),
          "cursor.value": options.next,
        })
      },
    )

  return cmd
}
