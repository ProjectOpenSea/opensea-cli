import { vi } from "vitest"
import {
  normalizeSeaportOrder,
  type PlannedSignature,
  type RequestedOrder,
} from "../../src/marketplace/guard.js"
import type { EvmWalletAdapter } from "../../src/wallet/index.js"

export const ACCOUNT = "0x1111111111111111111111111111111111111111"
export const OTHER = "0x2222222222222222222222222222222222222222"
export const ATTACKER = "0xbadbadbadbadbadbadbadbadbadbadbadbadbad0"
export const FEE_RECIPIENT = "0x0000a26b00c1f0df003000390027140000faa719"
export const SEAPORT = "0x0000000000000068F116a894984e2DB1123eB395"
export const ALT_SEAPORT = "0x00000000006687982678b03100B9bDC8be440814"
export const CONDUIT = "0x1e0049783f008a0085193e00003d00cd54003c71"
export const NFT = "0x3333333333333333333333333333333333333333"
export const WETH = "0x4200000000000000000000000000000000000006"
export const ZERO = "0x0000000000000000000000000000000000000000"
export const CONDUIT_KEY =
  "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000"
export const BIG_COUNTER = "123456789012345678901234567890"
export const BASE = 8453
export const FULFILL_BASIC_ORDER_CALLDATA = `0xfb0f3ee1${"0".repeat(64)}`
/** Only the cancel selector, for selector checks; it does not decode. */
export const CANCEL_CALLDATA = `0xfd9f1e10${"0".repeat(64)}`

const word = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0")

export function approveCalldata(spender: string, amount: bigint): string {
  return `0x095ea7b3${word(spender)}${word(amount.toString(16))}`
}

export function setApprovalForAllCalldata(
  operator: string,
  approved: boolean,
): string {
  return `0xa22cb465${word(operator)}${word(approved ? "1" : "0")}`
}

export function chainIdentifier(chainId = BASE) {
  return { chainArch: "CHAIN_ARCH_EVM", chainId }
}

export function transaction(overrides: {
  to: string
  data?: string
  value?: string
  from?: string
  chainId?: number
  recommendedGasLimit?: string
}) {
  return {
    from: { value: overrides.from ?? ACCOUNT },
    to: { value: overrides.to },
    data: overrides.data ?? FULFILL_BASIC_ORDER_CALLDATA,
    ...(overrides.value !== undefined ? { value: overrides.value } : {}),
    chainIdentifier: chainIdentifier(overrides.chainId),
    ...(overrides.recommendedGasLimit
      ? { recommendedGasLimit: overrides.recommendedGasLimit }
      : {}),
  }
}

export function itemApprovalStep(operator = CONDUIT, contract = NFT) {
  return {
    itemApprovalAction: {
      transaction: transaction({
        to: contract,
        data: setApprovalForAllCalldata(operator, true),
        recommendedGasLimit: "60000",
      }),
      assetIdentifier: {
        chainIdentifier: chainIdentifier(),
        contractAddress: { value: contract },
        tokenId: "7",
      },
    },
  }
}

export function paymentApprovalStep(
  spender = CONDUIT,
  amount = 10n ** 18n,
  token = WETH,
) {
  return {
    paymentApprovalAction: {
      transaction: transaction({
        to: token,
        data: approveCalldata(spender, amount),
      }),
      contractIdentifier: {
        chainIdentifier: chainIdentifier(),
        address: { value: token },
      },
    },
  }
}

export function listingOrder(overrides: Record<string, unknown> = {}) {
  return {
    offerer: ACCOUNT,
    zone: ZERO,
    offer: [
      {
        itemType: 2,
        token: NFT,
        identifierOrCriteria: "7",
        startAmount: "1",
        endAmount: "1",
      },
    ],
    consideration: [
      {
        itemType: 0,
        token: ZERO,
        identifierOrCriteria: "0",
        startAmount: "975000000000000000",
        endAmount: "975000000000000000",
        recipient: ACCOUNT,
      },
      {
        itemType: 0,
        token: ZERO,
        identifierOrCriteria: "0",
        startAmount: "25000000000000000",
        endAmount: "25000000000000000",
        recipient: FEE_RECIPIENT,
      },
    ],
    orderType: 0,
    startTime: "1767225600",
    endTime: "1769904000",
    zoneHash: `0x${"0".repeat(64)}`,
    salt: "0x1234",
    conduitKey: CONDUIT_KEY,
    counter: "__COUNTER__",
    ...overrides,
  }
}

export function offerOrder() {
  return listingOrder({
    offer: [
      {
        itemType: 1,
        token: WETH,
        identifierOrCriteria: "0",
        startAmount: "400000000000000000",
        endAmount: "400000000000000000",
      },
    ],
    consideration: [
      {
        itemType: 2,
        token: NFT,
        identifierOrCriteria: "7",
        startAmount: "1",
        endAmount: "1",
        recipient: ACCOUNT,
      },
      {
        itemType: 1,
        token: WETH,
        identifierOrCriteria: "0",
        startAmount: "10000000000000000",
        endAmount: "10000000000000000",
        recipient: FEE_RECIPIENT,
      },
    ],
  })
}

const ITEM_FIELDS = [
  { name: "itemType", type: "uint8" },
  { name: "token", type: "address" },
  { name: "identifierOrCriteria", type: "uint256" },
  { name: "startAmount", type: "uint256" },
  { name: "endAmount", type: "uint256" },
]

/** Seaport 1.6's EIP-712 types as the API sends them. */
export const SEAPORT_TYPES = {
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

/**
 * The EIP-712 payload as the API serializes it: a JSON string whose counter
 * is a bare integer too large for a JS number.
 */
export function typedDataMessage(options: {
  types?: Record<string, unknown>
  order?: Record<string, unknown>
  verifyingContract?: string
  chainId?: number
  primaryType?: string
}): string {
  const json = JSON.stringify({
    types: options.types ?? SEAPORT_TYPES,
    primaryType: options.primaryType ?? "OrderComponents",
    domain: {
      name: "Seaport",
      version: "1.6",
      chainId: options.chainId ?? BASE,
      verifyingContract: options.verifyingContract ?? SEAPORT,
    },
    message: options.order ?? listingOrder(),
  })
  return json.replace('"__COUNTER__"', BIG_COUNTER)
}

export function signatureStep(
  action = "createListingsAction",
  message = typedDataMessage({}),
) {
  return {
    [action]: {
      signatureRequest: { chainIdentifier: chainIdentifier(), message },
      orders: [],
    },
  }
}

export function buyStep(overrides: { to?: string; value?: string } = {}) {
  return {
    buyItemAction: {
      transaction: transaction({
        to: overrides.to ?? SEAPORT,
        value: overrides.value ?? "1000000000000000000",
      }),
      assetQuantity: [
        {
          assetIdentifier: {
            contractAddress: { value: NFT },
            tokenId: "7",
          },
          quantity: { value: "1" },
        },
      ],
      paymentAssetQuantity: [
        {
          assetIdentifier: { contractAddress: { value: ZERO }, tokenId: "0" },
          quantity: { value: "1000000000000000000" },
        },
      ],
    },
  }
}

export type MockWallet = EvmWalletAdapter & {
  sendTransaction: ReturnType<typeof vi.fn>
  signTypedData: ReturnType<typeof vi.fn>
  getAddress: ReturnType<typeof vi.fn>
}

export function createMockWallet(
  options: { address?: string; signTypedData?: boolean } = {},
): MockWallet {
  const canSign = options.signTypedData ?? true
  return {
    name: "mock",
    chainType: "evm",
    capabilities: {
      signMessage: false,
      signTypedData: canSign,
      managedGas: true,
      managedNonce: true,
    },
    getAddress: vi.fn().mockResolvedValue(options.address ?? ACCOUNT),
    sendTransaction: vi.fn().mockResolvedValue({ hash: "0xhash1" }),
    signTypedData: vi.fn().mockResolvedValue("0xsignature"),
  }
}

/** The request `listingOrder()` answers: 1 x NFT #7 for 1 ETH. */
export const LISTING_REQUESTED: RequestedOrder = {
  side: "listing",
  nft: { token: NFT, identifier: "7", quantity: 1n },
  currency: ZERO,
  total: 10n ** 18n,
  latestEndTime: 1769904000n,
}

/** The request `offerOrder()` answers: 0.4 WETH for 1 x NFT #7. */
export const OFFER_REQUESTED: RequestedOrder = {
  side: "offer",
  nft: { token: NFT, identifier: "7", quantity: 1n },
  currency: WETH,
  total: 4n * 10n ** 17n,
  latestEndTime: 1769904000n,
}

/** A planned order signature built straight from an order, skipping the request check. */
export function plannedSignature(
  order: Record<string, unknown>,
  side: "listing" | "offer" = "listing",
): PlannedSignature {
  const normalized = normalizeSeaportOrder({
    ...order,
    counter: order.counter === "__COUNTER__" ? BIG_COUNTER : order.counter,
  })
  if (!normalized) throw new Error("fixture order is malformed")
  return {
    type: "signature",
    action: side === "listing" ? "createListingsAction" : "createOfferAction",
    side,
    chainId: BASE,
    protocolAddress: SEAPORT,
    typedData: {
      domain: {
        name: "Seaport",
        version: "1.6",
        chainId: BASE,
        verifyingContract: SEAPORT,
      },
      types: SEAPORT_TYPES,
      primaryType: "OrderComponents",
      message: { ...normalized },
    },
    order: normalized,
  }
}

export const SIGNED_ZONE = "0x000056f7000000ece9003ca63978907a00ffd100"

const hexWord = (value: bigint | number | string) =>
  (typeof value === "string" ? value.replace(/^0x/, "") : value.toString(16))
    .toLowerCase()
    .padStart(64, "0")

function encodeBytes(hex: string): string {
  const body = hex.replace(/^0x/, "")
  const padded = body.padEnd(Math.ceil(body.length / 64) * 64, "0")
  return hexWord(body.length / 2) + padded
}

/** SignedZone `extraData`: SIP-6 version, fulfiller, expiration, signature, context. */
export function signedZoneExtraData(options: {
  fulfiller?: string
  expiration?: bigint
  signature?: string
  version?: string
}): string {
  return (
    (options.version ?? "00") +
    (options.fulfiller ?? ACCOUNT).replace(/^0x/, "").toLowerCase() +
    (options.expiration ?? 0x6af29aa4n).toString(16).padStart(16, "0") +
    (options.signature ?? "ab".repeat(64)) +
    "cd".repeat(32)
  )
}

/** ABI-encoded AdvancedOrder with empty offer, consideration and signature. */
function encodeAdvancedOrder(zone: string, extraData: string): string {
  const params =
    hexWord(ACCOUNT) +
    hexWord(zone) +
    hexWord(11 * 32) +
    hexWord(12 * 32) +
    hexWord(0) +
    hexWord(1767225600) +
    hexWord(1769904000) +
    hexWord(0) +
    hexWord(0x1234) +
    hexWord(CONDUIT_KEY) +
    hexWord(0) +
    hexWord(0) +
    hexWord(0)
  const signature = encodeBytes("")
  const paramsAt = 5 * 32
  const signatureAt = paramsAt + params.length / 2
  const extraDataAt = signatureAt + signature.length / 2
  return (
    hexWord(paramsAt) +
    hexWord(1) +
    hexWord(1) +
    hexWord(signatureAt) +
    hexWord(extraDataAt) +
    params +
    signature +
    encodeBytes(extraData)
  )
}

/** fulfillAdvancedOrder calldata for one order. */
export function fulfillAdvancedOrderCalldata(
  extraData: string,
  zone = SIGNED_ZONE,
): string {
  const order = encodeAdvancedOrder(zone, extraData)
  const criteriaAt = 4 * 32 + order.length / 2
  return `0xe7acab24${hexWord(4 * 32)}${hexWord(criteriaAt)}${hexWord(0)}${hexWord(ACCOUNT)}${order}${hexWord(0)}`
}

/** fulfillAvailableAdvancedOrders calldata whose order array holds one order. */
export function fulfillAvailableAdvancedOrdersCalldata(
  extraData: string,
): string {
  const order = encodeAdvancedOrder(SIGNED_ZONE, extraData)
  return `0x87201b41${hexWord(7 * 32)}${hexWord(0).repeat(6)}${hexWord(1)}${hexWord(32)}${order}`
}

/**
 * A live Base listing read with `opensea orders get`, and the order hash the
 * API reported for it, to check Seaport order hashing against Seaport itself.
 */
export const LIVE_ORDER_HASH =
  "0x0362d97c388cdaf7725d2c4e30e5fa462c0779a1d63bc4d14d543920c72fac19"
export const LIVE_ORDER = {
  offerer: "0x476acdc470fa6b40f405ad8199bc3b55cb939680",
  zone: ZERO,
  offer: [
    {
      itemType: 2,
      token: "0x699727f9e01a822efdcf7333073f0461e5914b4e",
      identifierOrCriteria: "1149763",
      startAmount: "1",
      endAmount: "1",
    },
  ],
  consideration: [
    {
      itemType: 0,
      token: ZERO,
      identifierOrCriteria: "0",
      startAmount: "1287000000000000",
      endAmount: "1287000000000000",
      recipient: "0x476acdc470fa6b40f405ad8199bc3b55cb939680",
    },
    {
      itemType: 0,
      token: ZERO,
      identifierOrCriteria: "0",
      startAmount: "13000000000000",
      endAmount: "13000000000000",
      recipient: FEE_RECIPIENT,
    },
  ],
  orderType: 0,
  startTime: "1793647786",
  endTime: "1801423786",
  zoneHash: `0x${"0".repeat(64)}`,
  salt: "0x3d958fe200000000000000000000000000000000000000008de4ff34a5fc710c",
  conduitKey: CONDUIT_KEY,
  counter: "0",
}

type CancelOrder = typeof LIVE_ORDER

/** ABI-encoded `cancel(OrderComponents[])` calldata. */
export function cancelCalldata(orders: CancelOrder[]): string {
  const item = (i: Record<string, unknown>) =>
    hexWord(Number(i.itemType)) +
    hexWord(String(i.token)) +
    hexWord(BigInt(String(i.identifierOrCriteria))) +
    hexWord(BigInt(String(i.startAmount))) +
    hexWord(BigInt(String(i.endAmount))) +
    (i.recipient === undefined ? "" : hexWord(String(i.recipient)))
  const tuples = orders.map(order => {
    const offer = hexWord(order.offer.length) + order.offer.map(item).join("")
    const consideration =
      hexWord(order.consideration.length) +
      order.consideration.map(item).join("")
    return (
      hexWord(order.offerer) +
      hexWord(order.zone) +
      hexWord(11 * 32) +
      hexWord(11 * 32 + offer.length / 2) +
      hexWord(order.orderType) +
      hexWord(BigInt(order.startTime)) +
      hexWord(BigInt(order.endTime)) +
      hexWord(order.zoneHash) +
      hexWord(BigInt(order.salt)) +
      hexWord(order.conduitKey) +
      hexWord(BigInt(order.counter)) +
      offer +
      consideration
    )
  })
  let offset = tuples.length * 32
  const offsets = tuples.map(tuple => {
    const at = offset
    offset += tuple.length / 2
    return hexWord(at)
  })
  return `0xfd9f1e10${hexWord(32)}${hexWord(tuples.length)}${offsets.join("")}${tuples.join("")}`
}
