import {
  contractsForChain,
  describeAddress,
  isUnlimitedAmount,
  type PlannedApproval,
  type PlannedStep,
  type PlannedTransaction,
  type SeaportItem,
  type SeaportOrderComponents,
} from "./guard.js"

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const NATIVE_FALLBACK: CurrencyInfo = { symbol: "native token", decimals: 18 }

export interface CurrencyInfo {
  symbol: string
  decimals: number
}

/** Resolves a currency's symbol and decimals; undefined when unknown. */
export type CurrencyLookup = (
  chainId: number,
  address: string,
) => Promise<CurrencyInfo | undefined>

export interface OrderSummary {
  side: "listing" | "offer"
  offerer: string
  items: string[]
  price: string
  fees: string[]
  /** Listing: what the seller receives. */
  proceeds?: string
  /** Offer: who receives the NFT. */
  recipient?: string
  starts: string
  expires: string
}

export interface StepSummary {
  step: number
  action: string
  type: "transaction" | "signature"
  chain_id: number
  description: string
  to?: string
  value?: string
  verifying_contract?: string
  order?: OrderSummary
  /** Set on an ERC-20 approval of the max uint256 amount. */
  unlimited_approval?: true
}

export interface PlanSummary {
  account: string
  steps: StepSummary[]
  /** Every distinct transaction `to`, in step order. */
  to_addresses: string[]
  warnings?: string[]
}

/** Format a base-unit amount with `decimals` places, trimming trailing zeros. */
export function formatUnits(raw: string | bigint, decimals: number): string {
  const value = BigInt(raw)
  const negative = value < 0n
  const abs = negative ? -value : value
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const fraction = (abs % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`
}

function isPaymentItem(item: SeaportItem): boolean {
  return item.itemType === 0 || item.itemType === 1
}

function describeNft(item: SeaportItem): string {
  const criteria = item.itemType === 4 || item.itemType === 5
  return criteria
    ? `${item.startAmount} x any token in ${item.token} matching criteria ${item.identifierOrCriteria}`
    : `${item.startAmount} x ${item.token} #${item.identifierOrCriteria}`
}

function formatTime(seconds: string): string {
  const ms = Number(BigInt(seconds)) * 1000
  return Number.isFinite(ms) && ms <= 8.64e15
    ? new Date(ms).toISOString()
    : seconds
}

function percent(part: bigint, total: bigint): string {
  if (total === 0n) return "0"
  const hundredths = (part * 10_000n) / total
  return formatUnits(hundredths, 2)
}

class Amounts {
  private readonly cache = new Map<string, Promise<CurrencyInfo | undefined>>()

  constructor(
    private readonly lookup: CurrencyLookup,
    private readonly chainId: number,
  ) {}

  private async currency(address: string): Promise<CurrencyInfo | undefined> {
    const key = address.toLowerCase()
    let pending = this.cache.get(key)
    if (!pending) {
      pending = this.lookup(this.chainId, address).catch(() => undefined)
      this.cache.set(key, pending)
    }
    const info = await pending
    return info ?? (key === ZERO_ADDRESS ? NATIVE_FALLBACK : undefined)
  }

  async format(raw: string | bigint, token: string): Promise<string> {
    const info = await this.currency(token)
    return info
      ? `${formatUnits(raw, info.decimals)} ${info.symbol}`
      : `${BigInt(raw)} base units of ${token}`
  }

  /** Sum per token, formatted and joined, for items that may mix currencies. */
  async total(
    items: Array<{ token: string; amount: bigint }>,
  ): Promise<string> {
    const sums = new Map<string, { token: string; amount: bigint }>()
    for (const { token, amount } of items) {
      const key = token.toLowerCase()
      const entry = sums.get(key) ?? { token, amount: 0n }
      entry.amount += amount
      sums.set(key, entry)
    }
    if (sums.size === 0) return "0"
    const parts = await Promise.all(
      [...sums.values()].map(({ token, amount }) => this.format(amount, token)),
    )
    return parts.join(" + ")
  }
}

function changing(start: string, end: string): string {
  return start === end ? start : `${start}, changing to ${end} by expiry`
}

/** Total of `items`, as a start-to-end range when the amounts change over the order's life. */
async function priceOf(
  amounts: Amounts,
  items: SeaportItem[],
): Promise<string> {
  const start = await amounts.total(
    items.map(i => ({ token: i.token, amount: BigInt(i.startAmount) })),
  )
  const end = await amounts.total(
    items.map(i => ({ token: i.token, amount: BigInt(i.endAmount) })),
  )
  return changing(start, end)
}

/** `amount to recipient`, with a comma before `to` when the amount is a range. */
function paidTo(amount: string, recipient: string): string {
  return amount.includes(", changing to ")
    ? `${amount}, to ${recipient}`
    : `${amount} to ${recipient}`
}

/**
 * Summarize a Seaport order. `seller` is set when the account accepts an
 * offer, and adds what it receives after the offer's fees.
 */
async function summarizeOrder(
  order: SeaportOrderComponents,
  side: "listing" | "offer",
  amounts: Amounts,
  chainId: number,
  seller?: string,
): Promise<OrderSummary> {
  const openseaFeeRecipient = contractsForChain(chainId)?.feeRecipient
  const offerer = order.offerer.toLowerCase()
  const timing = {
    starts: formatTime(order.startTime),
    expires: formatTime(order.endTime),
  }
  const describeFees = (
    fees: SeaportOrderComponents["consideration"],
    payments: SeaportItem[],
  ) =>
    Promise.all(
      fees.map(async fee => {
        const sameToken = payments.filter(
          p => p.token.toLowerCase() === fee.token.toLowerCase(),
        )
        const share =
          sameToken.length > 0
            ? ` (${percent(BigInt(fee.startAmount), sum(sameToken))}%)`
            : ""
        const kind =
          fee.recipient.toLowerCase() === openseaFeeRecipient
            ? "OpenSea fee"
            : "other payout"
        const detail = share ? `${share.slice(0, -1)}, ${kind})` : ` (${kind})`
        return `${paidTo(await priceOf(amounts, [fee]), fee.recipient)}${detail}`
      }),
    )
  const sum = (
    items: SeaportItem[],
    at: "startAmount" | "endAmount" = "startAmount",
  ) => items.reduce((acc, item) => acc + BigInt(item[at]), 0n)

  if (side === "listing") {
    const payments = order.consideration.filter(isPaymentItem)
    const toSeller = payments.filter(i => i.recipient.toLowerCase() === offerer)
    const fees = payments.filter(i => i.recipient.toLowerCase() !== offerer)
    return {
      side: "listing",
      offerer: order.offerer,
      items: order.offer.filter(i => !isPaymentItem(i)).map(describeNft),
      price: await priceOf(amounts, payments),
      fees: await describeFees(fees, payments),
      proceeds: paidTo(await priceOf(amounts, toSeller), order.offerer),
      ...timing,
    }
  }

  const payments = order.offer.filter(isPaymentItem)
  const nfts = order.consideration.filter(i => !isPaymentItem(i))
  const fees = order.consideration.filter(isPaymentItem)
  const tokens = new Set(
    [...payments, ...fees].map(item => item.token.toLowerCase()),
  )
  const proceeds =
    seller !== undefined && tokens.size === 1
      ? paidTo(
          changing(
            await amounts.format(sum(payments) - sum(fees), payments[0].token),
            await amounts.format(
              sum(payments, "endAmount") - sum(fees, "endAmount"),
              payments[0].token,
            ),
          ),
          seller,
        )
      : undefined
  return {
    side: "offer",
    offerer: order.offerer,
    items: nfts.map(describeNft),
    price: await priceOf(amounts, payments),
    fees: await describeFees(fees, payments),
    ...(proceeds !== undefined ? { proceeds } : {}),
    recipient: [...new Set(nfts.map(i => i.recipient))].join(", "),
    ...timing,
  }
}

function field(value: unknown, ...path: string[]): unknown {
  let current = value
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function describeAsset(asset: unknown, quantity?: unknown): string {
  const contract = String(field(asset, "contractAddress", "value"))
  const tokenId = String(field(asset, "tokenId") ?? "")
  const prefix = quantity === undefined ? "" : `${String(quantity)} x `
  return `${prefix}${contract} #${tokenId}`
}

function isUnlimitedPaymentApproval(step: PlannedTransaction): boolean {
  const approval = step.approval
  return (
    approval?.method === "approve" &&
    approval.asset === "payment" &&
    isUnlimitedAmount(approval.amount ?? "0")
  )
}

async function describeApproval(
  approval: PlannedApproval,
  amounts: Amounts,
  chainId: number,
): Promise<string> {
  const spender = `${approval.spender} (${describeAddress(approval.spender, chainId)})`
  if (approval.method === "setApprovalForAll") {
    return approval.approved
      ? `Approve ${spender} to transfer all your tokens in ${approval.contract}`
      : `Revoke ${spender}'s approval for ${approval.contract}`
  }
  const amount = approval.amount ?? "0"
  if (approval.asset === "item") {
    return `Approve ${spender} to transfer ${approval.contract} #${amount}`
  }
  const what = isUnlimitedAmount(amount)
    ? `an unlimited amount of ${approval.contract}`
    : await amounts.format(amount, approval.contract)
  return `Approve ${spender} to spend ${what}. The allowance is shared with your other open orders in this token, so this purchase or offer can use up what they rely on`
}

async function describeTransaction(
  step: PlannedTransaction,
  amounts: Amounts,
  nftRecipient: string,
): Promise<string> {
  if (step.approval)
    return describeApproval(step.approval, amounts, step.chainId)
  const details = step.details
  switch (step.action) {
    case "buyItemAction": {
      const items = list(details.assetQuantity).map(q =>
        describeAsset(
          field(q, "assetIdentifier"),
          field(q, "quantity", "value"),
        ),
      )
      const price = await amounts.total(
        list(details.paymentAssetQuantity).map(q => ({
          token: String(
            field(q, "assetIdentifier", "contractAddress", "value"),
          ),
          amount: BigInt(String(field(q, "quantity", "value") ?? "0")),
        })),
      )
      return `Buy ${items.join(", ")} for ${price} through Seaport; the NFTs go to ${nftRecipient}, the recipient requested`
    }
    case "acceptOfferAction": {
      const items = list(details.assetIdentifiers).map(a => describeAsset(a))
      return `Sell ${items.join(", ")} into the offer through Seaport`
    }
    case "cancelOrdersAction":
      return `Cancel order ${list(details.orderIds).join(", ")} onchain through Seaport`
    default:
      return `Fulfill through Seaport; the NFTs go to ${nftRecipient}, the recipient requested`
  }
}

/**
 * Describe a checked plan for a person to confirm: items, prices in human
 * units, fees and their recipients, and every address a step touches.
 */
export async function summarizePlan(
  steps: readonly PlannedStep[],
  account: string,
  lookup: CurrencyLookup,
  options?: {
    warnings?: string[]
    /** The offer an `acceptOfferAction` fills, for its price, fees and proceeds. */
    acceptedOffer?: SeaportOrderComponents
    /** Where bought NFTs go, when the request names a recipient other than the account. */
    recipient?: string
  },
): Promise<PlanSummary> {
  const amountsByChain = new Map<number, Amounts>()
  const amountsFor = (chainId: number) => {
    let amounts = amountsByChain.get(chainId)
    if (!amounts) {
      amounts = new Amounts(lookup, chainId)
      amountsByChain.set(chainId, amounts)
    }
    return amounts
  }

  const summaries = await Promise.all(
    steps.map(async (step, index): Promise<StepSummary> => {
      const amounts = amountsFor(step.chainId)
      const base = {
        step: index + 1,
        action: step.action,
        type: step.type,
        chain_id: step.chainId,
      }
      if (step.type === "signature") {
        const order = await summarizeOrder(
          step.order,
          step.side,
          amounts,
          step.chainId,
        )
        return {
          ...base,
          description: `Sign a Seaport ${step.side} of ${order.items.join(", ")} for ${order.price}, then post it to OpenSea`,
          verifying_contract: step.protocolAddress,
          order,
        }
      }
      const acceptedOffer =
        step.action === "acceptOfferAction" && options?.acceptedOffer
          ? await summarizeOrder(
              options.acceptedOffer,
              "offer",
              amounts,
              step.chainId,
              account,
            )
          : undefined
      const description = await describeTransaction(
        step,
        amounts,
        options?.recipient ?? account,
      )
      return {
        ...base,
        description: acceptedOffer
          ? description.replace(
              " into the offer ",
              ` into the offer for ${acceptedOffer.price} `,
            )
          : description,
        to: step.to,
        value:
          step.value === "0"
            ? "0"
            : await amounts.format(step.value, ZERO_ADDRESS),
        ...(isUnlimitedPaymentApproval(step)
          ? { unlimited_approval: true }
          : {}),
        ...(acceptedOffer ? { order: acceptedOffer } : {}),
      }
    }),
  )

  const allWarnings = [...(options?.warnings ?? [])]
  for (const [index, step] of steps.entries()) {
    if (step.action === "acceptOfferAction" && !options?.acceptedOffer) {
      allWarnings.push(
        `Step ${index + 1} sells into an offer whose terms could not be loaded; check its price with opensea orders get before sending`,
      )
    }
    const requested =
      step.type === "transaction" ? step.approval?.requestedAmount : undefined
    if (step.type === "transaction" && requested !== undefined) {
      const asked = isUnlimitedAmount(requested)
        ? "an unlimited amount"
        : `${requested} base units`
      allWarnings.push(
        `Step ${index + 1}: the API asked to approve ${asked} of ${step.to}; --send approves exactly ${step.approval?.amount} base units, what the plan spends`,
      )
    }
    if (step.type === "transaction" && isUnlimitedPaymentApproval(step)) {
      allWarnings.push(
        `Step ${index + 1} approves ${step.approval?.spender} to spend an unlimited amount of ${step.to}`,
      )
    }
  }

  const toAddresses: string[] = []
  for (const step of steps) {
    if (step.type === "transaction" && !toAddresses.includes(step.to)) {
      toAddresses.push(step.to)
    }
  }
  return {
    account,
    steps: summaries,
    to_addresses: toAddresses,
    ...(allWarnings.length > 0 ? { warnings: allWarnings } : {}),
  }
}
