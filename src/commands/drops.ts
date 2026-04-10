import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { parseIntOption } from "../parse.js"
import type {
  DropDetailedResponse,
  DropMintResponse,
  DropPaginatedResponse,
} from "../types/index.js"

export function dropsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("drops").description("Query and mint NFT drops")

  cmd
    .command("list")
    .description("List drops (featured, upcoming, or recently minted)")
    .option(
      "--type <type>",
      "Drop type: featured, upcoming, or recently_minted",
      "featured",
    )
    .option("--chains <chains>", "Comma-separated list of chains to filter by")
    .option("--limit <limit>", "Number of results (max 100)", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (options: {
        type: string
        chains?: string
        limit: string
        next?: string
      }) => {
        const client = getClient()
        const result = await client.get<DropPaginatedResponse>(
          "/api/v2/drops",
          {
            type: options.type,
            chains: options.chains,
            limit: parseIntOption(options.limit, "--limit"),
            cursor: options.next,
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("get")
    .description("Get detailed drop info by collection slug")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      const result = await client.get<DropDetailedResponse>(
        `/api/v2/drops/${slug}`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("mint")
    .description("Build a mint transaction for a drop")
    .argument("<slug>", "Collection slug")
    .requiredOption("--minter <address>", "Wallet address to receive tokens")
    .option("--quantity <n>", "Number of tokens to mint", "1")
    .action(
      async (
        slug: string,
        options: {
          minter: string
          quantity: string
        },
      ) => {
        const client = getClient()
        const result = await client.post<DropMintResponse>(
          `/api/v2/drops/${slug}/mint`,
          {
            minter: options.minter,
            quantity: parseIntOption(options.quantity, "--quantity"),
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  return cmd
}
