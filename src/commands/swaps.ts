import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { parseFloatOption } from "../parse.js"
import type { SwapQuoteResponse } from "../types/index.js"

export function swapsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("swaps").description(
    "Get swap quotes for token trading",
  )

  cmd
    .command("quote")
    .description(
      "Get a quote for swapping tokens, including price details and executable transaction data",
    )
    .requiredOption("--from-chain <chain>", "Chain of the token to swap from")
    .requiredOption(
      "--from-address <address>",
      "Contract address of the token to swap from",
    )
    .requiredOption("--to-chain <chain>", "Chain of the token to swap to")
    .requiredOption(
      "--to-address <address>",
      "Contract address of the token to swap to",
    )
    .requiredOption("--quantity <quantity>", "Amount to swap (in token units)")
    .requiredOption("--address <address>", "Wallet address executing the swap")
    .option(
      "--slippage <slippage>",
      "Slippage tolerance (0.0 to 0.5, default: 0.01)",
    )
    .option(
      "--recipient <recipient>",
      "Recipient address (defaults to sender address)",
    )
    .action(
      async (options: {
        fromChain: string
        fromAddress: string
        toChain: string
        toAddress: string
        quantity: string
        address: string
        slippage?: string
        recipient?: string
      }) => {
        const client = getClient()
        const result = await client.get<SwapQuoteResponse>(
          "/api/v2/swap/quote",
          {
            from_chain: options.fromChain,
            from_address: options.fromAddress,
            to_chain: options.toChain,
            to_address: options.toAddress,
            quantity: options.quantity,
            address: options.address,
            slippage: options.slippage
              ? parseFloatOption(options.slippage, "--slippage")
              : undefined,
            recipient: options.recipient,
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  return cmd
}
