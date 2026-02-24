import { Command } from "commander"
import { OpenSeaAPIError, OpenSeaClient } from "./client.js"
import {
  accountsCommand,
  collectionsCommand,
  eventsCommand,
  listingsCommand,
  nftsCommand,
  offersCommand,
} from "./commands/index.js"

const program = new Command()

program
  .name("opensea")
  .description("OpenSea CLI - Query the OpenSea API from the command line")
  .version("0.1.0")
  .option("--api-key <key>", "OpenSea API key (or set OPENSEA_API_KEY env var)")
  .option("--chain <chain>", "Default chain", "ethereum")
  .option("--format <format>", "Output format (json or table)", "json")
  .option("--base-url <url>", "API base URL")

function getClient(): OpenSeaClient {
  const opts = program.opts<{
    apiKey?: string
    chain: string
    baseUrl?: string
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
  })
}

function getFormat(): "json" | "table" {
  const opts = program.opts<{ format: string }>()
  return opts.format === "table" ? "table" : "json"
}

program.addCommand(collectionsCommand(getClient, getFormat))
program.addCommand(nftsCommand(getClient, getFormat))
program.addCommand(listingsCommand(getClient, getFormat))
program.addCommand(offersCommand(getClient, getFormat))
program.addCommand(eventsCommand(getClient, getFormat))
program.addCommand(accountsCommand(getClient, getFormat))

program.hook("postAction", () => {})

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
    throw error
  }
}

main()
