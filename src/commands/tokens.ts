import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import { formatOutput } from "../output.js"
import type { Chain, Token, TokenDetails } from "../types/index.js"

export function tokensCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => "json" | "table",
): Command {
  const cmd = new Command("tokens").description(
    "Query trending tokens, top tokens, and token details",
  )

  cmd
    .command("trending")
    .description("Get trending tokens based on OpenSea's trending score")
    .option("--chains <chains>", "Comma-separated list of chains to filter by")
    .option("--limit <limit>", "Number of results (max 100)", "20")
    .option("--cursor <cursor>", "Pagination cursor")
    .action(
      async (options: { chains?: string; limit: string; cursor?: string }) => {
        const client = getClient()
        const result = await client.get<{ tokens: Token[]; next?: string }>(
          "/api/v2/tokens/trending",
          {
            chains: options.chains,
            limit: Number.parseInt(options.limit, 10),
            cursor: options.cursor,
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("top")
    .description("Get top tokens ranked by 24-hour trading volume")
    .option("--chains <chains>", "Comma-separated list of chains to filter by")
    .option("--limit <limit>", "Number of results (max 100)", "20")
    .option("--cursor <cursor>", "Pagination cursor")
    .action(
      async (options: { chains?: string; limit: string; cursor?: string }) => {
        const client = getClient()
        const result = await client.get<{ tokens: Token[]; next?: string }>(
          "/api/v2/tokens/top",
          {
            chains: options.chains,
            limit: Number.parseInt(options.limit, 10),
            cursor: options.cursor,
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("get")
    .description("Get detailed information about a specific token")
    .argument("<chain>", "Blockchain chain")
    .argument("<address>", "Token contract address")
    .action(async (chain: string, address: string) => {
      const client = getClient()
      const result = await client.get<TokenDetails>(
        `/api/v2/chain/${chain as Chain}/token/${address}`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
