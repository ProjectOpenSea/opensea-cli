import { Command } from "commander"
import { EXIT_AUTH_ERROR } from "./api-error.js"
import { getApiKeyFile, resolveApiKey } from "./auth/api-key.js"
import { DEFAULT_AUTH_BASE_URL } from "./auth/oauth-config.js"
import { canRefreshAutomatically, refreshForRequest } from "./auth/refresh.js"
import { loadCurrentToken } from "./auth/store.js"
import { DEFAULT_BASE_URL, OpenSeaClient } from "./client.js"
import {
  accountsCommand,
  agentCommand,
  apiCommand,
  assetsCommand,
  authCommand,
  chainsCommand,
  collectionsCommand,
  dropsCommand,
  eventsCommand,
  healthCommand,
  listingsCommand,
  loginCommand,
  nftsCommand,
  offersCommand,
  ordersCommand,
  profileCommand,
  searchCommand,
  signalsCommand,
  swapsCommand,
  tokenGroupsCommand,
  tokensCommand,
  toolsCommand,
  transactionsCommand,
  walletCommand,
  whoamiCommand,
} from "./commands/index.js"
import { type OutputFormat, setOutputOptions } from "./output.js"
import { forwardChainOption, parseIntOption } from "./parse.js"

declare const __VERSION__: string

const BANNER = `
   ____                   _____
  / __ \\                 / ____|
 | |  | |_ __   ___ _ _| (___   ___  __ _
 | |  | | '_ \\ / _ \\ '_ \\___ \\ / _ \\/ _\` |
 | |__| | |_) |  __/ | | |___) |  __/ (_| |
  \\____/| .__/ \\___|_| |_|____/ \\___|\\__,_|
        | |
        |_|
`

/** Build the `opensea` commander program with every subcommand registered. */
export function createProgram(): Command {
  const program = new Command()

  program
    .name("opensea")
    .description("OpenSea CLI - Query the OpenSea API from the command line")
    .version(__VERSION__)
    .addHelpText("before", BANNER)
    .option(
      "--api-key <key>",
      "OpenSea API key (or set OPENSEA_API_KEY; falls back to the key saved by auth request-key --save)",
    )
    .option("--chain <chain>", "Default chain", "ethereum")
    .option("--format <format>", "Output format (json, table, or toon)", "json")
    .option("--base-url <url>", "API base URL")
    .option("--timeout <ms>", "Request timeout in milliseconds", "30000")
    .option("--verbose", "Log request and response info to stderr")
    .option(
      "--fields <fields>",
      "Comma-separated list of fields to include in output",
    )
    .option("--max-lines <lines>", "Truncate output after N lines")
    .option("--max-retries <n>", "Max retries on 429/5xx (0 to disable)", "3")
    .option("--no-retry", "Disable request retries")
    .option(
      "--auth-token <token>",
      "Auth bearer token for wallet-authenticated endpoints (or set OPENSEA_AUTH_TOKEN env var)",
    )
    .option("--auth-base-url <url>", "Auth server base URL")
    .option(
      "--no-auth-refresh",
      "Do not refresh an expired or rejected stored wallet auth token automatically",
    )

  function getClient(): OpenSeaClient {
    const opts = program.opts<{
      apiKey?: string
      chain: string
      baseUrl?: string
      timeout: string
      verbose?: boolean
      maxRetries: string
      retry: boolean
      authToken?: string
      authBaseUrl?: string
      authRefresh: boolean
    }>()

    const apiKey = resolveApiKey(opts.apiKey)
    if (!apiKey) {
      console.error(
        `Error: API key required. Use --api-key, set OPENSEA_API_KEY, or run \`opensea auth request-key --save\` to save a free-tier key to ${getApiKeyFile()}.`,
      )
      process.exit(EXIT_AUTH_ERROR)
    }

    const maxRetries = opts.retry
      ? parseIntOption(opts.maxRetries, "--max-retries")
      : 0

    const explicitToken = opts.authToken ?? process.env.OPENSEA_AUTH_TOKEN
    // Only a token from the auth store can be refreshed: it carries the
    // refresh token and expiry that --auth-token and the env var lack.
    const stored = explicitToken === undefined ? loadCurrentToken() : undefined
    const authToken = explicitToken ?? stored?.accessToken
    const refreshTargets = {
      apiBaseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
      authBaseUrl: opts.authBaseUrl ?? DEFAULT_AUTH_BASE_URL,
    }
    const refresh =
      stored && opts.authRefresh && canRefreshAutomatically(refreshTargets)
        ? {
            authTokenExpiresAt: stored.expiresAt,
            refreshAuthToken: (reason: "expired" | "unauthorized") =>
              refreshForRequest(stored, reason, refreshTargets),
          }
        : {}

    return new OpenSeaClient({
      apiKey,
      authToken,
      chain: opts.chain,
      baseUrl: opts.baseUrl,
      timeout: parseIntOption(opts.timeout, "--timeout"),
      verbose: opts.verbose,
      maxRetries,
      ...refresh,
    })
  }

  function getFormat(): OutputFormat {
    const opts = program.opts<{ format: string }>()
    if (opts.format === "table") return "table"
    if (opts.format === "toon") return "toon"
    return "json"
  }

  program.hook("preAction", (_program, actionCommand) => {
    forwardChainOption(program, actionCommand)
    const opts = program.opts<{
      fields?: string
      maxLines?: string
    }>()
    let maxLines: number | undefined
    if (opts.maxLines) {
      maxLines = parseIntOption(opts.maxLines, "--max-lines")
      if (maxLines < 1) {
        console.error("Error: --max-lines must be >= 1")
        process.exit(2)
      }
    }
    setOutputOptions({
      fields: opts.fields?.split(",").map(f => f.trim()),
      maxLines,
    })
  })

  program.addCommand(assetsCommand(getClient, getFormat))
  program.addCommand(apiCommand(getClient, getFormat))
  program.addCommand(chainsCommand(getClient, getFormat))
  program.addCommand(collectionsCommand(getClient, getFormat))
  program.addCommand(dropsCommand(getClient, getFormat))
  program.addCommand(nftsCommand(getClient, getFormat))
  program.addCommand(listingsCommand(getClient, getFormat))
  program.addCommand(offersCommand(getClient, getFormat))
  program.addCommand(ordersCommand(getClient, getFormat))
  program.addCommand(eventsCommand(getClient, getFormat))
  program.addCommand(accountsCommand(getClient, getFormat))
  program.addCommand(agentCommand(getClient, getFormat))
  program.addCommand(profileCommand(getClient, getFormat))
  program.addCommand(tokensCommand(getClient, getFormat))
  program.addCommand(tokenGroupsCommand(getClient, getFormat))
  program.addCommand(
    authCommand(
      () => program.opts<{ baseUrl?: string }>().baseUrl,
      getFormat,
      () => program.opts<{ authBaseUrl?: string }>().authBaseUrl,
      getClient,
      () => {
        // `--timeout` carries a commander default, so it is always a string
        // here, same as the getClient() block above.
        const opts = program.opts<{ timeout: string; verbose?: boolean }>()
        return {
          timeout: parseIntOption(opts.timeout, "--timeout"),
          verbose: opts.verbose,
        }
      },
    ),
  )
  program.addCommand(
    loginCommand(
      getFormat,
      () => program.opts<{ authBaseUrl?: string }>().authBaseUrl,
      () => program.opts<{ baseUrl?: string }>().baseUrl,
    ),
  )
  program.addCommand(searchCommand(getClient, getFormat))
  program.addCommand(signalsCommand(getClient, getFormat))
  program.addCommand(swapsCommand(getClient, getFormat))
  program.addCommand(toolsCommand(getClient, getFormat))
  program.addCommand(transactionsCommand(getClient, getFormat))
  program.addCommand(healthCommand(getClient, getFormat))
  program.addCommand(walletCommand(getFormat))
  program.addCommand(whoamiCommand(getFormat))

  return program
}
