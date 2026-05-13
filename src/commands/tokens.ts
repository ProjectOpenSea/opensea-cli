import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { parseIntOption, readJsonBodyOption } from "../parse.js"
import type {
  BatchTokensRequest,
  Chain,
  OhlcvResponse,
  PriceHistoryResponse,
  Token,
  TokenBatchResponse,
  TokenDetails,
  TokenSwapActivityPaginatedResponse,
} from "../types/index.js"

export function tokensCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("tokens").description(
    "Query trending tokens, top tokens, and token details",
  )

  cmd
    .command("trending")
    .description("Get trending tokens based on OpenSea's trending score")
    .option("--chains <chains>", "Comma-separated list of chains to filter by")
    .option("--limit <limit>", "Number of results (max 100)", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (options: { chains?: string; limit: string; next?: string }) => {
        const client = getClient()
        const result = await client.get<{ tokens: Token[]; next?: string }>(
          "/api/v2/tokens/trending",
          {
            chains: options.chains,
            limit: parseIntOption(options.limit, "--limit"),
            // Tokens API uses "cursor" instead of "next" as the query param
            cursor: options.next,
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
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (options: { chains?: string; limit: string; next?: string }) => {
        const client = getClient()
        const result = await client.get<{ tokens: Token[]; next?: string }>(
          "/api/v2/tokens/top",
          {
            chains: options.chains,
            limit: parseIntOption(options.limit, "--limit"),
            // Tokens API uses "cursor" instead of "next" as the query param
            cursor: options.next,
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

  cmd
    .command("batch")
    .description(
      "Get multiple tokens in one request by chain + contract address",
    )
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the batch request body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<BatchTokensRequest>(
        options.body,
        "--body",
      )
      const result = await client.post<TokenBatchResponse>(
        "/api/v2/tokens/batch",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("price-history")
    .description("Get the price history of a token")
    .argument("<chain>", "Chain")
    .argument("<address>", "Token contract address")
    .requiredOption("--start-time <iso8601>", "Start time (ISO 8601)")
    .option("--end-time <iso8601>", "End time (ISO 8601, defaults to now)")
    .option(
      "--bucket-size <size>",
      "Candle bucket (1s, 1m, 5m, 15m, 1h, 4h, 1d)",
    )
    .action(
      async (
        chain: string,
        address: string,
        options: { startTime: string; endTime?: string; bucketSize?: string },
      ) => {
        const client = getClient()
        const result = await client.get<PriceHistoryResponse>(
          `/api/v2/chain/${chain as Chain}/token/${address}/price_history`,
          {
            start_time: options.startTime,
            end_time: options.endTime,
            bucket_size: options.bucketSize,
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("ohlcv")
    .description("Get OHLCV candles for a token")
    .argument("<chain>", "Chain")
    .argument("<address>", "Token contract address")
    .requiredOption("--start-time <iso8601>", "Start time (ISO 8601)")
    .requiredOption(
      "--bucket-size <size>",
      "Candle bucket (1s, 1m, 5m, 15m, 1h, 4h, 1d)",
    )
    .option("--end-time <iso8601>", "End time (defaults to now)")
    .option(
      "--fill-time-window",
      "Fill empty time windows with zero-volume candles",
    )
    .action(
      async (
        chain: string,
        address: string,
        options: {
          startTime: string
          bucketSize: string
          endTime?: string
          fillTimeWindow?: boolean
        },
      ) => {
        const client = getClient()
        const result = await client.get<OhlcvResponse>(
          `/api/v2/chain/${chain as Chain}/token/${address}/ohlcv`,
          {
            start_time: options.startTime,
            bucket_size: options.bucketSize,
            end_time: options.endTime,
            fill_time_window: options.fillTimeWindow,
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("activity")
    .description("Get recent swap activity for a token")
    .argument("<chain>", "Chain")
    .argument("<address>", "Token contract address")
    .option("--limit <limit>", "Number of results (max 50)", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (
        chain: string,
        address: string,
        options: { limit: string; next?: string },
      ) => {
        const client = getClient()
        const result = await client.get<TokenSwapActivityPaginatedResponse>(
          `/api/v2/chain/${chain as Chain}/token/${address}/activity`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            cursor: options.next,
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  return cmd
}
