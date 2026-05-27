import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { outputGet } from "../output.js"
import { parseIntOption } from "../parse.js"
import type { TokenBalanceSortBy } from "../types/index.js"

export function accountsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("accounts").description("Query accounts")

  cmd
    .command("get")
    .description("Get an account by address")
    .argument("<address>", "Wallet address")
    .action(async (address: string) => {
      const client = getClient()
      await outputGet(client, getFormat(), `/api/v2/accounts/${address}`)
    })

  cmd
    .command("tokens")
    .description("Get token balances for an account")
    .argument("<address>", "Wallet address")
    .option("--chains <chains>", "Comma-separated list of chains to filter by")
    .option("--limit <limit>", "Number of results", "20")
    .option(
      "--sort-by <field>",
      "Sort by field (USD_VALUE, MARKET_CAP, ONE_DAY_VOLUME, PRICE, ONE_DAY_PRICE_CHANGE, SEVEN_DAY_PRICE_CHANGE)",
    )
    .option("--sort-direction <dir>", "Sort direction (asc, desc)")
    .option("--next <cursor>", "Pagination cursor")
    .option("--no-spam-filter", "Disable spam token filtering")
    .action(
      async (
        address: string,
        options: {
          chains?: string
          limit: string
          sortBy?: string
          sortDirection?: string
          next?: string
          spamFilter: boolean
        },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/account/${address}/tokens`,
          {
            chains: options.chains,
            limit: parseIntOption(options.limit, "--limit"),
            sort_by: options.sortBy as TokenBalanceSortBy | undefined,
            sort_direction: options.sortDirection,
            cursor: options.next,
            disable_spam_filtering: options.spamFilter ? undefined : true,
          },
        )
      },
    )

  cmd
    .command("resolve")
    .description(
      "Resolve an ENS name, OpenSea username, or wallet address to canonical account info",
    )
    .argument(
      "<identifier>",
      "ENS name (e.g. vitalik.eth), OpenSea username, or wallet address",
    )
    .action(async (identifier: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/accounts/resolve/${identifier}`,
      )
    })

  cmd
    .command("portfolio")
    .description("Get portfolio stats (net worth, P&L) for an account")
    .argument("<address>", "Wallet address")
    .option("--timeframe <window>", "P&L window (HOUR, DAY, WEEK, MONTH)")
    .action(async (address: string, options: { timeframe?: string }) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/account/${address}/portfolio`,
        { timeframe: options.timeframe },
      )
    })

  cmd
    .command("portfolio-history")
    .description("Get portfolio net-worth history for an account")
    .argument("<address>", "Wallet address")
    .option("--timeframe <window>", "History window (HOUR, DAY, WEEK, MONTH)")
    .action(async (address: string, options: { timeframe?: string }) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/account/${address}/portfolio/history`,
        { timeframe: options.timeframe },
      )
    })

  cmd
    .command("offers")
    .description("Get active offers made by an account")
    .argument("<address>", "Wallet address")
    .option("--after <cursor>", "Pagination cursor")
    .option("--limit <limit>", "Number of results", "20")
    .option(
      "--collection-slugs <slugs>",
      "Comma-separated collection slugs to filter by",
    )
    .option("--chains <chains>", "Comma-separated chains to filter by")
    .option("--sort-by <field>", "Sort by field")
    .option("--sort-direction <dir>", "Sort direction (asc, desc)")
    .action(
      async (
        address: string,
        options: {
          after?: string
          limit: string
          collectionSlugs?: string
          chains?: string
          sortBy?: string
          sortDirection?: string
        },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/account/${address}/offers`,
          {
            after: options.after,
            limit: parseIntOption(options.limit, "--limit"),
            collection_slugs: options.collectionSlugs,
            chains: options.chains,
            sort_by: options.sortBy,
            sort_direction: options.sortDirection,
          },
        )
      },
    )

  cmd
    .command("offers-received")
    .description("Get offers received by an account")
    .argument("<address>", "Wallet address")
    .option("--after <cursor>", "Pagination cursor")
    .option("--limit <limit>", "Number of results", "20")
    .option(
      "--collection-slugs <slugs>",
      "Comma-separated collection slugs to filter by",
    )
    .option("--chains <chains>", "Comma-separated chains to filter by")
    .option("--sort-by <field>", "Sort by field")
    .option("--sort-direction <dir>", "Sort direction (asc, desc)")
    .action(
      async (
        address: string,
        options: {
          after?: string
          limit: string
          collectionSlugs?: string
          chains?: string
          sortBy?: string
          sortDirection?: string
        },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/account/${address}/offers_received`,
          {
            after: options.after,
            limit: parseIntOption(options.limit, "--limit"),
            collection_slugs: options.collectionSlugs,
            chains: options.chains,
            sort_by: options.sortBy,
            sort_direction: options.sortDirection,
          },
        )
      },
    )

  cmd
    .command("listings")
    .description("Get active listings for an account")
    .argument("<address>", "Wallet address")
    .option("--after <cursor>", "Pagination cursor")
    .option("--limit <limit>", "Number of results", "20")
    .option(
      "--collection-slugs <slugs>",
      "Comma-separated collection slugs to filter by",
    )
    .option("--chains <chains>", "Comma-separated chains to filter by")
    .option("--sort-by <field>", "Sort by field")
    .option("--sort-direction <dir>", "Sort direction (asc, desc)")
    .action(
      async (
        address: string,
        options: {
          after?: string
          limit: string
          collectionSlugs?: string
          chains?: string
          sortBy?: string
          sortDirection?: string
        },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/account/${address}/listings`,
          {
            after: options.after,
            limit: parseIntOption(options.limit, "--limit"),
            collection_slugs: options.collectionSlugs,
            chains: options.chains,
            sort_by: options.sortBy,
            sort_direction: options.sortDirection,
          },
        )
      },
    )

  cmd
    .command("favorites")
    .description("Get items favorited by an account")
    .argument("<address>", "Wallet address")
    .option("--after <cursor>", "Pagination cursor")
    .option("--limit <limit>", "Number of results", "20")
    .option("--sort-by <field>", "Sort by field")
    .option("--sort-direction <dir>", "Sort direction (asc, desc)")
    .option("--chains <chains>", "Comma-separated chains to filter by")
    .action(
      async (
        address: string,
        options: {
          after?: string
          limit: string
          sortBy?: string
          sortDirection?: string
          chains?: string
        },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/account/${address}/favorites`,
          {
            after: options.after,
            limit: parseIntOption(options.limit, "--limit"),
            sort_by: options.sortBy,
            sort_direction: options.sortDirection,
            chains: options.chains,
          },
        )
      },
    )

  cmd
    .command("collections")
    .description("Get collections owned by an account")
    .argument("<address>", "Wallet address")
    .option("--after <cursor>", "Pagination cursor")
    .option("--limit <limit>", "Number of results", "20")
    .option("--chains <chains>", "Comma-separated chains to filter by")
    .action(
      async (
        address: string,
        options: {
          after?: string
          limit: string
          chains?: string
        },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/account/${address}/collections`,
          {
            after: options.after,
            limit: parseIntOption(options.limit, "--limit"),
            chains: options.chains,
          },
        )
      },
    )

  return cmd
}
