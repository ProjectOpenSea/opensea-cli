import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import {
  addLimitOption,
  addPaginationOptions,
  parseIntOption,
} from "../parse.js"

export function toolsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("tools").description(
    "Search, list, and inspect registered AI agent tools (ERC-8257)",
  )

  addPaginationOptions(
    cmd
      .command("search")
      .description(
        "Search registered tools by name, tags, creator, or criteria",
      )
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
      ),
  ).action(
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
        cursor: options.next,
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

  addLimitOption(
    cmd
      .command("activity")
      .description("Get payment and usage activity for a registered tool")
      .argument("<registry_chain>", "Registry chain ID (e.g., 8453 for Base)")
      .argument("<registry_addr>", "Registry contract address")
      .argument("<tool_id>", "Numeric tool ID")
      .option(
        "--include-creator-payments",
        "Include payments attributed only by creator address",
      )
      .option("--offset <offset>", "Offset for pagination"),
    "Number of results (max 100)",
  ).action(
    async (
      registryChain: string,
      registryAddr: string,
      toolId: string,
      options: {
        limit: string
        offset?: string
        includeCreatorPayments?: boolean
      },
    ) => {
      const client = getClient()
      const offset = options.offset
        ? parseIntOption(options.offset, "--offset")
        : undefined
      await outputGet(
        client,
        getFormat(),
        `/api/v2/tools/${registryChain}/${registryAddr}/${toolId}/activity`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          offset,
          include_creator_payments: options.includeCreatorPayments,
        },
      )
    },
  )

  addPaginationOptions(
    cmd
      .command("list")
      .description("List registered tools with optional sorting and filtering")
      .option("--sort-by <sort>", "Sort order (newest, oldest)", "newest")
      .option(
        "--type <type>",
        "Filter by access type (open, nft_gated, token_gated, subscription, gated)",
      ),
  ).action(
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
        cursor: options.next,
      })
    },
  )

  const savedCmd = new Command("saved").description(
    "Manage tools saved to the authenticated wallet (wallet auth required)",
  )

  addPaginationOptions(
    savedCmd
      .command("list")
      .description("List tools saved to the authenticated wallet")
      .option("--toolkit-name <name>", "Filter by toolkit name"),
  ).action(
    async (options: { toolkitName?: string; limit: string; next?: string }) => {
      const client = getClient()
      await outputGet(client, getFormat(), "/api/v2/saved-tools", {
        toolkit_name: options.toolkitName,
        limit: parseIntOption(options.limit, "--limit"),
        cursor: options.next,
      })
    },
  )

  savedCmd
    .command("save")
    .description("Save a registered tool to the authenticated wallet")
    .argument("<registry_chain>", "Registry chain ID (e.g., 8453 for Base)")
    .argument("<registry_addr>", "Registry contract address")
    .argument("<tool_id>", "Numeric tool ID")
    .option("--toolkit-name <name>", "Toolkit name")
    .action(
      async (
        registryChain: string,
        registryAddr: string,
        toolId: string,
        options: { toolkitName?: string },
      ) => {
        const client = getClient()
        const body: Record<string, unknown> = {
          tool_id: toolId,
          registry_chain: registryChain,
          registry_addr: registryAddr,
        }
        if (options.toolkitName != null) {
          body.toolkit_name = options.toolkitName
        }
        const result = await client.post("/api/v2/saved-tools", body)
        console.log(formatOutput(result, getFormat()))
      },
    )

  savedCmd
    .command("remove")
    .description("Remove a saved tool from the authenticated wallet")
    .argument("<registry_chain>", "Registry chain ID (e.g., 8453 for Base)")
    .argument("<registry_addr>", "Registry contract address")
    .argument("<tool_id>", "Numeric tool ID")
    .option("--toolkit-name <name>", "Toolkit name")
    .action(
      async (
        registryChain: string,
        registryAddr: string,
        toolId: string,
        options: { toolkitName?: string },
      ) => {
        const client = getClient()
        const params: Record<string, unknown> = {
          tool_id: toolId,
          registry_chain: registryChain,
          registry_addr: registryAddr,
        }
        if (options.toolkitName != null) {
          params.toolkit_name = options.toolkitName
        }
        const result = await client.delete(
          "/api/v2/saved-tools",
          undefined,
          params,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd.addCommand(savedCmd)

  return cmd
}
