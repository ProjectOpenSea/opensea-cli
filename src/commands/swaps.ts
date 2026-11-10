import { writeFileSync } from "node:fs"
import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import { parseFloatOption, readJsonBodyOption } from "../parse.js"
import {
  checkSavedSwapQuote,
  DEFAULT_SAVED_QUOTE_MAX_AGE_SECONDS,
  noQuoteKeyError,
  parseSavedSwapQuote,
  type SavedSwapQuote,
  verifySavedSwapQuoteMac,
} from "../saved-swap-quote.js"
import { resolveQuantity, SwapsAPI } from "../sdk.js"
import { loadOrCreateQuoteKey, readQuoteKey } from "../swap-quote-key.js"
import type { WalletProvider } from "../wallet/index.js"
import {
  createWalletForProvider,
  createWalletFromEnv,
  isEvmAdapter,
  WALLET_PROVIDERS,
  WrongChainTypeError,
} from "../wallet/index.js"

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
    .requiredOption(
      "--quantity <quantity>",
      "Amount to swap (decimals like 0.1 are auto-converted to smallest units)",
    )
    .requiredOption("--address <address>", "Wallet address executing the swap")
    .option(
      "--slippage <slippage>",
      "Slippage tolerance (0.0 to 0.5, default: 0.01)",
    )
    .option(
      "--recipient <recipient>",
      "Recipient address (defaults to sender address)",
    )
    .option(
      "--out <file>",
      "Also save the quote to <file> for `swaps execute --quote <file>`",
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
        out?: string
      }) => {
        const client = getClient()
        const quantity = await resolveQuantity(
          client,
          options.fromChain,
          options.fromAddress,
          options.quantity,
        )
        const slippage = options.slippage
          ? parseFloatOption(options.slippage, "--slippage")
          : undefined
        if (options.out) {
          const saved = await new SwapsAPI(client).quoteForExecution(
            { ...options, quantity, slippage },
            { macKey: loadOrCreateQuoteKey() },
          )
          writeFileSync(options.out, `${JSON.stringify(saved, null, 2)}\n`)
          console.error(`Saved quote to ${options.out}`)
          console.log(formatOutput(saved.response, getFormat()))
          return
        }
        await outputGet(client, getFormat(), "/api/v2/swap/quote", {
          from_chain: options.fromChain,
          from_address: options.fromAddress,
          to_chain: options.toChain,
          to_address: options.toAddress,
          quantity,
          address: options.address,
          slippage,
          recipient: options.recipient,
        })
      },
    )

  cmd
    .command("execute")
    .description(
      "Get a swap quote and execute it onchain using a managed wallet, or execute a quote " +
        "saved with `swaps quote --out` (--quote). " +
        "Supports Privy (default), Turnkey, Fireblocks, and Bankr providers.",
    )
    .option(
      "--from-chain <chain>",
      "Chain of the token to swap from (required unless --quote)",
    )
    .option(
      "--from-address <address>",
      "Contract address of the token to swap from (required unless --quote)",
    )
    .option(
      "--to-chain <chain>",
      "Chain of the token to swap to (required unless --quote)",
    )
    .option(
      "--to-address <address>",
      "Contract address of the token to swap to (required unless --quote)",
    )
    .option(
      "--quantity <quantity>",
      "Amount to swap (decimals like 0.1 are auto-converted to smallest units; required unless --quote)",
    )
    .option(
      "--slippage <slippage>",
      "Slippage tolerance (0.0 to 0.5, default: 0.01)",
    )
    .option(
      "--recipient <recipient>",
      "Recipient address (defaults to wallet address)",
    )
    .option(
      "--quote <file>",
      "Execute exactly the transactions of a quote saved with `swaps quote --out`, without re-quoting",
    )
    .option(
      "--max-age <seconds>",
      `With --quote, refuse a quote older than this (default: ${DEFAULT_SAVED_QUOTE_MAX_AGE_SECONDS})`,
    )
    .option(
      "--wallet-provider <provider>",
      `Wallet provider to use (${WALLET_PROVIDERS.join(", ")})`,
    )
    .option("--dry-run", "Print quote and transaction details without signing")
    .action(async (options: ExecuteOptions) => {
      let savedQuote: SavedSwapQuote | undefined
      let macKey: Uint8Array | undefined
      if (options.quote) {
        savedQuote = readSavedQuote(options)
        macKey = readQuoteKey()
        if (!macKey) throw noQuoteKeyError()
        verifySavedSwapQuoteMac(savedQuote, macKey)
      } else requireQuoteOptions(options)
      const maxAgeSeconds = options.maxAge
        ? parseFloatOption(options.maxAge, "--max-age")
        : undefined

      const wallet = options.walletProvider
        ? createWalletForProvider(options.walletProvider as WalletProvider)
        : createWalletFromEnv()
      // Swap execution builds EVM transactions, so a Solana wallet cannot run it yet. The
      // factory returns whatever is configured, so this is where the mismatch surfaces.
      if (!isEvmAdapter(wallet)) {
        console.error(
          `Error: ${new WrongChainTypeError(wallet, "evm", "swap execution").message}`,
        )
        process.exit(1)
      }
      const address = await wallet.getAddress()
      console.error(`Using ${wallet.name} wallet: ${address}`)

      const client = getClient()
      const swaps = new SwapsAPI(client)
      const format = getFormat()
      const onSending = (tx: { to: string; chain: string; chainId: number }) =>
        console.error(
          `Sending transaction to ${tx.to} on chain ${tx.chain} (${tx.chainId})...`,
        )

      if (savedQuote) {
        console.error(describeSavedQuote(savedQuote))
        if (options.dryRun) {
          checkSavedSwapQuote(savedQuote, {
            walletAddress: address,
            maxAgeSeconds,
          })
          console.log(formatOutput(savedQuote.response, format))
          return
        }
        await swaps.executeQuote(savedQuote, wallet, {
          macKey,
          maxAgeSeconds,
          onSending,
          onSent: result =>
            console.log(formatOutput({ hash: result.hash }, format)),
        })
        return
      }

      const quoteOptions = options as ExecuteOptions & QuoteShape
      const quantity = await resolveQuantity(
        client,
        quoteOptions.fromChain,
        quoteOptions.fromAddress,
        quoteOptions.quantity,
      )
      const slippage = options.slippage
        ? parseFloatOption(options.slippage, "--slippage")
        : undefined

      if (options.dryRun) {
        const quote = await swaps.quote({
          ...quoteOptions,
          quantity,
          address,
          slippage,
        })
        console.log(formatOutput(quote, format))
        return
      }

      const results = await swaps.execute(
        {
          ...quoteOptions,
          quantity,
          address,
          slippage,
        },
        wallet,
        {
          onQuote: () =>
            console.error(
              `Quote: ${quoteOptions.quantity} on ${quoteOptions.fromChain} → ${quoteOptions.toChain}`,
            ),
          onSending,
          onSkipped: tx =>
            console.error(`Skipping transaction on ${tx.chain}: ${tx.reason}`),
        },
      )

      for (const result of results) {
        console.log(formatOutput({ hash: result.hash }, format))
      }
    })

  return cmd
}

type QuoteShape = {
  fromChain: string
  fromAddress: string
  toChain: string
  toAddress: string
  quantity: string
}

type ExecuteOptions = Partial<QuoteShape> & {
  slippage?: string
  recipient?: string
  quote?: string
  maxAge?: string
  walletProvider?: string
  dryRun?: boolean
}

const QUOTE_FLAGS = [
  ["fromChain", "--from-chain <chain>"],
  ["fromAddress", "--from-address <address>"],
  ["toChain", "--to-chain <chain>"],
  ["toAddress", "--to-address <address>"],
  ["quantity", "--quantity <quantity>"],
] as const

const QUOTE_SHAPING_FLAGS = [
  ...QUOTE_FLAGS,
  ["slippage", "--slippage <slippage>"],
  ["recipient", "--recipient <recipient>"],
] as const

function requireQuoteOptions(options: ExecuteOptions): void {
  if (options.maxAge !== undefined) {
    throw new Error("--max-age applies only with --quote")
  }
  const missing = QUOTE_FLAGS.filter(([key]) => options[key] === undefined)
  if (missing.length > 0) {
    throw new Error(
      `required option(s) not specified: ${missing.map(([, flag]) => flag).join(", ")} (or pass --quote <file>)`,
    )
  }
}

function readSavedQuote(options: ExecuteOptions): SavedSwapQuote {
  const conflicting = QUOTE_SHAPING_FLAGS.filter(
    ([key]) => options[key] !== undefined,
  )
  if (conflicting.length > 0) {
    throw new Error(
      `--quote cannot be combined with ${conflicting.map(([, flag]) => flag.split(" ")[0]).join(", ")}: the saved quote already fixes them`,
    )
  }
  return parseSavedSwapQuote(
    readJsonBodyOption(options.quote as string, "--quote"),
  )
}

function describeSavedQuote(saved: SavedSwapQuote): string {
  const { request, response } = saved
  const lines = [
    `Saved quote from ${saved.saved_at} for ${request.address}:`,
    `  ${request.quantity} smallest units of ${request.from_address} on ${request.from_chain} -> ${request.to_address} on ${request.to_chain}`,
    `  Value in $${response.quote.total_cost_usd}, out $${response.quote.total_price_usd}, slippage ${response.quote.slippage_tolerance}`,
  ]
  lines.push(
    `  Recipient: ${request.recipient ?? `${request.address} (the wallet)`}`,
  )
  lines.push(`  ${response.transactions.length} transaction(s) to sign:`)
  response.transactions.forEach((tx, i) => {
    lines.push(
      `  ${i + 1}. to ${tx.to} on ${tx.chain}, value ${tx.value ?? "0"}`,
      `     data ${tx.data}`,
    )
  })
  return lines.join("\n")
}
