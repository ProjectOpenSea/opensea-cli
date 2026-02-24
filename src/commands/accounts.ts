import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import { formatOutput } from "../output.js"
import type { Account } from "../types/index.js"

export function accountsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => "json" | "table",
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

  return cmd
}
