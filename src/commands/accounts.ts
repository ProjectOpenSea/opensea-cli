import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { parseIntOption } from "../parse.js"
import type {
  Account,
  AccountResolveResponse,
  TokenBalancePaginatedResponse,
  TokenBalanceSortBy,
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
    .action(async (address: string) => {
      const client = getClient()
      const result = await client.get<Account>(`/api/v2/accounts/${address}`)
      console.log(formatOutput(result, getFormat()))
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
        const result = await client.get<TokenBalancePaginatedResponse>(
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
        console.log(formatOutput(result, getFormat()))
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
      const result = await client.get<AccountResolveResponse>(
        `/api/v2/accounts/resolve/${identifier}`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
