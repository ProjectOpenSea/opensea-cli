import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { readJsonBodyOption } from "../parse.js"
import type { TransferRequest, TransferResponse } from "../types/index.js"

export function assetsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("assets").description(
    "Build asset-movement transactions",
  )

  cmd
    .command("transfer")
    .description(
      "Build transactions to transfer NFTs or tokens between wallets",
    )
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the TransferRequest body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<TransferRequest>(
        options.body,
        "--body",
      )
      const result = await client.post<TransferResponse>(
        "/api/v2/assets/transfer",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
