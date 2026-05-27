import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { outputGet } from "../output.js"

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
      await outputGet(client, getFormat(), "/api/v2/chains")
    })

  return cmd
}
