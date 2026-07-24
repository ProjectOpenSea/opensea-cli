import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import {
  addLimitOption,
  addPaginationOptions,
  parseIntOption,
  readJsonBodyOption,
} from "../parse.js"
import type {
  BatchTokensRequest,
  Chain,
  TokenBatchResponse,
} from "../types/index.js"

export function tokensCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("tokens").description(
    "Query trending tokens, top tokens, and token details",
  )

  addPaginationOptions(
    cmd
      .command("trending")
      .description("Get trending tokens based on OpenSea's trending score")
      .option(
        "--chains <chains>",
        "Comma-separated list of chains to filter by",
      ),
    "Number of results (max 100)",
  ).action(
    async (options: { chains?: string; limit: string; next?: string }) => {
      const client = getClient()
      await outputGet(client, getFormat(), "/api/v2/tokens/trending", {
        chains: options.chains,
        limit: parseIntOption(options.limit, "--limit"),
        // Tokens API uses "cursor" instead of "next" as the query param
        cursor: options.next,
      })
    },
  )

  addPaginationOptions(
    cmd
      .command("top")
      .description("Get top tokens ranked by 24-hour trading volume")
      .option(
        "--chains <chains>",
        "Comma-separated list of chains to filter by",
      ),
    "Number of results (max 100)",
  ).action(
    async (options: { chains?: string; limit: string; next?: string }) => {
      const client = getClient()
      await outputGet(client, getFormat(), "/api/v2/tokens/top", {
        chains: options.chains,
        limit: parseIntOption(options.limit, "--limit"),
        // Tokens API uses "cursor" instead of "next" as the query param
        cursor: options.next,
      })
    },
  )

  cmd
    .command("get")
    .description("Get detailed information about a specific token")
    .argument("<chain>", "Blockchain chain")
    .argument("<address>", "Token contract address")
    .action(async (chain: string, address: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/chain/${chain as Chain}/token/${address}`,
      )
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
        await outputGet(
          client,
          getFormat(),
          `/api/v2/chain/${chain as Chain}/token/${address}/price_history`,
          {
            start_time: options.startTime,
            end_time: options.endTime,
            bucket_size: options.bucketSize,
          },
        )
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
        await outputGet(
          client,
          getFormat(),
          `/api/v2/chain/${chain as Chain}/token/${address}/ohlcv`,
          {
            start_time: options.startTime,
            bucket_size: options.bucketSize,
            end_time: options.endTime,
            fill_time_window: options.fillTimeWindow,
          },
        )
      },
    )

  addPaginationOptions(
    cmd
      .command("activity")
      .description("Get recent swap activity for a token")
      .argument("<chain>", "Chain")
      .argument("<address>", "Token contract address"),
    "Number of results (max 50)",
  ).action(
    async (
      chain: string,
      address: string,
      options: { limit: string; next?: string },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/chain/${chain as Chain}/token/${address}/activity`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          cursor: options.next,
        },
      )
    },
  )

  cmd
    .command("activity-stats")
    .description(
      "Get materialized trade count, USD volume, and average trade size for a token",
    )
    .argument("<chain>", "Chain")
    .argument("<address>", "Token contract address")
    .option("--windows <windows>", "Comma-separated windows (5m, 1h, 4h, 24h)")
    .action(
      async (chain: string, address: string, options: { windows?: string }) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/chain/${chain as Chain}/token/${address}/activity/stats`,
          { windows: options.windows },
        )
      },
    )

  addPaginationOptions(
    cmd
      .command("account-activity")
      .description(
        "Get fungible token activity for an account (transfers, swaps, wraps, unwraps)",
      )
      .argument("<address>", "Account address")
      .option("--chains <chains>", "Comma-separated chains to filter by")
      .option(
        "--tokens <tokens>",
        "Comma-separated token contract addresses to filter by",
      )
      .option(
        "--type <types>",
        "Comma-separated activity types (send, receive, swap, wrap, unwrap)",
      ),
    "Number of results per page",
  ).action(
    async (
      address: string,
      options: {
        limit: string
        next?: string
        chains?: string
        tokens?: string
        type?: string
      },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/account/${address}/token-activity`,
        {
          chains: options.chains,
          tokens: options.tokens,
          type: options.type,
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        },
      )
    },
  )

  addPaginationOptions(
    cmd
      .command("holders")
      .description(
        "Get paginated holders for a token (with aggregate distribution health)",
      )
      .argument("<chain>", "Chain")
      .argument("<address>", "Token contract address"),
    "Number of results (max 100)",
  )
    .option("--sort-by <field>", "Sort field (QUANTITY)")
    .option("--sort-direction <direction>", "Sort direction (asc|desc)")
    .action(
      async (
        chain: string,
        address: string,
        options: {
          limit: string
          next?: string
          sortBy?: string
          sortDirection?: string
        },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/chain/${chain as Chain}/token/${address}/holders`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            cursor: options.next,
            sort_by: options.sortBy,
            sort_direction: options.sortDirection,
          },
        )
      },
    )

  addLimitOption(
    cmd
      .command("liquidity-pools")
      .description("Get liquidity pools for a token")
      .argument("<chain>", "Chain")
      .argument("<address>", "Token contract address"),
    "Number of results (max 50)",
  ).action(
    async (chain: string, address: string, options: { limit: string }) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/chain/${chain as Chain}/token/${address}/liquidity-pools`,
        {
          limit: parseIntOption(options.limit, "--limit"),
        },
      )
    },
  )

  return cmd
}
