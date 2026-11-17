import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import {
  addPaginationOptions,
  parseIntOption,
  pathSegment,
  readJsonBodyOption,
  requireChainOption,
} from "../parse.js"
import type {
  FavoriteResponse,
  TokenBalanceSortBy,
  WalletVisibilityResponse,
  WatchlistRequest,
} from "../types/index.js"

export function accountsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("accounts").description("Query accounts")

  cmd
    .command("get")
    .description("Get an account by address")
    .argument("<address>", "Wallet address")
    .option("--include <fields>", "Expand public account fields (wallets)")
    .action(async (address: string, options: { include?: string }) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/accounts/${pathSegment(address)}`,
        options.include === undefined
          ? undefined
          : { include: options.include.split(",") },
      )
    })

  cmd
    .command("make-private")
    .description("Make a registered wallet private (requires write:wallets)")
    .argument("<wallet>", "Registered wallet address")
    .action(async (wallet: string) => {
      const client = getClient()
      const result = await client.put<WalletVisibilityResponse>(
        `/api/v2/accounts/wallets/${pathSegment(wallet)}/private`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("make-public")
    .description("Make a registered wallet public (requires write:wallets)")
    .argument("<wallet>", "Registered wallet address")
    .action(async (wallet: string) => {
      const client = getClient()
      const result = await client.delete<WalletVisibilityResponse>(
        `/api/v2/accounts/wallets/${pathSegment(wallet)}/private`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("agent-relationships")
    .description("Get public agent ownership relationships for a profile")
    .argument("<address_or_username>", "Wallet address or OpenSea username")
    .action(async (addressOrUsername: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/accounts/${pathSegment(addressOrUsername)}/agent-relationships`,
      )
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
          `/api/v2/account/${pathSegment(address)}/tokens`,
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
        `/api/v2/accounts/resolve/${pathSegment(identifier)}`,
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
        `/api/v2/account/${pathSegment(address)}/portfolio`,
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
        `/api/v2/account/${pathSegment(address)}/portfolio/history`,
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
          `/api/v2/account/${pathSegment(address)}/offers`,
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
          `/api/v2/account/${pathSegment(address)}/offers_received`,
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
          `/api/v2/account/${pathSegment(address)}/listings`,
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
          `/api/v2/account/${pathSegment(address)}/favorites`,
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
          `/api/v2/account/${pathSegment(address)}/collections`,
          {
            after: options.after,
            limit: parseIntOption(options.limit, "--limit"),
            chains: options.chains,
          },
        )
      },
    )

  cmd
    .command("pnl")
    .description("Get aggregated trading P&L (realized + unrealized)")
    .argument("<address>", "Wallet address")
    .action(async (address: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/account/${pathSegment(address)}/pnl`,
      )
    })

  addPaginationOptions(
    cmd
      .command("closed-positions")
      .description("Get closed (realized) trading positions for an account")
      .argument("<address>", "Wallet address")
      .option("--sort-by <field>", "Sort by field"),
  ).action(
    async (
      address: string,
      options: { sortBy?: string; limit: string; next?: string },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/account/${pathSegment(address)}/pnl/closed-positions`,
        {
          sort_by: options.sortBy,
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        },
      )
    },
  )

  addPaginationOptions(
    cmd
      .command("token-transfers")
      .description(
        "Get the token transfers contributing to a wallet's position in a currency",
      )
      .argument("<address>", "Wallet address")
      .requiredOption(
        "--contract-address <address>",
        "Contract address of the currency",
      )
      // Required, but checked in the action: see requireChainOption.
      .option("--chain <chain>", "Chain the currency lives on (required)"),
  ).action(
    async (
      address: string,
      options: {
        contractAddress: string
        chain?: string
        limit: string
        next?: string
      },
      command: Command,
    ) => {
      const chain = requireChainOption(options.chain, command)
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/account/${pathSegment(address)}/pnl/token-transfers`,
        {
          contract_address: options.contractAddress,
          chain,
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        },
      )
    },
  )

  cmd
    .command("relationship")
    .description(
      "Get the authenticated wallet's follow/watch relationship with an account (wallet auth required)",
    )
    .argument("<address_or_username>", "Wallet address or OpenSea username")
    .action(async (addressOrUsername: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/accounts/${pathSegment(addressOrUsername)}/relationship`,
      )
    })

  addPaginationOptions(
    cmd
      .command("followers")
      .description("List an account's followers")
      .argument("<address_or_username>", "Wallet address or OpenSea username"),
  ).action(
    async (
      addressOrUsername: string,
      options: { limit: string; next?: string },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/accounts/${pathSegment(addressOrUsername)}/followers`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          cursor: options.next,
        },
      )
    },
  )

  addPaginationOptions(
    cmd
      .command("following")
      .description("List the accounts an account is following")
      .argument("<address_or_username>", "Wallet address or OpenSea username"),
  ).action(
    async (
      addressOrUsername: string,
      options: { limit: string; next?: string },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/accounts/${pathSegment(addressOrUsername)}/following`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          cursor: options.next,
        },
      )
    },
  )

  cmd
    .command("follow")
    .description("Follow an account as the authenticated wallet")
    .argument("<address_or_username>", "Wallet address or OpenSea username")
    .action(async (addressOrUsername: string) => {
      const client = getClient()
      const result = await client.post(
        `/api/v2/accounts/${pathSegment(addressOrUsername)}/follow`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("unfollow")
    .description("Unfollow an account as the authenticated wallet")
    .argument("<address_or_username>", "Wallet address or OpenSea username")
    .action(async (addressOrUsername: string) => {
      const client = getClient()
      const result = await client.delete(
        `/api/v2/accounts/${pathSegment(addressOrUsername)}/follow`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("watch")
    .description("Watch an account as the authenticated wallet")
    .argument("<address_or_username>", "Wallet address or OpenSea username")
    .action(async (addressOrUsername: string) => {
      const client = getClient()
      const result = await client.post(
        `/api/v2/accounts/${pathSegment(addressOrUsername)}/watch`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("unwatch")
    .description("Unwatch an account as the authenticated wallet")
    .argument("<address_or_username>", "Wallet address or OpenSea username")
    .action(async (addressOrUsername: string) => {
      const client = getClient()
      const result = await client.delete(
        `/api/v2/accounts/${pathSegment(addressOrUsername)}/watch`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("token-watchlist")
    .description(
      "Get the authenticated wallet's token watchlist (wallet auth required)",
    )
    .argument("<address>", "Wallet address")
    .action(async (address: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/account/${pathSegment(address)}/token_watchlist`,
      )
    })

  cmd
    .command("perpetual-watchlist")
    .description(
      "Get the authenticated wallet's perpetual watchlist (wallet auth required)",
    )
    .argument("<address>", "Wallet address")
    .action(async (address: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/account/${pathSegment(address)}/perpetual_watchlist`,
      )
    })

  cmd
    .command("watchlist-add")
    .description(
      "Add an item, collection, or token to the authenticated wallet's watchlist",
    )
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the WatchlistRequest body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<WatchlistRequest>(
        options.body,
        "--body",
      )
      const result = await client.post<FavoriteResponse>(
        "/api/v2/watchlist",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("watchlist-remove")
    .description("Remove an entry from the authenticated wallet's watchlist")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the WatchlistRequest body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<WatchlistRequest>(
        options.body,
        "--body",
      )
      const result = await client.delete<FavoriteResponse>(
        "/api/v2/watchlist",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
