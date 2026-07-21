import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { readJsonBodyOption } from "../parse.js"
import type { CancelRequest } from "../types/index.js"

export function ordersCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("orders").description("Manage OpenSea orders")

  cmd
    .command("cancel")
    .description(
      "Cancel an order offchain as the authenticated wallet (wallet auth required)",
    )
    .argument("<chain>", "Chain the order lives on (e.g. ethereum, base)")
    .argument("<protocol_address>", "Seaport protocol contract address")
    .argument("<order_hash>", "Order hash to cancel")
    .option(
      "--body <path>",
      "Path to JSON file with an optional CancelRequest body (e.g. offererSignature)",
    )
    .action(
      async (
        chain: string,
        protocolAddress: string,
        orderHash: string,
        options: { body?: string },
      ) => {
        const client = getClient()
        const body = options.body
          ? readJsonBodyOption<CancelRequest>(options.body, "--body")
          : undefined
        const result = await client.post(
          `/api/v2/orders/chain/${chain}/protocol/${protocolAddress}/${orderHash}/cancel`,
          body,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  return cmd
}
