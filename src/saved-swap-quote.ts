import { createHmac, timingSafeEqual } from "node:crypto"
import type { SwapQuoteResponse } from "./types/index.js"
import { resolveChainId } from "./wallet/index.js"

/**
 * A swap quote saved to run later without re-quoting: `swaps quote --out` writes one, and
 * `swaps execute --quote` / `SwapsAPI.executeQuote` signs exactly its transactions.
 *
 * The quote response carries no expiry (`refresh_after_ms` is a re-request hint, not a
 * deadline), so the envelope records `saved_at` and a quote is refused once it is older than a
 * max age. The request fields are what the quote was asked for, and are what the checks and the
 * printed summary use.
 *
 * `mac` is HMAC-SHA256, hex-encoded, keyed with a secret that never leaves the machine, over
 * `canonicalSavedSwapQuote`: the JSON of `{type, version, saved_at, request, response}` with
 * every object's keys sorted, arrays in order, no whitespace, and `undefined` fields omitted. The
 * quote API does not sign its responses. A valid `mac` shows the file was signed with this
 * machine's quote key and not edited since. It does not prove the CLI wrote it: anything that can
 * read the key can sign a file too.
 */
export const SAVED_SWAP_QUOTE_TYPE = "opensea_swap_quote"
export const SAVED_SWAP_QUOTE_VERSION = 1
/** Default max age of a saved quote before it is refused as expired. */
export const DEFAULT_SAVED_QUOTE_MAX_AGE_SECONDS = 120
/** How far `saved_at` may sit in the future before the file is treated as invalid. */
const MAX_CLOCK_SKEW_MS = 60_000
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const HEX_DATA_RE = /^0x(?:[0-9a-fA-F]{2})*$/
const MAC_RE = /^[0-9a-f]{64}$/
const UNVERIFIED_MESSAGE =
  "only quote files saved by `opensea swaps quote --out` on this machine can be executed"

export interface SavedSwapQuoteRequest {
  /** Chain of the token swapped from. Every transaction must be on this chain. */
  from_chain: string
  from_address: string
  to_chain: string
  to_address: string
  /** Amount in, in the token's smallest units. */
  quantity: string
  /** Wallet the quote was built for. Only this wallet may execute it. */
  address: string
  slippage?: number
  recipient?: string
}

export interface SavedSwapQuote {
  type: typeof SAVED_SWAP_QUOTE_TYPE
  version: typeof SAVED_SWAP_QUOTE_VERSION
  /** ISO time the quote was fetched. */
  saved_at: string
  request: SavedSwapQuoteRequest
  /** The `GET /api/v2/swap/quote` response, unchanged. */
  response: SwapQuoteResponse
  /** Hex HMAC-SHA256 of `canonicalSavedSwapQuote`. */
  mac?: string
}

/** A saved quote that is malformed, expired, or does not match the executing wallet. */
export class SavedSwapQuoteError extends Error {
  override name = "SavedSwapQuoteError"
}

export function createSavedSwapQuote(
  request: {
    fromChain: string
    fromAddress: string
    toChain: string
    toAddress: string
    quantity: string
    address: string
    slippage?: number
    recipient?: string
  },
  response: SwapQuoteResponse,
  savedAt: Date = new Date(),
): SavedSwapQuote {
  return {
    type: SAVED_SWAP_QUOTE_TYPE,
    version: SAVED_SWAP_QUOTE_VERSION,
    saved_at: savedAt.toISOString(),
    request: {
      from_chain: request.fromChain,
      from_address: request.fromAddress,
      to_chain: request.toChain,
      to_address: request.toAddress,
      quantity: request.quantity,
      address: request.address,
      ...(request.slippage !== undefined && { slippage: request.slippage }),
      ...(request.recipient !== undefined && { recipient: request.recipient }),
    },
    response,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function malformed(reason: string): SavedSwapQuoteError {
  return new SavedSwapQuoteError(`Malformed saved swap quote: ${reason}`)
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  where: string,
): string {
  const value = obj[key]
  if (typeof value !== "string" || value.length === 0) {
    throw malformed(`${where}.${key} must be a non-empty string`)
  }
  return value
}

/**
 * Validate the shape of a saved quote (for example one read from a file). Throws
 * `SavedSwapQuoteError` naming the first problem. Does not check age or wallet; see
 * `checkSavedSwapQuote`.
 */
export function parseSavedSwapQuote(value: unknown): SavedSwapQuote {
  if (!isRecord(value)) throw malformed("expected a JSON object")
  if (value.type !== SAVED_SWAP_QUOTE_TYPE) {
    throw malformed(
      `type must be "${SAVED_SWAP_QUOTE_TYPE}" (write one with \`opensea swaps quote --out <file>\`)`,
    )
  }
  if (value.version !== SAVED_SWAP_QUOTE_VERSION) {
    throw malformed(
      `unsupported version ${JSON.stringify(value.version)}, expected ${SAVED_SWAP_QUOTE_VERSION}`,
    )
  }
  const savedAt = requireString(value, "saved_at", "quote")
  if (!Number.isFinite(Date.parse(savedAt))) {
    throw malformed(`saved_at "${savedAt}" is not a valid ISO time`)
  }

  const request = value.request
  if (!isRecord(request)) throw malformed("request must be an object")
  for (const key of [
    "from_chain",
    "from_address",
    "to_chain",
    "to_address",
    "address",
  ]) {
    requireString(request, key, "request")
  }
  if (!/^\d+$/.test(requireString(request, "quantity", "request"))) {
    throw malformed("request.quantity must be an integer in smallest units")
  }
  if (
    request.slippage !== undefined &&
    (typeof request.slippage !== "number" || !Number.isFinite(request.slippage))
  ) {
    throw malformed("request.slippage must be a number")
  }
  if (request.recipient !== undefined) {
    requireString(request, "recipient", "request")
  }
  if (
    value.mac !== undefined &&
    (typeof value.mac !== "string" || !MAC_RE.test(value.mac))
  ) {
    throw malformed("mac must be 64 lowercase hex characters")
  }

  const response = value.response
  if (!isRecord(response)) throw malformed("response must be an object")
  if (!isRecord(response.quote))
    throw malformed("response.quote must be an object")
  const txs = response.transactions
  if (!Array.isArray(txs) || txs.length === 0) {
    throw malformed("response.transactions must be a non-empty array")
  }
  txs.forEach((tx, i) => {
    const where = `response.transactions[${i}]`
    if (!isRecord(tx)) throw malformed(`${where} must be an object`)
    requireString(tx, "chain", where)
    if (typeof tx.data !== "string" || !HEX_DATA_RE.test(tx.data)) {
      throw malformed(`${where}.data must be 0x-prefixed hex calldata`)
    }
    // `execute` skips a transaction with no `to`. A saved quote is signed as a unit, so one
    // that cannot be sent whole is refused instead of partly executed.
    if (typeof tx.to !== "string" || !EVM_ADDRESS_RE.test(tx.to)) {
      throw malformed(`${where}.to must be a 0x-prefixed EVM address`)
    }
    if (
      tx.value !== undefined &&
      tx.value !== null &&
      (typeof tx.value !== "string" || !/^\d+$/.test(tx.value))
    ) {
      throw malformed(`${where}.value must be a decimal string`)
    }
  })

  return value as unknown as SavedSwapQuote
}

function sameAddress(a: string, b: string): boolean {
  // EVM addresses compare case-insensitively; anything else (Solana base58) is case-sensitive.
  return a.startsWith("0x") && b.startsWith("0x")
    ? a.toLowerCase() === b.toLowerCase()
    : a === b
}

/**
 * Refuse a saved quote that is too old, was built for a different wallet, or carries a
 * transaction on a chain other than the one it swaps from. Throws `SavedSwapQuoteError`.
 */
export function checkSavedSwapQuote(
  saved: SavedSwapQuote,
  options: {
    walletAddress: string
    maxAgeSeconds?: number
    now?: Date
  },
): void {
  const maxAgeSeconds =
    options.maxAgeSeconds ?? DEFAULT_SAVED_QUOTE_MAX_AGE_SECONDS
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new SavedSwapQuoteError("maxAgeSeconds must be a positive number")
  }
  const nowMs = (options.now ?? new Date()).getTime()
  const ageMs = nowMs - Date.parse(saved.saved_at)
  if (ageMs < -MAX_CLOCK_SKEW_MS) {
    throw new SavedSwapQuoteError(
      `Saved swap quote has saved_at ${saved.saved_at}, which is in the future. Re-quote.`,
    )
  }
  if (ageMs > maxAgeSeconds * 1000) {
    throw new SavedSwapQuoteError(
      `Saved swap quote expired: saved ${Math.floor(ageMs / 1000)}s ago, limit ${maxAgeSeconds}s. Re-quote.`,
    )
  }

  if (!sameAddress(saved.request.address, options.walletAddress)) {
    throw new SavedSwapQuoteError(
      `Saved swap quote was built for ${saved.request.address}, but the wallet is ${options.walletAddress}. Re-quote with --address set to the signing wallet.`,
    )
  }

  const fromChain = saved.request.from_chain
  for (const tx of saved.response.transactions) {
    if (tx.chain !== fromChain) {
      throw new SavedSwapQuoteError(
        `Saved swap quote has a transaction on ${tx.chain}, but it swaps from ${fromChain}.`,
      )
    }
  }
  try {
    resolveChainId(fromChain)
  } catch (err) {
    throw new SavedSwapQuoteError((err as Error).message)
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (isRecord(value)) {
    const fields = Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    return `{${fields.join(",")}}`
  }
  return JSON.stringify(value)
}

/** The exact string `mac` is computed over. */
export function canonicalSavedSwapQuote(saved: SavedSwapQuote): string {
  return canonicalJson({
    type: saved.type,
    version: saved.version,
    saved_at: saved.saved_at,
    request: saved.request,
    response: saved.response,
  })
}

function computeMac(saved: SavedSwapQuote, key: Uint8Array): Buffer {
  return createHmac("sha256", key)
    .update(canonicalSavedSwapQuote(saved))
    .digest()
}

/** Return a copy of `saved` with `mac` set for `key`. */
export function signSavedSwapQuote(
  saved: SavedSwapQuote,
  key: Uint8Array,
): SavedSwapQuote {
  return { ...saved, mac: computeMac(saved, key).toString("hex") }
}

/**
 * Throw `SavedSwapQuoteError` unless `saved.mac` is the HMAC of its contents under `key`. A
 * missing `mac`, a changed field, or a different key all fail the same way.
 */
export function verifySavedSwapQuoteMac(
  saved: SavedSwapQuote,
  key: Uint8Array,
): void {
  const expected = computeMac(saved, key)
  const actual =
    typeof saved.mac === "string" && MAC_RE.test(saved.mac)
      ? Buffer.from(saved.mac, "hex")
      : undefined
  if (!actual || !timingSafeEqual(actual, expected)) {
    throw new SavedSwapQuoteError(
      `Saved swap quote not verified (its mac does not match this machine's quote key): ${UNVERIFIED_MESSAGE}.`,
    )
  }
}

/** The refusal for a machine that has no quote key yet, so it cannot have saved this file. */
export function noQuoteKeyError(): SavedSwapQuoteError {
  return new SavedSwapQuoteError(
    `Saved swap quote not verified (this machine has no quote key yet): ${UNVERIFIED_MESSAGE}.`,
  )
}
