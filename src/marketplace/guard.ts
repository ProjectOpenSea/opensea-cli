/**
 * Safety checks for signing and sending the steps the marketplace action
 * endpoints return. Every rule `--send` relies on lives here:
 *
 * - A transaction goes to Seaport on its chain, unless it is an approval, and
 *   calls a Seaport fulfillment function, or `cancel` for a cancel step.
 * - An approval goes to the token or NFT contract the step names, and only
 *   approves Seaport or OpenSea's conduit on its chain, with no native value.
 * - An EIP-712 order is a Seaport `OrderComponents` whose domain names the
 *   chain's Seaport as `verifyingContract` and whose offerer is the account.
 * - Every step is built for the account that will sign it.
 *
 * Seaport and conduit addresses come from `@opensea/sdk`, per chain, the same
 * constants the SDK uses to build orders, so this module adds no addresses of
 * its own. A chain the SDK does not know is refused.
 */

import { createHash } from "node:crypto"
import { keccak_256 } from "@noble/hashes/sha3.js"
import {
  Chain,
  getChainId,
  getDefaultConduit,
  getFeeRecipient,
  getSeaportAddress,
  getSignedZone,
} from "@opensea/sdk"
import type { SignTypedDataRequest } from "../wallet/index.js"
import { resolveChainId } from "../wallet/index.js"

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const MAX_UINT256 = (1n << 256n) - 1n

/** Seaport and OpenSea's conduit on one chain, lowercased. */
export interface ChainContracts {
  seaport: string
  conduit: string
  /** OpenSea's marketplace fee recipient on the chain. */
  feeRecipient: string
  /** OpenSea's SignedZone, whose orders carry a fresh zone signature in `extraData`. */
  signedZone: string
}

function sdkChainId(chain: Chain): number | undefined {
  try {
    return Number(getChainId(chain))
  } catch {
    return undefined
  }
}

const CONTRACTS_BY_CHAIN_ID: ReadonlyMap<number, ChainContracts> = new Map(
  (Object.values(Chain) as Chain[]).flatMap(chain => {
    const chainId = sdkChainId(chain)
    if (chainId === undefined) return []
    const contracts: ChainContracts = {
      seaport: getSeaportAddress(chain).toLowerCase(),
      conduit: getDefaultConduit(chain).address.toLowerCase(),
      feeRecipient: getFeeRecipient(chain).toLowerCase(),
      signedZone: getSignedZone(chain).toLowerCase(),
    }
    return [[chainId, contracts] as const]
  }),
)

/** Seaport and OpenSea's conduit on `chainId`, or undefined for a chain the SDK does not know. */
export function contractsForChain(chainId: number): ChainContracts | undefined {
  return CONTRACTS_BY_CHAIN_ID.get(chainId)
}

function requireChainContracts(chainId: number, label: string): ChainContracts {
  const contracts = contractsForChain(chainId)
  if (!contracts) {
    throw new MarketplaceGuardError(
      `Refusing ${label}: --send does not support chain ${chainId} yet; run without --send`,
    )
  }
  return contracts
}

/** "Seaport", "OpenSea conduit", or undefined for any other address on `chainId`. */
export function describeAddress(
  address: string,
  chainId: number,
): string | undefined {
  const contracts = contractsForChain(chainId)
  const lower = address.toLowerCase()
  if (lower === contracts?.seaport) return "Seaport"
  if (lower === contracts?.conduit) return "OpenSea conduit"
  return undefined
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Thrown when a step fails a safety check. Nothing has been signed or sent for that step. */
export class MarketplaceGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MarketplaceGuardError"
  }
}

/** Seaport 1.6 functions a buy or an offer acceptance may call, by selector. */
const SEAPORT_FULFILLMENT_FUNCTIONS: Record<string, string> = {
  "0x00000000": "fulfillBasicOrder_efficient_6GL6yc",
  "0xfb0f3ee1": "fulfillBasicOrder",
  "0xb3a34c4c": "fulfillOrder",
  "0xe7acab24": "fulfillAdvancedOrder",
  "0xed98a574": "fulfillAvailableOrders",
  "0x87201b41": "fulfillAvailableAdvancedOrders",
  "0xa8174404": "matchOrders",
  "0xf2d12b12": "matchAdvancedOrders",
}

/**
 * Seaport 1.6 fulfillment functions whose first argument holds AdvancedOrders,
 * the only ones that carry per-order `extraData`:
 * fulfillAdvancedOrder(AdvancedOrder,CriteriaResolver[],bytes32,address),
 * fulfillAvailableAdvancedOrders(AdvancedOrder[],...) and
 * matchAdvancedOrders(AdvancedOrder[],...). An AdvancedOrder is
 * (OrderParameters parameters, uint120 numerator, uint120 denominator,
 * bytes signature, bytes extraData), and OrderParameters starts with
 * (address offerer, address zone, ...). Vendored here because the CLI has no
 * ABI library and `@opensea/sdk` does not export Seaport's ABI.
 */
const ADVANCED_ORDER_FUNCTIONS: Record<string, "one" | "array"> = {
  "0xe7acab24": "one",
  "0x87201b41": "array",
  "0xf2d12b12": "array",
}

/** Byte length of SignedZone `extraData` through the end of its 64-byte signature. */
const SIGNED_ZONE_SIGNED_BYTES = 93

export interface SignedZoneSegment {
  /** Byte offset of the order's `extraData` content in the calldata after the selector. */
  offset: number
  fulfiller: string
}

/**
 * Locate the `extraData` of every AdvancedOrder in Seaport calldata whose
 * zone is `signedZone` and whose `extraData` uses the SIP-6 version 0x00
 * layout OpenSea's SignedZone issues: version byte, 20-byte expected
 * fulfiller, 8-byte expiration, 64-byte signature, then context. Returns
 * nothing for other functions, zones or layouts, or calldata it cannot
 * decode.
 */
export function signedZoneExtraData(
  data: string,
  signedZone: string,
): SignedZoneSegment[] {
  const shape = ADVANCED_ORDER_FUNCTIONS[data.slice(0, 10).toLowerCase()]
  if (!shape) return []
  const body = data.slice(10).toLowerCase()
  const size = Math.floor(body.length / 2)
  const word = (offset: number): bigint => {
    if (!Number.isInteger(offset) || offset < 0 || offset + 32 > size) {
      throw new Error("out of range")
    }
    return BigInt(`0x${body.slice(offset * 2, offset * 2 + 64)}`)
  }
  const pointer = (offset: number): number => {
    const value = word(offset)
    if (value > BigInt(size)) throw new Error("out of range")
    return Number(value)
  }
  try {
    const orders: number[] = []
    const first = pointer(0)
    if (shape === "one") {
      orders.push(first)
    } else {
      const length = pointer(first)
      const elements = first + 32
      for (let i = 0; i < length; i++) {
        orders.push(elements + pointer(elements + 32 * i))
      }
    }
    const segments: SignedZoneSegment[] = []
    for (const order of orders) {
      const parameters = order + pointer(order)
      const zone = `0x${word(parameters + 32)
        .toString(16)
        .padStart(40, "0")}`
      if (zone !== signedZone.toLowerCase()) continue
      const extraData = order + pointer(order + 128)
      const length = pointer(extraData)
      const offset = extraData + 32
      if (length < SIGNED_ZONE_SIGNED_BYTES || offset + length > size) continue
      if (body.slice(offset * 2, offset * 2 + 2) !== "00") continue
      segments.push({
        offset,
        fulfiller: `0x${body.slice(offset * 2 + 2, offset * 2 + 42)}`,
      })
    }
    return segments
  } catch {
    return []
  }
}

/**
 * Calldata with the parts OpenSea's SignedZone regenerates on every fetch,
 * each order's 8-byte expiration and 64-byte signature, zeroed. Everything
 * else, including the fulfiller the zone signed for, is kept.
 */
function maskSignedZoneExtraData(data: string, signedZone: string): string {
  let body = data.slice(10).toLowerCase()
  for (const { offset } of signedZoneExtraData(data, signedZone)) {
    const from = (offset + 21) * 2
    const to = (offset + SIGNED_ZONE_SIGNED_BYTES) * 2
    body = body.slice(0, from) + "0".repeat(to - from) + body.slice(to)
  }
  return `${data.slice(0, 10).toLowerCase()}${body}`
}

/**
 * Seaport 1.6 functions an onchain cancel may call, by selector. Only
 * `cancel`: `incrementCounter` invalidates every open order of the account,
 * and the API returns it only as a `cancelAllOrdersAction`, never run here.
 */
const SEAPORT_CANCEL_FUNCTIONS: Record<string, string> = {
  "0xfd9f1e10": "cancel",
}

export type SeaportCallKind = "fulfillment" | "cancel"

const APPROVE_SELECTOR = "0x095ea7b3"
const SET_APPROVAL_FOR_ALL_SELECTOR = "0xa22cb465"

export interface DecodedApproval {
  method: "approve" | "setApprovalForAll"
  /** The address being approved: the ERC-20 spender or the NFT operator. */
  spender: string
  /** `approve` only: the ERC-20 amount, or the ERC-721 token id, as a decimal string. */
  amount?: string
  /** `setApprovalForAll` only: false revokes. */
  approved?: boolean
}

/**
 * Decode `approve(address,uint256)` or `setApprovalForAll(address,bool)`
 * calldata. Returns undefined for anything else, including calldata with
 * trailing bytes or a malformed address word.
 */
export function decodeApproval(data: string): DecodedApproval | undefined {
  const hex = data.toLowerCase()
  if (!/^0x[0-9a-f]{136}$/.test(hex)) return undefined
  const selector = hex.slice(0, 10)
  const addressWord = hex.slice(10, 74)
  const valueWord = BigInt(`0x${hex.slice(74)}`)
  if (!addressWord.startsWith("0".repeat(24))) return undefined
  const spender = `0x${addressWord.slice(24)}`
  if (selector === APPROVE_SELECTOR) {
    return { method: "approve", spender, amount: valueWord.toString() }
  }
  if (selector === SET_APPROVAL_FOR_ALL_SELECTOR && valueWord <= 1n) {
    return { method: "setApprovalForAll", spender, approved: valueWord === 1n }
  }
  return undefined
}

/** True when an ERC-20 approval amount is the max uint256 "unlimited" sentinel. */
export function isUnlimitedAmount(amount: string): boolean {
  return BigInt(amount) === MAX_UINT256
}

export interface TransactionToCheck {
  /** Human label for error messages, such as `step 2 (itemApprovalAction)`. */
  label: string
  from?: string
  to: string
  data: string
  /** Native value in wei, decimal. */
  value: string
  chainId: number
  /**
   * Set for an approval step: the token or NFT contract the step says it
   * approves. The transaction must go to that contract. Unset for every other
   * step, which must go to Seaport.
   */
  approves?: string
  /** Which Seaport functions a non-approval step may call. Defaults to fulfillment. */
  seaportCall?: SeaportCallKind
}

/**
 * Check one transaction against the rules above. Returns the decoded approval
 * for an approval step, and throws `MarketplaceGuardError` on any violation.
 */
export function checkTransaction(
  tx: TransactionToCheck,
  account: string,
): DecodedApproval | undefined {
  const refuse = (reason: string) =>
    new MarketplaceGuardError(`Refusing ${tx.label}: ${reason}`)
  const contracts = requireChainContracts(tx.chainId, tx.label)
  if (!EVM_ADDRESS.test(tx.to)) {
    throw refuse(`'to' ${tx.to} is not an EVM address`)
  }
  if (tx.from !== undefined && !sameAddress(tx.from, account)) {
    throw refuse(`it is built for ${tx.from}, not ${account}`)
  }
  if (tx.approves === undefined) {
    if (tx.to.toLowerCase() !== contracts.seaport) {
      throw refuse(
        `'to' ${tx.to} is not Seaport on chain ${tx.chainId}. Only Seaport calls and approvals of Seaport or an OpenSea conduit are sent.`,
      )
    }
    const kind = tx.seaportCall ?? "fulfillment"
    const allowed =
      kind === "cancel"
        ? SEAPORT_CANCEL_FUNCTIONS
        : SEAPORT_FULFILLMENT_FUNCTIONS
    const selector = tx.data.slice(0, 10).toLowerCase()
    const hasSelector = /^0x[0-9a-f]{8}$/.test(selector)
    if (!hasSelector || !(selector in allowed)) {
      throw refuse(
        `it calls Seaport with selector ${hasSelector ? selector : "(none)"}, which is not one of the ${kind} functions (${Object.values(allowed).join(", ")})`,
      )
    }
    for (const segment of signedZoneExtraData(tx.data, contracts.signedZone)) {
      if (!sameAddress(segment.fulfiller, account)) {
        throw refuse(
          `its SignedZone authorization is for fulfiller ${segment.fulfiller}, not ${account}`,
        )
      }
    }
    return undefined
  }
  if (!sameAddress(tx.to, tx.approves)) {
    throw refuse(
      `'to' ${tx.to} is not ${tx.approves}, the contract the step approves`,
    )
  }
  const approval = decodeApproval(tx.data)
  if (!approval) {
    throw refuse("its calldata is not an approve or setApprovalForAll call")
  }
  if (!describeAddress(approval.spender, tx.chainId)) {
    throw refuse(
      `it approves ${approval.spender}, which is neither Seaport nor an OpenSea conduit on chain ${tx.chainId}`,
    )
  }
  if (BigInt(tx.value) !== 0n) {
    throw refuse("an approval must not send native value")
  }
  return approval
}

export interface SeaportItem {
  itemType: number
  token: string
  identifierOrCriteria: string
  startAmount: string
  endAmount: string
}

export interface SeaportConsiderationItem extends SeaportItem {
  recipient: string
}

/** Seaport `OrderComponents`, every uint256 as a decimal or hex string. */
export interface SeaportOrderComponents {
  offerer: string
  zone: string
  offer: SeaportItem[]
  consideration: SeaportConsiderationItem[]
  orderType: number
  startTime: string
  endTime: string
  zoneHash: string
  salt: string
  conduitKey: string
  counter: string
}

function uintString(value: unknown, field: string): string {
  if (typeof value === "string" && /^(0x[0-9a-fA-F]+|\d+)$/.test(value)) {
    return value
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value)
  }
  throw new Error(`${field} is not an unsigned integer`)
}

function addressString(value: unknown, field: string): string {
  if (typeof value === "string" && EVM_ADDRESS.test(value)) return value
  throw new Error(`${field} is not an EVM address`)
}

function bytes32String(value: unknown, field: string): string {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)) {
    return value
  }
  throw new Error(`${field} is not a bytes32 hex string`)
}

function normalizeItem(value: unknown, field: string): SeaportItem {
  if (!isRecord(value)) throw new Error(`${field} is not an object`)
  return {
    itemType: Number(uintString(value.itemType, `${field}.itemType`)),
    token: addressString(value.token, `${field}.token`),
    identifierOrCriteria: uintString(
      value.identifierOrCriteria,
      `${field}.identifierOrCriteria`,
    ),
    startAmount: uintString(value.startAmount, `${field}.startAmount`),
    endAmount: uintString(value.endAmount, `${field}.endAmount`),
  }
}

function normalizeOrder(
  message: Record<string, unknown>,
  counterOptional = false,
): SeaportOrderComponents {
  const list = (value: unknown, field: string): unknown[] => {
    if (!Array.isArray(value)) throw new Error(`${field} is not an array`)
    return value
  }
  return {
    offerer: addressString(message.offerer, "offerer"),
    zone: addressString(message.zone, "zone"),
    offer: list(message.offer, "offer").map((item, i) =>
      normalizeItem(item, `offer[${i}]`),
    ),
    consideration: list(message.consideration, "consideration").map(
      (item, i) => {
        const field = `consideration[${i}]`
        return {
          ...normalizeItem(item, field),
          recipient: addressString(
            isRecord(item) ? item.recipient : undefined,
            `${field}.recipient`,
          ),
        }
      },
    ),
    orderType: Number(uintString(message.orderType, "orderType")),
    startTime: uintString(message.startTime, "startTime"),
    endTime: uintString(message.endTime, "endTime"),
    zoneHash: bytes32String(message.zoneHash, "zoneHash"),
    salt: uintString(message.salt, "salt"),
    conduitKey: bytes32String(message.conduitKey, "conduitKey"),
    counter:
      counterOptional && message.counter === undefined
        ? "0"
        : uintString(message.counter, "counter"),
  }
}

type Eip712Fields = ReadonlyArray<{ name: string; type: string }>

const ITEM_FIELDS: Eip712Fields = [
  { name: "itemType", type: "uint8" },
  { name: "token", type: "address" },
  { name: "identifierOrCriteria", type: "uint256" },
  { name: "startAmount", type: "uint256" },
  { name: "endAmount", type: "uint256" },
]

/** Seaport 1.6's EIP-712 types for `OrderComponents`, the only ones an order may be signed with. */
const SEAPORT_ORDER_TYPES: Readonly<Record<string, Eip712Fields>> = {
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" },
  ],
  OfferItem: ITEM_FIELDS,
  ConsiderationItem: [...ITEM_FIELDS, { name: "recipient", type: "address" }],
}

const EIP712_DOMAIN_FIELDS: Eip712Fields = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
]

function sameFields(actual: unknown, expected: Eip712Fields): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every(
      (field, i) =>
        isRecord(field) &&
        Object.keys(field).length === 2 &&
        field.name === expected[i].name &&
        field.type === expected[i].type,
    )
  )
}

/** The name of the first type that differs from Seaport's, or undefined when all match. */
function nonCanonicalType(types: Record<string, unknown>): string | undefined {
  for (const name of Object.keys(types)) {
    const expected =
      name === "EIP712Domain" ? EIP712_DOMAIN_FIELDS : SEAPORT_ORDER_TYPES[name]
    if (!expected || !sameFields(types[name], expected)) return name
  }
  return Object.keys(SEAPORT_ORDER_TYPES).find(name => !(name in types))
}

/**
 * Normalize Seaport order parameters from an API response, such as an
 * offer's `protocol_data.parameters`. Returns undefined when malformed.
 */
export function normalizeSeaportOrder(
  value: unknown,
  options?: {
    /** Accept parameters without a counter, for display only; never for signing. */
    counterOptional?: boolean
  },
): SeaportOrderComponents | undefined {
  if (!isRecord(value)) return undefined
  try {
    return normalizeOrder(value, options?.counterOptional ?? false)
  } catch {
    return undefined
  }
}

/**
 * Check that EIP-712 typed data is a single Seaport order the account may
 * sign on `chainId`, and return the order. Throws `MarketplaceGuardError`
 * otherwise.
 */
export function checkOrderTypedData(
  typedData: SignTypedDataRequest,
  options: { label: string; chainId: number; account: string },
): SeaportOrderComponents {
  const refuse = (reason: string) =>
    new MarketplaceGuardError(`Refusing ${options.label}: ${reason}`)
  const contracts = requireChainContracts(options.chainId, options.label)
  const { verifyingContract, chainId } = typedData.domain
  if (
    typeof verifyingContract !== "string" ||
    verifyingContract.toLowerCase() !== contracts.seaport
  ) {
    throw refuse(
      `the EIP-712 domain's verifyingContract ${String(verifyingContract)} is not Seaport on chain ${options.chainId}`,
    )
  }
  if (Number(chainId) !== options.chainId) {
    throw refuse(
      `the EIP-712 domain's chainId ${String(chainId)} does not match the step's chain ${options.chainId}`,
    )
  }
  if (typedData.primaryType === "BulkOrder") {
    throw refuse(
      "it signs several orders as one Seaport bulk order, which --send does not support yet. Request one item at a time.",
    )
  }
  if (typedData.primaryType !== "OrderComponents") {
    throw refuse(
      `the typed data's primary type ${typedData.primaryType} is not a Seaport order`,
    )
  }
  const badType = nonCanonicalType(typedData.types)
  if (badType !== undefined) {
    throw refuse(
      `the EIP-712 type ${badType} is not Seaport 1.6's OrderComponents, OfferItem or ConsiderationItem definition`,
    )
  }
  let order: SeaportOrderComponents
  try {
    order = normalizeOrder(typedData.message)
  } catch (err) {
    throw refuse(`the order is malformed: ${(err as Error).message}`)
  }
  if (!sameAddress(order.offerer, options.account)) {
    throw refuse(
      `the order's offerer is ${order.offerer}, not ${options.account}`,
    )
  }
  return order
}

/**
 * `JSON.parse`, except that integers too large for a JS number stay exact as
 * strings. Seaport counters routinely exceed 2^53, and a rounded counter
 * yields a signature Seaport rejects.
 */
export function parseJsonPreservingIntegers(text: string): unknown {
  let out = ""
  let inString = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inString) {
      if (ch === "\\") {
        out += text.slice(i, i + 2)
        i += 2
        continue
      }
      if (ch === '"') inString = false
      out += ch
      i++
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      i++
      continue
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1
      while (j < text.length && /[0-9eE+.-]/.test(text[j])) j++
      const token = text.slice(i, j)
      out +=
        /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token))
          ? `"${token}"`
          : token
      i = j
      continue
    }
    out += ch
    i++
  }
  return JSON.parse(out)
}

export interface PlannedApproval extends DecodedApproval {
  /** The token or NFT contract being approved, which is also the transaction's `to`. */
  contract: string
  /** Whether the contract is a payment token (ERC-20) or the NFT being traded. */
  asset: "payment" | "item"
  /** The amount the API asked for, when `clampApprovals` lowered it. */
  requestedAmount?: string
}

export interface PlannedTransaction {
  type: "transaction"
  action: string
  chainId: number
  from?: string
  to: string
  data: string
  /** Native value in wei, decimal. */
  value: string
  /** Gas limit the API recommends, when it gave one. */
  gas?: string
  approval?: PlannedApproval
  /**
   * Seaport order hashes a cancel step's calldata cancels, set once
   * `checkCancelledOrders` has matched them to the request.
   */
  cancelledOrderHashes?: string[]
  /** The action body as the API returned it, for summaries. */
  details: Record<string, unknown>
}

export interface PlannedSignature {
  type: "signature"
  action: string
  side: "listing" | "offer"
  chainId: number
  /** Seaport address from the domain, posted as the order's `protocol_address`. */
  protocolAddress: string
  typedData: SignTypedDataRequest
  order: SeaportOrderComponents
}

export type PlannedStep = PlannedTransaction | PlannedSignature

/** Transaction actions that must call Seaport, and which Seaport functions each may call. */
const SEAPORT_TRANSACTION_ACTIONS: Record<string, SeaportCallKind> = {
  buyItemAction: "fulfillment",
  acceptOfferAction: "fulfillment",
  cancelOrdersAction: "cancel",
}

/** Approval actions, and where each names the contract it approves. */
const APPROVAL_ACTIONS: Record<
  string,
  {
    asset: "payment" | "item"
    contract: (body: Record<string, unknown>) => unknown
  }
> = {
  itemApprovalAction: {
    asset: "item",
    contract: body =>
      field(field(body.assetIdentifier, "contractAddress"), "value"),
  },
  paymentApprovalAction: {
    asset: "payment",
    contract: body => field(field(body.contractIdentifier, "address"), "value"),
  },
}

/** Order-signing actions and the side of the order each creates. */
const SIGNATURE_ACTIONS: Record<string, "listing" | "offer"> = {
  createListingsAction: "listing",
  createOfferAction: "offer",
  createOffersAction: "offer",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

function weiString(value: unknown, label: string): string {
  if (value === undefined || value === null || value === "") return "0"
  try {
    const wei = BigInt(value as string)
    if (wei < 0n) throw new Error()
    return wei.toString()
  } catch {
    throw new MarketplaceGuardError(
      `Refusing ${label}: value ${String(value)} is not a wei amount`,
    )
  }
}

function requireAccount(account: string): void {
  if (!EVM_ADDRESS.test(account)) {
    throw new MarketplaceGuardError(
      `--send and --dry-run need an EVM account address, got ${account}`,
    )
  }
}

/**
 * Turn the `steps` an action endpoint returned into checked steps, in order.
 * Throws `MarketplaceGuardError` before anything is signed when any step is
 * refused or of a kind `--send` does not run.
 */
export function planActionSteps(
  steps: readonly unknown[],
  account: string,
  options?: {
    /** The chain the request names. Every step must be on it when set. */
    chainId?: number
    /**
     * The order the request asked for. An order-signing step is refused when
     * this is unset or the signed order differs from it.
     */
    requestedOrder?: RequestedOrder
    /**
     * Seaport order hashes the request cancels. A cancel step is refused
     * when this is unset or its calldata cancels any other set of orders.
     */
    cancelledOrders?: readonly string[]
  },
): PlannedStep[] {
  requireAccount(account)
  if (steps.length === 0) {
    throw new MarketplaceGuardError("The API returned no steps to run")
  }
  return steps.map((step, index) => {
    const planned = planActionStep(step, index, account)
    const expected = options?.chainId
    if (expected !== undefined && planned.chainId !== expected) {
      throw new MarketplaceGuardError(
        `Refusing step ${index + 1} (${planned.action}): it is on chain ${planned.chainId}, but the request names chain ${expected}`,
      )
    }
    if (
      planned.type === "transaction" &&
      planned.action === "cancelOrdersAction"
    ) {
      planned.cancelledOrderHashes = checkCancelledOrders(
        planned,
        options?.cancelledOrders,
        `step ${index + 1} (${planned.action})`,
      )
    }
    if (planned.type === "signature") {
      checkOrderAgainstRequest(
        planned,
        options?.requestedOrder,
        `step ${index + 1} (${planned.action})`,
      )
    }
    return planned
  })
}

function planActionStep(
  step: unknown,
  index: number,
  account: string,
): PlannedStep {
  const position = `step ${index + 1}`
  if (!isRecord(step) || Object.keys(step).length !== 1) {
    throw new MarketplaceGuardError(
      `Refusing ${position}: expected an object with exactly one action`,
    )
  }
  const [action] = Object.keys(step)
  const label = `${position} (${action})`
  const body = step[action]
  if (!isRecord(body)) {
    throw new MarketplaceGuardError(`Refusing ${label}: the action is empty`)
  }

  const side = SIGNATURE_ACTIONS[action]
  if (side) return planSignature(label, action, side, body, account)

  const approvalAction = APPROVAL_ACTIONS[action]
  const seaportCall = SEAPORT_TRANSACTION_ACTIONS[action]
  if (approvalAction || seaportCall) {
    let approves: string | undefined
    if (approvalAction) {
      const contract = approvalAction.contract(body)
      if (typeof contract !== "string") {
        throw new MarketplaceGuardError(
          `Refusing ${label}: it does not name the contract it approves`,
        )
      }
      approves = contract
    }
    const tx = body.transaction
    const chainId = field(field(tx, "chainIdentifier"), "chainId")
    if (typeof chainId !== "number" || !Number.isSafeInteger(chainId)) {
      throw new MarketplaceGuardError(
        `Refusing ${label}: it has no EVM chain id`,
      )
    }
    const to = field(field(tx, "to"), "value")
    const from = field(field(tx, "from"), "value")
    const data = field(tx, "data") ?? "0x"
    if (typeof to !== "string" || typeof data !== "string") {
      throw new MarketplaceGuardError(
        `Refusing ${label}: it has no 'to' address or calldata`,
      )
    }
    const planned: PlannedTransaction = {
      type: "transaction",
      action,
      chainId,
      from: typeof from === "string" ? from : undefined,
      to,
      data,
      value: weiString(field(tx, "value"), label),
      details: body,
    }
    const gas = field(tx, "recommendedGasLimit") ?? field(tx, "gasLimit")
    if (typeof gas === "string" && /^\d+$/.test(gas)) planned.gas = gas
    const approval = checkTransaction(
      {
        label,
        from: planned.from,
        to,
        data,
        value: planned.value,
        chainId,
        approves,
        seaportCall,
      },
      account,
    )
    if (approval && approves && approvalAction) {
      planned.approval = {
        ...approval,
        contract: approves,
        asset: approvalAction.asset,
      }
    }
    return planned
  }

  throw new MarketplaceGuardError(
    `Refusing ${label}: --send does not run ${action} steps. Run the command without --send and handle the steps yourself.`,
  )
}

function planSignature(
  label: string,
  action: string,
  side: "listing" | "offer",
  body: Record<string, unknown>,
  account: string,
): PlannedSignature {
  const request = body.signatureRequest
  const chainId = field(field(request, "chainIdentifier"), "chainId")
  const message = field(request, "message")
  if (typeof chainId !== "number" || typeof message !== "string") {
    throw new MarketplaceGuardError(
      `Refusing ${label}: it has no EIP-712 signature request`,
    )
  }
  let parsed: unknown
  try {
    parsed = parseJsonPreservingIntegers(message)
  } catch {
    throw new MarketplaceGuardError(
      `Refusing ${label}: the EIP-712 payload is not valid JSON`,
    )
  }
  if (
    !isRecord(parsed) ||
    !isRecord(parsed.domain) ||
    !isRecord(parsed.types) ||
    typeof parsed.primaryType !== "string" ||
    !isRecord(parsed.message)
  ) {
    throw new MarketplaceGuardError(
      `Refusing ${label}: the EIP-712 payload lacks domain, types, primaryType or message`,
    )
  }
  const typedData = parsed as unknown as SignTypedDataRequest
  const order = checkOrderTypedData(typedData, { label, chainId, account })
  return {
    type: "signature",
    action,
    side,
    chainId,
    protocolAddress: String(typedData.domain.verifyingContract),
    typedData: {
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: { ...order },
    },
    order,
  }
}

/**
 * The order a listing or offer request asked for, in base units. The CLI
 * builds it from the request body before any step is signed.
 */
export interface RequestedOrder {
  side: "listing" | "offer"
  nft: { token: string; identifier: string; quantity: bigint }
  /** Payment currency contract, the zero address for the native token. */
  currency: string
  /** Total payment: a listing's price times quantity, or an offer's amount. */
  total: bigint
  /** Latest acceptable `endTime`, unix seconds. */
  latestEndTime: bigint
  /** Earliest acceptable `startTime`, unix seconds, when the request names a start time. */
  earliestStartTime?: bigint
  /** Private listing taker, who then receives the NFT as a consideration item. */
  taker?: string
}

/**
 * Most a signed order may pay to anyone but the offerer, in basis points of
 * its total: OpenSea's 100 bps marketplace fee plus creator fees, which
 * OpenSea caps at 1,000 bps in total.
 */
export const MAX_FEE_BASIS_POINTS = 1_100n

/** Longest an order may stay open when the request names no end time. */
export const MAX_ORDER_WINDOW_SECONDS = 365n * 24n * 60n * 60n

/** Convert a decimal amount such as "0.5" to base units with `decimals` places. */
export function parseUnits(amount: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount)
  if (!match) throw new Error(`"${amount}" is not a decimal amount`)
  const [, whole, fraction = ""] = match
  if (fraction.length > decimals) {
    throw new Error(`"${amount}" has more than ${decimals} decimal places`)
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"))
}

function isPayment(item: SeaportItem): boolean {
  return item.itemType === 0 || item.itemType === 1
}

/**
 * Check a signed order's economics against the request: the NFT, quantity,
 * currency and total, that no more than `MAX_FEE_BASIS_POINTS` of the total
 * goes to anyone but the offerer, and that it ends no later than requested.
 * Throws `MarketplaceGuardError` on any difference.
 */
export function checkOrderAgainstRequest(
  step: PlannedSignature,
  requested: RequestedOrder | undefined,
  label: string,
): void {
  const refuse = (reason: string) =>
    new MarketplaceGuardError(`Refusing ${label}: ${reason}`)
  if (!requested) {
    throw refuse(
      "this request does not create an order, so nothing should be signed",
    )
  }
  if (requested.side !== step.side) {
    throw refuse(
      `it signs ${step.side === "offer" ? "an offer" : "a listing"}, but the request creates ${requested.side === "offer" ? "an offer" : "a listing"}`,
    )
  }
  const { order } = step
  const offerer = order.offerer.toLowerCase()
  const currency = requested.currency.toLowerCase()
  const paymentType =
    currency === "0x0000000000000000000000000000000000000000" ? 0 : 1
  const isRequestedPayment = (item: SeaportItem) =>
    item.itemType === paymentType && item.token.toLowerCase() === currency
  const isRequestedNft = (item: SeaportItem) =>
    (item.itemType === 2 || item.itemType === 3) &&
    item.token.toLowerCase() === requested.nft.token.toLowerCase() &&
    BigInt(item.identifierOrCriteria) === BigInt(requested.nft.identifier) &&
    BigInt(item.startAmount) === requested.nft.quantity &&
    BigInt(item.endAmount) === requested.nft.quantity
  const amountOf = (items: SeaportItem[]) => {
    let total = 0n
    for (const item of items) {
      if (BigInt(item.startAmount) !== BigInt(item.endAmount)) {
        throw refuse(
          "its amounts change over time, but the request asks for a fixed price",
        )
      }
      total += BigInt(item.startAmount)
    }
    return total
  }

  if (step.side === "listing") {
    if (order.offer.length !== 1 || !isRequestedNft(order.offer[0])) {
      throw refuse(
        `it does not offer exactly ${requested.nft.quantity} x ${requested.nft.token} #${requested.nft.identifier}`,
      )
    }
    const extraNfts = order.consideration.filter(item => !isPayment(item))
    const takerItem =
      requested.taker !== undefined &&
      extraNfts.length === 1 &&
      isRequestedNft(extraNfts[0]) &&
      (extraNfts[0] as SeaportConsiderationItem).recipient.toLowerCase() ===
        requested.taker.toLowerCase()
    if (extraNfts.length > 0 && !takerItem) {
      throw refuse("it asks for NFTs in return that the request does not name")
    }
    if (requested.taker !== undefined && !takerItem) {
      throw refuse(
        `it does not deliver the NFT to the private taker ${requested.taker}`,
      )
    }
  } else {
    const wanted = order.consideration.filter(item => !isPayment(item))
    if (
      wanted.length !== 1 ||
      !isRequestedNft(wanted[0]) ||
      wanted[0].recipient.toLowerCase() !== offerer
    ) {
      throw refuse(
        `it does not ask for exactly ${requested.nft.quantity} x ${requested.nft.token} #${requested.nft.identifier} delivered to ${order.offerer}`,
      )
    }
  }

  const payments =
    step.side === "listing"
      ? order.consideration.filter(isPayment)
      : order.offer.filter(isPayment)
  const fees =
    step.side === "listing"
      ? order.consideration.filter(
          item => isPayment(item) && item.recipient.toLowerCase() !== offerer,
        )
      : order.consideration.filter(isPayment)
  if (step.side === "offer" && order.offer.length !== payments.length) {
    throw refuse("it offers something other than the payment")
  }
  const foreign = [...payments, ...fees].find(item => !isRequestedPayment(item))
  if (foreign) {
    throw refuse(
      `it pays in ${foreign.token} (item type ${foreign.itemType}), not the requested currency ${requested.currency}`,
    )
  }
  const total = amountOf(payments)
  if (total !== requested.total) {
    throw refuse(
      `its total payment is ${total} base units, but the request asks for ${requested.total}`,
    )
  }
  const feeTotal = amountOf(fees)
  if (feeTotal * 10_000n > total * MAX_FEE_BASIS_POINTS) {
    throw refuse(
      `it pays ${feeTotal} of ${total} base units to addresses other than the offerer, more than the ${MAX_FEE_BASIS_POINTS} bps OpenSea and creator fees can add up to`,
    )
  }
  if (
    requested.earliestStartTime !== undefined &&
    BigInt(order.startTime) < requested.earliestStartTime
  ) {
    throw refuse(
      `it starts at ${order.startTime}, earlier than the request's start_time (${requested.earliestStartTime})`,
    )
  }
  if (BigInt(order.endTime) > requested.latestEndTime) {
    throw refuse(
      `it ends at ${order.endTime}, later than the latest end time the request allows (${requested.latestEndTime})`,
    )
  }
}

export interface ExcessiveApproval {
  step: number
  action: string
  token: string
  spender: string
  amount: bigint
  /** The most of `token` the plan's own orders and buys need. */
  required: bigint
}

/** How much of each ERC-20 the plan itself spends, keyed by lowercased token. */
function requiredSpend(steps: readonly PlannedStep[]): Map<string, bigint> {
  const required = new Map<string, bigint>()
  const need = (token: string, amount: bigint) => {
    const key = token.toLowerCase()
    required.set(key, (required.get(key) ?? 0n) + amount)
  }
  for (const step of steps) {
    if (step.type === "signature" && step.side === "offer") {
      for (const item of step.order.offer.filter(isPayment)) {
        const start = BigInt(item.startAmount)
        const end = BigInt(item.endAmount)
        need(item.token, start > end ? start : end)
      }
    }
    if (
      step.type === "transaction" &&
      step.action === "fulfillment" &&
      typeof step.details.paymentToken === "string" &&
      typeof step.details.paymentAmount === "string"
    ) {
      need(step.details.paymentToken, BigInt(step.details.paymentAmount))
    }
    if (step.type === "transaction" && step.action === "buyItemAction") {
      const payments = step.details.paymentAssetQuantity
      for (const payment of Array.isArray(payments) ? payments : []) {
        const token = field(
          field(field(payment, "assetIdentifier"), "contractAddress"),
          "value",
        )
        const quantity = field(field(payment, "quantity"), "value")
        if (typeof token === "string" && typeof quantity === "string") {
          need(token, BigInt(quantity))
        }
      }
    }
  }
  return required
}

/**
 * ERC-20 approvals in the plan that allow more than the plan itself spends:
 * the amount offered by an order the plan signs, plus the payment of every
 * buy it sends.
 */
export function excessiveApprovals(
  steps: readonly PlannedStep[],
): ExcessiveApproval[] {
  const required = requiredSpend(steps)
  const excessive: ExcessiveApproval[] = []
  for (const [index, step] of steps.entries()) {
    const approval = step.type === "transaction" ? step.approval : undefined
    if (approval?.method !== "approve" || approval.asset !== "payment") continue
    const amount = BigInt(approval.amount ?? "0")
    const needed = required.get(approval.contract.toLowerCase()) ?? 0n
    if (amount > needed) {
      excessive.push({
        step: index + 1,
        action: step.action,
        token: approval.contract,
        spender: approval.spender,
        amount,
        required: needed,
      })
    }
  }
  return excessive
}

function approveCalldata(spender: string, amount: bigint): string {
  const word = (hex: string) => hex.padStart(64, "0")
  return `${APPROVE_SELECTOR}${word(spender.slice(2).toLowerCase())}${word(amount.toString(16))}`
}

/**
 * Lower every ERC-20 approval that allows more than the plan spends to
 * exactly what it spends in that token, re-encoding the calldata. The API
 * builds every ERC-20 approval for max uint256, and only emits one when the
 * wallet's current allowance does not cover this order, so the clamped
 * amount still raises the allowance and never lowers what other open orders
 * already rely on. An approval for a token the plan spends none of is left
 * as is, for `excessiveApprovals` to refuse.
 */
export function clampApprovals(steps: readonly PlannedStep[]): PlannedStep[] {
  const required = requiredSpend(steps)
  return steps.map(step => {
    const approval = step.type === "transaction" ? step.approval : undefined
    if (
      step.type !== "transaction" ||
      approval?.method !== "approve" ||
      approval.asset !== "payment"
    ) {
      return step
    }
    const amount = BigInt(approval.amount ?? "0")
    const needed = required.get(approval.contract.toLowerCase()) ?? 0n
    if (needed === 0n || amount <= needed) return step
    return {
      ...step,
      data: approveCalldata(approval.spender, needed),
      approval: {
        ...approval,
        amount: needed.toString(),
        requestedAmount: amount.toString(),
      },
    }
  })
}

/**
 * SHA-256 over the security-relevant fields of a plan, in a fixed order:
 * per transaction its chain id, `to`, full calldata (after approval
 * clamping, with each SignedZone order's regenerated expiration and
 * signature zeroed), native value and any approval's spender and amount;
 * per order signature the domain's chainId and verifyingContract, the
 * offerer, and every offer and consideration item with its type, token,
 * identifier, amounts and recipient, plus its order type, zone, zone hash
 * and conduit key. For order signatures, salt, start and end times and
 * counter are left out, since they change on every fetch.
 */
export function planDigest(steps: readonly PlannedStep[]): string {
  const lower = (value: string) => value.toLowerCase()
  const item = (i: SeaportItem) => [
    i.itemType,
    lower(i.token),
    BigInt(i.identifierOrCriteria).toString(),
    BigInt(i.startAmount).toString(),
    BigInt(i.endAmount).toString(),
  ]
  const canonical = steps.map(step =>
    step.type === "transaction"
      ? [
          "tx",
          step.chainId,
          lower(step.to),
          maskSignedZoneExtraData(
            step.data,
            contractsForChain(step.chainId)?.signedZone ?? "",
          ),
          step.value,
          step.approval
            ? [lower(step.approval.spender), step.approval.amount ?? null]
            : null,
        ]
      : [
          "order",
          Number(step.typedData.domain.chainId),
          lower(String(step.typedData.domain.verifyingContract)),
          lower(step.order.offerer),
          step.order.offer.map(item),
          step.order.consideration.map(i => [...item(i), lower(i.recipient)]),
          step.order.orderType,
          lower(step.order.zone),
          lower(step.order.zoneHash),
          lower(step.order.conduitKey),
        ],
  )
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}

const utf8 = new TextEncoder()

function keccakHex(bytesHex: string): string {
  const bytes = new Uint8Array(bytesHex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(bytesHex.slice(i * 2, i * 2 + 2), 16)
  }
  return Buffer.from(keccak_256(bytes)).toString("hex")
}

function typeHash(type: string): string {
  return Buffer.from(keccak_256(utf8.encode(type))).toString("hex")
}

const OFFER_ITEM_TYPE =
  "OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)"
const CONSIDERATION_ITEM_TYPE =
  "ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)"
const OFFER_ITEM_TYPEHASH = typeHash(OFFER_ITEM_TYPE)
const CONSIDERATION_ITEM_TYPEHASH = typeHash(CONSIDERATION_ITEM_TYPE)
const ORDER_TYPEHASH = typeHash(
  "OrderComponents(address offerer,address zone,OfferItem[] offer,ConsiderationItem[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)" +
    CONSIDERATION_ITEM_TYPE +
    OFFER_ITEM_TYPE,
)

function word(value: string | number | bigint): string {
  return BigInt(value).toString(16).padStart(64, "0")
}

/** Seaport 1.6's order hash: the EIP-712 struct hash of `OrderComponents`. */
export function seaportOrderHash(order: SeaportOrderComponents): string {
  const itemWords = (item: SeaportItem) =>
    word(item.itemType) +
    word(item.token) +
    word(item.identifierOrCriteria) +
    word(item.startAmount) +
    word(item.endAmount)
  const offer = order.offer
    .map(item => keccakHex(OFFER_ITEM_TYPEHASH + itemWords(item)))
    .join("")
  const consideration = order.consideration
    .map(item =>
      keccakHex(
        CONSIDERATION_ITEM_TYPEHASH + itemWords(item) + word(item.recipient),
      ),
    )
    .join("")
  return `0x${keccakHex(
    ORDER_TYPEHASH +
      word(order.offerer) +
      word(order.zone) +
      keccakHex(offer) +
      keccakHex(consideration) +
      word(order.orderType) +
      word(order.startTime) +
      word(order.endTime) +
      word(order.zoneHash) +
      word(order.salt) +
      word(order.conduitKey) +
      word(order.counter),
  )}`
}

const CANCEL_SELECTOR = "0xfd9f1e10"

/**
 * Decode Seaport's `cancel(OrderComponents[])` calldata. Throws on any other
 * function or calldata that does not decode.
 */
export function decodeCancelCalldata(data: string): SeaportOrderComponents[] {
  if (data.slice(0, 10).toLowerCase() !== CANCEL_SELECTOR) {
    throw new Error("not a Seaport cancel call")
  }
  const body = data.slice(10).toLowerCase()
  const size = Math.floor(body.length / 2)
  const read = (offset: number): bigint => {
    if (!Number.isInteger(offset) || offset < 0 || offset + 32 > size) {
      throw new Error("calldata is too short")
    }
    return BigInt(`0x${body.slice(offset * 2, offset * 2 + 64)}`)
  }
  const at = (offset: number): number => {
    const value = read(offset)
    if (value > BigInt(size)) throw new Error("offset out of range")
    return Number(value)
  }
  const address = (offset: number) =>
    `0x${read(offset).toString(16).padStart(40, "0")}`
  const bytes32 = (offset: number) =>
    `0x${read(offset).toString(16).padStart(64, "0")}`
  const items = (offset: number, words: number) => {
    const length = at(offset)
    return Array.from({ length }, (_, i) => {
      const base = offset + 32 + i * words * 32
      return {
        itemType: Number(read(base)),
        token: address(base + 32),
        identifierOrCriteria: read(base + 64).toString(),
        startAmount: read(base + 96).toString(),
        endAmount: read(base + 128).toString(),
        ...(words === 6 ? { recipient: address(base + 160) } : {}),
      }
    })
  }
  const array = at(0)
  const count = at(array)
  const elements = array + 32
  return Array.from({ length: count }, (_, i) => {
    const order = elements + at(elements + 32 * i)
    return {
      offerer: address(order),
      zone: address(order + 32),
      offer: items(order + at(order + 64), 5),
      consideration: items(
        order + at(order + 96),
        6,
      ) as SeaportConsiderationItem[],
      orderType: Number(read(order + 128)),
      startTime: read(order + 160).toString(),
      endTime: read(order + 192).toString(),
      zoneHash: bytes32(order + 224),
      salt: read(order + 256).toString(),
      conduitKey: bytes32(order + 288),
      counter: read(order + 320).toString(),
    }
  })
}

/**
 * Refuse a cancel step unless the orders its `cancel` calldata cancels are
 * exactly `requested`, compared by Seaport order hash. Returns those hashes.
 */
export function checkCancelledOrders(
  step: PlannedTransaction,
  requested: readonly string[] | undefined,
  label: string,
): string[] {
  const refuse = (reason: string) =>
    new MarketplaceGuardError(`Refusing ${label}: ${reason}`)
  if (!requested) {
    throw refuse("this request does not cancel an order")
  }
  let hashes: string[]
  try {
    hashes = decodeCancelCalldata(step.data).map(seaportOrderHash)
  } catch (err) {
    throw refuse(
      `its cancel calldata does not decode (${(err as Error).message})`,
    )
  }
  const want = new Set(requested.map(hash => hash.toLowerCase()))
  const got = new Set(hashes)
  const same = want.size === got.size && [...want].every(hash => got.has(hash))
  if (!same) {
    throw refuse(
      `it cancels ${[...got].join(", ") || "no orders"}, not the requested ${[...want].join(", ")}`,
    )
  }
  return hashes
}

/** One transaction of a `cross_chain_fulfillment_data` response. */
export interface SwapTransaction {
  chain: string
  to?: string | null
  data: string
  value?: string | null
  svm?: unknown
}

/**
 * Turn a cross-chain fulfillment's transactions into checked steps. Each must
 * call Seaport, or approve the payment token for Seaport or an OpenSea
 * conduit. Transactions routed through a bridge or swap provider are refused.
 */
export function planSwapTransactions(
  transactions: readonly SwapTransaction[],
  account: string,
  paymentToken: string,
  options?: {
    /** Chains the request names (listing and payment chain). Any other chain is refused. */
    chainIds?: readonly number[]
    /**
     * What the purchase pays in `paymentToken`, from the listings themselves,
     * so a payment approval can be lowered to it. Unknown means none.
     */
    paymentAmount?: bigint
  },
): PlannedTransaction[] {
  requireAccount(account)
  if (transactions.length === 0) {
    throw new MarketplaceGuardError("The API returned no transactions to run")
  }
  let spendRecorded = false
  return transactions.map((tx, index) => {
    const label = `transaction ${index + 1}`
    if ((tx.svm !== undefined && tx.svm !== null) || !tx.to) {
      throw new MarketplaceGuardError(
        `Refusing ${label}: it is not an EVM transaction with a 'to' address`,
      )
    }
    let chainId: number
    try {
      chainId = resolveChainId(tx.chain)
    } catch {
      throw new MarketplaceGuardError(
        `Refusing ${label}: unknown chain ${tx.chain}`,
      )
    }
    if (options?.chainIds && !options.chainIds.includes(chainId)) {
      throw new MarketplaceGuardError(
        `Refusing ${label}: it is on chain ${chainId}, which is neither the listing chain nor the payment chain (${options.chainIds.join(", ")})`,
      )
    }
    const isApproval =
      sameAddress(tx.to, paymentToken) && decodeApproval(tx.data) !== undefined
    const value = weiString(tx.value, label)
    const approval = checkTransaction(
      {
        label,
        to: tx.to,
        data: tx.data,
        value,
        chainId,
        approves: isApproval ? paymentToken : undefined,
        seaportCall: "fulfillment",
      },
      account,
    )
    return {
      type: "transaction",
      action: approval ? "paymentApproval" : "fulfillment",
      chainId,
      to: tx.to,
      data: tx.data,
      value,
      approval: approval
        ? { ...approval, contract: tx.to, asset: "payment" }
        : undefined,
      details: recordSpend(),
    }

    function recordSpend(): Record<string, unknown> {
      if (approval || spendRecorded || options?.paymentAmount === undefined) {
        return {}
      }
      spendRecorded = true
      return {
        paymentToken,
        paymentAmount: options.paymentAmount.toString(),
      }
    }
  })
}
