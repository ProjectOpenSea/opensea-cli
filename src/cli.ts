import { Command } from "commander"
import { OpenSeaAPIError, OpenSeaClient } from "./client.js"
import {
  accountsCommand,
  collectionsCommand,
  eventsCommand,
  listingsCommand,
  nftsCommand,
  offersCommand,
  searchCommand,
  swapsCommand,
  tokensCommand,
} from "./commands/index.js"
import type { OutputFormat } from "./output.js"
import { parseIntOption } from "./parse.js"

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

const program = new Command()

program
  .name("opensea")
  .description("OpenSea CLI - Query the OpenSea API from the command line")
  .version(process.env.npm_package_version ?? "0.0.0")
  .addHelpText("before", BANNER)
  .option("--api-key <key>", "OpenSea API key (or set OPENSEA_API_KEY env var)")
  .option("--chain <chain>", "Default chain", "ethereum")
  .option("--format <format>", "Output format (json, table, or toon)", "json")
  .option("--base-url <url>", "API base URL")
  .option("--timeout <ms>", "Request timeout in milliseconds", "30000")
  .option("--verbose", "Log request and response info to stderr")

function getClient(): OpenSeaClient {
  const opts = program.opts<{
    apiKey?: string
    chain: string
    baseUrl?: string
    timeout: string
    verbose?: boolean
  }>()

  const apiKey = opts.apiKey ?? process.env.OPENSEA_API_KEY
  if (!apiKey) {
    console.error(
      "Error: API key required. Use --api-key or set OPENSEA_API_KEY environment variable.",
    )
    process.exit(2)
  }

  return new OpenSeaClient({
    apiKey,
    chain: opts.chain,
    baseUrl: opts.baseUrl,
    timeout: parseIntOption(opts.timeout, "--timeout"),
    verbose: opts.verbose,
  })
}

function getFormat(): OutputFormat {
  const opts = program.opts<{ format: string }>()
  if (opts.format === "table") return "table"
  if (opts.format === "toon") return "toon"
  return "json"
}

program.addCommand(collectionsCommand(getClient, getFormat))
program.addCommand(nftsCommand(getClient, getFormat))
program.addCommand(listingsCommand(getClient, getFormat))
program.addCommand(offersCommand(getClient, getFormat))
program.addCommand(eventsCommand(getClient, getFormat))
program.addCommand(accountsCommand(getClient, getFormat))
program.addCommand(tokensCommand(getClient, getFormat))
program.addCommand(searchCommand(getClient, getFormat))
program.addCommand(swapsCommand(getClient, getFormat))

async function main() {
  try {
    await program.parseAsync(process.argv)
  } catch (error) {
    if (error instanceof OpenSeaAPIError) {
      console.error(
        JSON.stringify(
          {
            error: "API Error",
            status: error.statusCode,
            path: error.path,
            message: error.responseBody,
          },
          null,
          2,
        ),
      )
      process.exit(1)
    }
    const label =
      error instanceof TypeError ? "Network Error" : (error as Error).name
    console.error(
      JSON.stringify(
        {
          error: label,
          message: (error as Error).message,
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }
}

main()
