import { readFileSync } from "node:fs"
import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import type {
  TransactionReceiptRequest,
  TransactionReceiptResponse,
} from "../types/index.js"

export function transactionsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("transactions").description(
    "Query transaction status and receipts",
  )

  cmd
    .command("receipt")
    .description(
      "Fetch transaction status. Works for listing fulfillments, " +
        "cross-chain buys, sweeps, offer fulfillments, and token swaps.",
    )
    .requiredOption(
      "--request <file>",
      "Path to a JSON file containing the request body " +
        "(at minimum a `swap_quote` object). " +
        "Optional fields: `transaction_identifiers`, `relay_request_id`, " +
        "`request_id`.",
    )
    .action(async (options: { request: string }) => {
      const client = getClient()
      let body: TransactionReceiptRequest
      try {
        body = JSON.parse(
          readFileSync(options.request, "utf8"),
        ) as TransactionReceiptRequest
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err)
        throw new Error(
          `--request: could not read or parse '${options.request}': ${cause}`,
        )
      }
      const result = await client.post<TransactionReceiptResponse>(
        "/api/v2/transactions/receipt",
        body,
      )
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
