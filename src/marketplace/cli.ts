import { createInterface } from "node:readline/promises"
import type { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import { openEvmWallet } from "../commands/drops.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { pathSegment } from "../parse.js"
import type {
  CreateListingActionsRequest,
  CreateOfferActionsRequest,
  TokenDetails,
} from "../types/index.js"
import { CHAIN_IDS, resolveChainId, WALLET_PROVIDERS } from "../wallet/index.js"
import {
  createRpcReceiptWaiter,
  executePlan,
  MarketplaceExecutionError,
} from "./execute.js"
import {
  clampApprovals,
  type ExcessiveApproval,
  excessiveApprovals,
  MAX_ORDER_WINDOW_SECONDS,
  MarketplaceGuardError,
  normalizeSeaportOrder,
  type PlannedSignature,
  type PlannedStep,
  parseUnits,
  planDigest,
  type RequestedOrder,
} from "./guard.js"
import { type CurrencyLookup, summarizePlan } from "./summary.js"

export interface SendOptions {
  send?: boolean
  dryRun?: boolean
  walletProvider?: string
  rpcUrl?: string
  allowUnlimitedApproval?: boolean
  yes?: boolean
  expectPlan?: string
}

export function addSendOptions(cmd: Command): Command {
  return cmd
    .option(
      "--send",
      "Sign and send every returned step with the configured EVM wallet, posting any signed order",
    )
    .option(
      "--dry-run",
      "Print what --send would sign and send (items, prices, fees, recipients, addresses) without signing",
    )
    .option(
      "--wallet-provider <provider>",
      `Wallet provider to use with --send (${WALLET_PROVIDERS.join(", ")})`,
    )
    .option(
      "--rpc-url <url>",
      "RPC endpoint --send polls to wait for each transaction to confirm (defaults to the wallet's RPC URL)",
    )
    .option(
      "--yes",
      "Run --send without the confirmation prompt; required when stdin is not a terminal. Pass it only after the user approved the --dry-run summary",
    )
    .option(
      "--expect-plan <digest>",
      "Plan digest printed by --dry-run; --send refuses before using the wallet when the fresh plan differs. Required with --yes when stdin is not a terminal",
    )
    .option(
      "--allow-unlimited-approval",
      "Send the API's ERC-20 approvals unchanged (max uint256) instead of lowering them to what the plan spends",
    )
}

function chainSlugForId(chainId: number): string | undefined {
  return Object.entries(CHAIN_IDS).find(([, id]) => id === chainId)?.[0]
}

function currencyLookup(client: OpenSeaClient): CurrencyLookup {
  return async (chainId, address) => {
    const chain = chainSlugForId(chainId)
    if (!chain) return undefined
    const token = await client.get<TokenDetails>(
      `/api/v2/chain/${pathSegment(chain)}/token/${pathSegment(address)}`,
    )
    return { symbol: token.symbol, decimals: token.decimals }
  }
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

/**
 * The latest end time a request allows: its own `end_time`, or
 * `MAX_ORDER_WINDOW_SECONDS` from now when it names none.
 */
function latestEndTime(endTime: string | null | undefined): bigint {
  if (endTime === undefined || endTime === null) {
    return BigInt(Math.floor(Date.now() / 1000)) + MAX_ORDER_WINDOW_SECONDS
  }
  const ms = Date.parse(endTime)
  if (Number.isNaN(ms)) {
    throw new MarketplaceGuardError(
      `end_time ${endTime} is not an ISO 8601 time`,
    )
  }
  return BigInt(Math.floor(ms / 1000))
}

/** The request's `start_time` as unix seconds, when it names one. */
function earliestStartTime(startTime: string | null | undefined): {
  earliestStartTime?: bigint
} {
  if (startTime === undefined || startTime === null) return {}
  const ms = Date.parse(startTime)
  if (Number.isNaN(ms)) {
    throw new MarketplaceGuardError(
      `start_time ${startTime} is not an ISO 8601 time`,
    )
  }
  return { earliestStartTime: BigInt(Math.floor(ms / 1000)) }
}

/**
 * The total a request's price comes to in base units. The currency's
 * decimals come from the token endpoint; the native token has 18.
 */
async function requestedTotal(
  client: OpenSeaClient,
  chain: string,
  price: { amount: string; currency: string },
  quantity: number,
): Promise<bigint> {
  let decimals = 18
  if (price.currency.toLowerCase() !== ZERO_ADDRESS) {
    const token = await client
      .get<TokenDetails>(
        `/api/v2/chain/${pathSegment(chain)}/token/${pathSegment(price.currency)}`,
      )
      .catch(() => undefined)
    if (token?.decimals === undefined) {
      throw new MarketplaceGuardError(
        `Cannot check the order's price: the decimals of ${price.currency} on ${chain} are unknown`,
      )
    }
    decimals = token.decimals
  }
  try {
    return parseUnits(price.amount, decimals) * BigInt(quantity)
  } catch (err) {
    throw new MarketplaceGuardError(`price.amount ${(err as Error).message}`)
  }
}

/** The listing a `listings actions` request asks for, in base units. */
export async function requestedListing(
  client: OpenSeaClient,
  request: CreateListingActionsRequest,
): Promise<RequestedOrder> {
  const [item, ...more] = request.items
  if (!item || more.length > 0) {
    throw new MarketplaceGuardError(
      "--send and --dry-run handle one listing per request; list each item separately",
    )
  }
  return {
    side: "listing",
    nft: {
      token: item.contract,
      identifier: item.token_id,
      quantity: BigInt(item.quantity),
    },
    currency: item.price.currency,
    total: await requestedTotal(client, item.chain, item.price, item.quantity),
    latestEndTime: latestEndTime(item.end_time),
    ...earliestStartTime(item.start_time),
    ...(request.taker ? { taker: request.taker } : {}),
  }
}

/** The offer an `offers actions` request asks for, in base units. */
export async function requestedOffer(
  client: OpenSeaClient,
  request: CreateOfferActionsRequest,
): Promise<RequestedOrder> {
  return {
    side: "offer",
    nft: {
      token: request.item.contract,
      identifier: request.item.token_id,
      quantity: BigInt(request.quantity),
    },
    currency: request.price.currency,
    total: await requestedTotal(
      client,
      request.item.chain,
      request.price,
      request.quantity,
    ),
    latestEndTime: latestEndTime(request.end_time),
    ...earliestStartTime(request.start_time),
  }
}

function describeExcessive(approval: ExcessiveApproval): string {
  const spend =
    approval.required === 0n
      ? "but how much of it the plan spends could not be determined"
      : `but the plan spends at most ${approval.required}`
  return `step ${approval.step} (${approval.action}) approves ${approval.spender} for ${approval.amount} base units of ${approval.token}, ${spend}`
}

/** Ask `question` on the terminal and resolve true only for "y" or "yes". */
async function confirmOnTerminal(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    const answer = (await rl.question(question)).trim().toLowerCase()
    return answer === "y" || answer === "yes"
  } finally {
    rl.close()
  }
}

/**
 * The chain slug a signed order is posted under. Refuses an order signed for
 * a different chain than the request's, before any step runs.
 */
function orderChainFor(step: PlannedSignature, requested?: string): string {
  const chain = requested ?? chainSlugForId(step.chainId)
  if (!chain || resolveChainId(chain) !== step.chainId) {
    throw new MarketplaceGuardError(
      `Refusing to post the ${step.side}: it is signed for chain ${step.chainId}, not ${chain ?? "a known chain"}`,
    )
  }
  return chain
}

/**
 * Shared body of the marketplace commands. Without `--send` or `--dry-run`
 * it prints the API response unchanged. `--dry-run` checks and summarizes the
 * steps. `--send` checks them, then runs them with the configured wallet.
 */
export async function runMarketplaceSteps<T>(args: {
  client: OpenSeaClient
  format: OutputFormat
  options: SendOptions
  /** The address the request builds steps for (maker, fulfiller or buyer). */
  account: string
  purpose: string
  request: () => Promise<T>
  plan: (
    response: T,
    requestedOrder?: RequestedOrder,
    paymentAmount?: bigint,
  ) => { steps: PlannedStep[]; warnings?: string[] }
  /** What a purchase pays in its payment token, derived from the listings it buys. */
  paymentAmount?: () => Promise<bigint | undefined>
  /** The order a listing or offer request asks for, checked before signing. */
  requestedOrder?: () => Promise<RequestedOrder>
  /** Chain slug signed orders are posted under. */
  orderChain?: string
  /** Fetches the offer being accepted, so the summary can show its terms. */
  acceptedOffer?: () => Promise<unknown>
  /** NFT recipient the request names, when it differs from the account. */
  recipient?: string
}): Promise<void> {
  const { client, format, options } = args
  if (options.send && options.dryRun) {
    throw new MarketplaceGuardError(
      "Pass either --dry-run or --send, not both.",
    )
  }
  if (!options.send && !options.dryRun) {
    console.log(formatOutput(await args.request(), format))
    return
  }

  const plan = async (response: T) => {
    const requested = await args.requestedOrder?.()
    const paymentAmount = await args.paymentAmount?.().catch(() => undefined)
    const planned = args.plan(response, requested, paymentAmount)
    const steps = options.allowUnlimitedApproval
      ? planned.steps
      : clampApprovals(planned.steps)
    const orderChains = new Map(
      steps.flatMap(step =>
        step.type === "signature"
          ? [[step, orderChainFor(step, args.orderChain)] as const]
          : [],
      ),
    )
    const excessive = excessiveApprovals(steps)
    return {
      ...planned,
      steps,
      orderChains,
      excessive,
      digest: planDigest(steps),
    }
  }

  const loadAcceptedOffer = async (steps: PlannedStep[]) => {
    if (!args.acceptedOffer) return undefined
    if (!steps.some(step => step.action === "acceptOfferAction"))
      return undefined
    return normalizeSeaportOrder(
      await args.acceptedOffer().catch(() => undefined),
      { counterOptional: true },
    )
  }

  if (options.dryRun) {
    const { steps, warnings, excessive, digest } = await plan(
      await args.request(),
    )
    const summary = await summarizePlan(
      steps,
      args.account,
      currencyLookup(client),
      {
        warnings: [
          ...(warnings ?? []),
          ...excessive.map(
            approval =>
              `${describeExcessive(approval)}; --send refuses it unless --allow-unlimited-approval is passed`,
          ),
        ],
        acceptedOffer: await loadAcceptedOffer(steps),
        recipient: args.recipient,
      },
    )
    console.log(formatOutput({ ...summary, plan_digest: digest }, format))
    console.error(`Plan digest: ${digest}`)
    return
  }

  const interactive = process.stdin.isTTY === true
  if (!interactive && !options.yes) {
    throw new MarketplaceGuardError(
      "--send needs --yes when stdin is not a terminal. Run --dry-run, show the user the summary, and pass --yes --expect-plan <digest> only after they approve it.",
    )
  }
  if (!interactive && options.expectPlan === undefined) {
    throw new MarketplaceGuardError(
      "--send --yes without a terminal also needs --expect-plan <digest>, the plan digest --dry-run printed for the plan the user approved.",
    )
  }
  const { steps, warnings, orderChains, excessive, digest } = await plan(
    await args.request(),
  )
  if (excessive.length > 0 && !options.allowUnlimitedApproval) {
    throw new MarketplaceGuardError(
      `Refusing ${excessive.map(describeExcessive).join("; ")}. Pass --allow-unlimited-approval to send it anyway.`,
    )
  }
  if (
    options.expectPlan !== undefined &&
    options.expectPlan.toLowerCase() !== digest
  ) {
    throw new MarketplaceGuardError(
      `The plan changed since it was approved: its digest is ${digest}, not ${options.expectPlan}. Run --dry-run again and show the user the new summary.`,
    )
  }
  const { wallet, address } = await openEvmWallet(
    options.walletProvider,
    args.purpose,
  )
  if (address.toLowerCase() !== args.account.toLowerCase()) {
    throw new MarketplaceGuardError(
      `Wallet ${address} is not ${args.account}, the address in the request. Request the steps for the wallet's address.`,
    )
  }
  const acceptedOffer = await loadAcceptedOffer(steps)
  if (
    !acceptedOffer &&
    args.acceptedOffer &&
    steps.some(step => step.action === "acceptOfferAction")
  ) {
    throw new MarketplaceGuardError(
      "Refusing to accept the offer: its price and fees could not be loaded. Retry, or check it with opensea orders get.",
    )
  }
  const summary = await summarizePlan(
    steps,
    args.account,
    currencyLookup(client),
    { warnings, acceptedOffer, recipient: args.recipient },
  )
  for (const warning of summary.warnings ?? []) {
    console.error(`Warning: ${warning}`)
  }

  if (!options.yes) {
    console.error(formatOutput(summary, "json"))
    const noun = steps.length === 1 ? "step" : "steps"
    if (
      !(await confirmOnTerminal(
        `Sign and send ${steps.length} ${noun}? [y/N] `,
      ))
    ) {
      throw new MarketplaceGuardError("Cancelled. Nothing was signed or sent.")
    }
  }

  const rpcUrl = options.rpcUrl ?? wallet.getRpcUrl?.()
  if (!rpcUrl && steps.length > 1) {
    console.error(
      "No RPC URL: later steps will not wait for earlier transactions to confirm, so a signed order is posted before its approval confirms. Pass --rpc-url to wait.",
    )
  }

  try {
    const results = await executePlan(steps, {
      wallet,
      account: args.account,
      waitForReceipt: rpcUrl
        ? createRpcReceiptWaiter(rpcUrl, {
            onSkip: message => console.error(message),
          })
        : undefined,
      postOrder: (step, body) => {
        const chain =
          orderChains.get(step) ?? orderChainFor(step, args.orderChain)
        const kind = step.side === "listing" ? "listings" : "offers"
        return client.post(
          `/api/v2/orders/${pathSegment(chain)}/seaport/${kind}`,
          body,
        )
      },
      onStep: (_step, index) => {
        const described = summary.steps[index]
        const target =
          described.to !== undefined
            ? `to ${described.to}, value ${described.value}`
            : `verifying contract ${described.verifying_contract}`
        console.error(
          `Step ${index + 1}/${steps.length}: ${described.description} (${target})`,
        )
      },
      onDone: result =>
        console.error(
          result.hash
            ? `Sent ${result.hash}`
            : "Posted the signed order to OpenSea",
        ),
    })
    console.log(formatOutput({ steps: results }, format))
  } catch (err) {
    if (err instanceof MarketplaceExecutionError && err.completed.length > 0) {
      console.log(formatOutput({ steps: err.completed }, format))
    }
    throw err
  }
}
