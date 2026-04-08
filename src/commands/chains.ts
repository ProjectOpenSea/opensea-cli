import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import type { ChainListResponse } from "../types/index.js"

export function chainsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("chains").description("Query supported blockchains")

  cmd
    .command("list")
    .description("List all supported blockchains and their capabilities")
    .action(async () => {
      const client = getClient()
      const result = await client.get<ChainListResponse>("/api/v2/chains")
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
