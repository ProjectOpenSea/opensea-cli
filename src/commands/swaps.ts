import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { parseFloatOption } from "../parse.js"
import { SwapsAPI } from "../sdk.js"
import type { SwapQuoteResponse } from "../types/index.js"
import type { WalletProvider } from "../wallet/index.js"
import { createWalletFromEnv, WALLET_PROVIDERS } from "../wallet/index.js"

export function swapsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("swaps").description(
    "Get swap quotes and execute token swaps",
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

  cmd
    .command("execute")
    .description(
      "Get a swap quote and execute it onchain using a managed wallet. " +
        "Supports Privy (default), Turnkey, and Fireblocks providers.",
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
    .option(
      "--slippage <slippage>",
      "Slippage tolerance (0.0 to 0.5, default: 0.01)",
    )
    .option(
      "--recipient <recipient>",
      "Recipient address (defaults to wallet address)",
    )
    .option(
      "--wallet-provider <provider>",
      `Wallet provider to use (${WALLET_PROVIDERS.join(", ")})`,
    )
    .option("--dry-run", "Print quote and transaction details without signing")
    .action(
      async (options: {
        fromChain: string
        fromAddress: string
        toChain: string
        toAddress: string
        quantity: string
        slippage?: string
        recipient?: string
        walletProvider?: string
        dryRun?: boolean
      }) => {
        const wallet = createWalletFromEnv(
          options.walletProvider as WalletProvider | undefined,
        )
        const address = await wallet.getAddress()
        console.error(`Using ${wallet.name} wallet: ${address}`)

        const swaps = new SwapsAPI(getClient())
        const format = getFormat()
        const slippage = options.slippage
          ? parseFloatOption(options.slippage, "--slippage")
          : undefined

        if (options.dryRun) {
          const quote = await swaps.quote({
            ...options,
            address,
            slippage,
          })
          console.log(formatOutput(quote, format))
          return
        }

        const results = await swaps.execute(
          {
            ...options,
            address,
            slippage,
          },
          wallet,
          {
            onQuote: () =>
              console.error(
                `Quote: ${options.quantity} on ${options.fromChain} → ${options.toChain}`,
              ),
            onSending: tx =>
              console.error(
                `Sending transaction to ${tx.to} on chain ${tx.chain} (${tx.chainId})...`,
              ),
            onSkipped: tx =>
              console.error(
                `Skipping transaction on ${tx.chain}: ${tx.reason}`,
              ),
          },
        )

        for (const result of results) {
          console.log(formatOutput({ hash: result.hash }, format))
        }
      },
    )

  return cmd
}
