import { Command } from "commander"
import { OpenSeaAPIError, OpenSeaClient } from "./client.js"
import {
  accountsCommand,
  collectionsCommand,
  eventsCommand,
  healthCommand,
  listingsCommand,
  nftsCommand,
  offersCommand,
  searchCommand,
  swapsCommand,
  tokensCommand,
} from "./commands/index.js"
import { type OutputFormat, setOutputOptions } from "./output.js"
import { parseIntOption } from "./parse.js"

const EXIT_API_ERROR = 1
const EXIT_AUTH_ERROR = 2
const EXIT_RATE_LIMITED = 3

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
  .option(
    "--fields <fields>",
    "Comma-separated list of fields to include in output",
  )
  .option("--max-lines <lines>", "Truncate output after N lines")

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
    process.exit(EXIT_AUTH_ERROR)
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

program.hook("preAction", () => {
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

program.addCommand(collectionsCommand(getClient, getFormat))
program.addCommand(nftsCommand(getClient, getFormat))
program.addCommand(listingsCommand(getClient, getFormat))
program.addCommand(offersCommand(getClient, getFormat))
program.addCommand(eventsCommand(getClient, getFormat))
program.addCommand(accountsCommand(getClient, getFormat))
program.addCommand(tokensCommand(getClient, getFormat))
program.addCommand(searchCommand(getClient, getFormat))
program.addCommand(swapsCommand(getClient, getFormat))
program.addCommand(healthCommand(getClient, getFormat))

async function main() {
  try {
    await program.parseAsync(process.argv)
  } catch (error) {
    if (error instanceof OpenSeaAPIError) {
      const isRateLimited = error.statusCode === 429
      console.error(
        JSON.stringify(
          {
            error: isRateLimited ? "Rate Limited" : "API Error",
            status: error.statusCode,
            path: error.path,
            message: error.responseBody,
          },
          null,
          2,
        ),
      )
      process.exit(isRateLimited ? EXIT_RATE_LIMITED : EXIT_API_ERROR)
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
    process.exit(EXIT_API_ERROR)
  }
}

main()
