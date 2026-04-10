/**
 * Turnkey wallet adapter.
 *
 * Uses Turnkey's API to sign and send transactions via their HSM-backed
 * signing infrastructure. Turnkey provides non-custodial key management
 * with policy controls, audit logging, and multi-party approval workflows.
 *
 * Authentication uses Turnkey's stamp scheme: each request body is hashed
 * and signed with a P-256 ECDSA key, then the signature + public key are
 * sent in the X-Stamp header.
 *
 * Required environment variables:
 *   TURNKEY_API_PUBLIC_KEY  — Turnkey API public key (hex-encoded, compressed or uncompressed)
 *   TURNKEY_API_PRIVATE_KEY — Turnkey API private key (hex-encoded P-256 private key)
 *   TURNKEY_ORGANIZATION_ID — Turnkey organization ID
 *   TURNKEY_WALLET_ADDRESS  — Ethereum address managed by Turnkey
 *
 * Required:
 *   TURNKEY_RPC_URL          — RPC endpoint for gas estimation and broadcast (must match target chain)
 *
 * Optional:
 *   TURNKEY_API_BASE_URL — Override the Turnkey API base URL (default: https://api.turnkey.com)
 *   TURNKEY_PRIVATE_KEY_ID — Turnkey private key ID (for signing with a specific key)
 *
 * @see https://docs.turnkey.com/
 * @see https://docs.turnkey.com/developer-tools/api-overview/stamps
 */

import type {
  TransactionRequest,
  TransactionResult,
  WalletAdapter,
} from "./adapter.js"

interface TurnkeyConfig {
  apiPublicKey: string
  apiPrivateKey: string
  organizationId: string
  walletAddress: string
  rpcUrl: string
  privateKeyId?: string
  baseUrl?: string
}

const TURNKEY_API_BASE = "https://api.turnkey.com"

export class TurnkeyAdapter implements WalletAdapter {
  readonly name = "turnkey"
  onRequest?: (method: string, params: unknown) => void
  onResponse?: (method: string, result: unknown, durationMs: number) => void
  private config: TurnkeyConfig

  constructor(config: TurnkeyConfig) {
    this.config = config
  }

  /**
   * Create a TurnkeyAdapter from environment variables.
   * Throws if any required variable is missing.
   */
  static fromEnv(): TurnkeyAdapter {
    const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY
    const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY
    const organizationId = process.env.TURNKEY_ORGANIZATION_ID
    const walletAddress = process.env.TURNKEY_WALLET_ADDRESS

    if (!apiPublicKey) {
      throw new Error("TURNKEY_API_PUBLIC_KEY environment variable is required")
    }
    if (!apiPrivateKey) {
      throw new Error(
        "TURNKEY_API_PRIVATE_KEY environment variable is required",
      )
    }
    if (!organizationId) {
      throw new Error(
        "TURNKEY_ORGANIZATION_ID environment variable is required",
      )
    }
    if (!walletAddress) {
      throw new Error("TURNKEY_WALLET_ADDRESS environment variable is required")
    }

    const rpcUrl = process.env.TURNKEY_RPC_URL
    if (!rpcUrl) {
      throw new Error(
        "TURNKEY_RPC_URL environment variable is required. " +
          "It is used for gas estimation and transaction broadcasting.",
      )
    }

    return new TurnkeyAdapter({
      apiPublicKey,
      apiPrivateKey,
      organizationId,
      walletAddress,
      rpcUrl,
      privateKeyId: process.env.TURNKEY_PRIVATE_KEY_ID,
      baseUrl: process.env.TURNKEY_API_BASE_URL,
    })
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? TURNKEY_API_BASE
  }

  /**
   * Sign a Turnkey API request using the API key pair (P-256 ECDSA).
   *
   * Turnkey uses a stamp-based authentication scheme: the request body
   * is hashed with SHA-256 and signed with the P-256 private key. The
   * stamp JSON (publicKey + scheme + signature) is then base64url-encoded
   * and sent in the X-Stamp header.
   *
   * @see https://docs.turnkey.com/developer-tools/api-overview/stamps
   */
  private async stamp(body: string): Promise<string> {
    const encoder = new TextEncoder()

    // Hash the body with SHA-256
    const bodyHash = await crypto.subtle.digest("SHA-256", encoder.encode(body))

    // Import the P-256 private key
    const keyData = hexToBytes(this.config.apiPrivateKey)
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      derEncodeP256PrivateKey(keyData),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    )

    // Sign the body hash with ECDSA P-256
    // Web Crypto returns IEEE P1363 format (raw r||s, 64 bytes for P-256).
    // Turnkey expects DER-encoded signatures, so we must convert.
    // @see https://github.com/tkhq/sdk/blob/main/packages/api-key-stamper
    const p1363Sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      bodyHash,
    )

    const derSig = p1363ToDer(new Uint8Array(p1363Sig))
    const signatureHex = bytesToHex(derSig)

    // The stamp must be base64url-encoded per Turnkey's spec
    const stampJson = JSON.stringify({
      publicKey: this.config.apiPublicKey,
      scheme: "SIGNATURE_SCHEME_TK_API_P256",
      signature: signatureHex,
    })

    return Buffer.from(stampJson).toString("base64url")
  }

  private async signedRequest(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const bodyStr = JSON.stringify(body)
    const stampValue = await this.stamp(bodyStr)

    return fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Stamp": stampValue,
      },
      body: bodyStr,
    })
  }

  async getAddress(): Promise<string> {
    return this.config.walletAddress
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionResult> {
    this.onRequest?.("sendTransaction", tx)
    const startTime = Date.now()

    // Turnkey is a pure signing service — it does NOT estimate gas or fill nonce.
    // We must populate gas fields via RPC before serializing, just like the
    // Turnkey SDK does via ethers provider.populateTransaction().
    // @see https://docs.turnkey.com/company-wallets/code-examples/signing-transactions
    const { rpcUrl } = this.config

    const gasParams = await this.estimateGasParams(rpcUrl, tx)

    // RLP-serialize the fully-populated unsigned EIP-1559 transaction for Turnkey.
    // Turnkey expects `unsignedTransaction` as hex-encoded RLP (no 0x prefix).
    // @see https://docs.turnkey.com/api-reference/activities/sign-transaction
    const rlpHex = rlpEncodeEip1559Tx({
      chainId: tx.chainId,
      nonce: gasParams.nonce,
      maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas,
      maxFeePerGas: gasParams.maxFeePerGas,
      gasLimit: gasParams.gasLimit,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    })

    const signWith = this.config.privateKeyId ?? this.config.walletAddress

    const response = await this.signedRequest(
      "/public/v1/submit/sign_transaction",
      {
        type: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2",
        organizationId: this.config.organizationId,
        timestampMs: Date.now().toString(),
        parameters: {
          signWith,
          type: "TRANSACTION_TYPE_ETHEREUM",
          unsignedTransaction: rlpHex,
        },
      },
    )

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `Turnkey sendTransaction failed (${response.status}): ${body}`,
      )
    }

    const data = (await response.json()) as {
      activity: {
        status: string
        result?: {
          signTransactionResult?: { signedTransaction: string }
        }
      }
    }

    const signedTx =
      data.activity.result?.signTransactionResult?.signedTransaction
    if (!signedTx) {
      throw new Error(
        `Turnkey sign transaction did not return a signed payload (activity status: ${data.activity.status})`,
      )
    }

    // Broadcast the signed transaction via RPC
    // Turnkey signs but does not broadcast — we must submit via eth_sendRawTransaction
    const rpcResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendRawTransaction",
        params: [signedTx],
      }),
    })

    if (!rpcResponse.ok) {
      const rpcBody = await rpcResponse.text()
      throw new Error(
        `Turnkey broadcast failed (${rpcResponse.status}): ${rpcBody}`,
      )
    }

    const rpcData = (await rpcResponse.json()) as {
      result?: string
      error?: { message: string }
    }

    if (rpcData.error) {
      throw new Error(`Turnkey broadcast RPC error: ${rpcData.error.message}`)
    }

    if (!rpcData.result) {
      throw new Error("Turnkey broadcast returned no tx hash")
    }

    const result = { hash: rpcData.result }
    this.onResponse?.("sendTransaction", result, Date.now() - startTime)
    return result
  }

  /**
   * Populate gas parameters via JSON-RPC calls to the target chain.
   * Mirrors what ethers.js provider.populateTransaction() does internally.
   *
   * Makes three parallel RPC calls:
   *   - eth_getTransactionCount (nonce)
   *   - eth_estimateGas (gasLimit)
   *   - eth_maxPriorityFeePerGas + eth_getBlockByNumber (fee data)
   */
  private async estimateGasParams(
    rpcUrl: string,
    tx: TransactionRequest,
  ): Promise<{
    nonce: bigint
    gasLimit: bigint
    maxFeePerGas: bigint
    maxPriorityFeePerGas: bigint
  }> {
    const from = this.config.walletAddress
    const txValue =
      tx.value === "0" ? "0x0" : `0x${BigInt(tx.value).toString(16)}`

    // Batch all RPC calls in parallel for speed
    const [nonceResult, gasEstimateResult, feeDataResult] = await Promise.all([
      this.rpcCall(rpcUrl, "eth_getTransactionCount", [from, "pending"]),
      this.rpcCall(rpcUrl, "eth_estimateGas", [
        {
          from,
          to: tx.to,
          data: tx.data || "0x",
          value: txValue,
        },
      ]),
      this.rpcCall(rpcUrl, "eth_feeHistory", [1, "latest", [50]]),
    ])

    const nonce = BigInt(nonceResult as string)

    // Add 20% buffer to gas estimate to avoid out-of-gas
    const rawGasLimit = BigInt(gasEstimateResult as string)
    const gasLimit = (rawGasLimit * 120n) / 100n

    // Extract fee data from eth_feeHistory
    const feeHistory = feeDataResult as {
      baseFeePerGas: string[]
      reward?: string[][]
    }
    const latestBaseFee = BigInt(
      feeHistory.baseFeePerGas[1] ?? feeHistory.baseFeePerGas[0],
    )
    const maxPriorityFeePerGas = feeHistory.reward?.[0]?.[0]
      ? BigInt(feeHistory.reward[0][0])
      : 1_500_000_000n // 1.5 gwei default

    // maxFeePerGas = 2 * baseFee + maxPriorityFeePerGas (same formula as ethers.js)
    const maxFeePerGas = latestBaseFee * 2n + maxPriorityFeePerGas

    return { nonce, gasLimit, maxFeePerGas, maxPriorityFeePerGas }
  }

  /** Make a single JSON-RPC call */
  private async rpcCall(
    rpcUrl: string,
    method: string,
    params: unknown[],
  ): Promise<unknown> {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `Turnkey RPC ${method} failed (${response.status}): ${body}`,
      )
    }

    const data = (await response.json()) as {
      result?: unknown
      error?: { message: string }
    }

    if (data.error) {
      throw new Error(`Turnkey RPC ${method} error: ${data.error.message}`)
    }

    return data.result
  }
}

/**
 * RLP-encode an unsigned EIP-1559 (type 2) transaction and return the
 * hex string without 0x prefix, as expected by Turnkey's sign_transaction API.
 *
 * EIP-1559 unsigned tx encoding:
 *   0x02 || RLP([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas,
 *               gasLimit, to, value, data, accessList])
 *
 * Gas fields must be populated via RPC before calling this function —
 * Turnkey is a pure signing service and does not estimate gas.
 *
 * @see https://eips.ethereum.org/EIPS/eip-1559
 * @see https://github.com/tkhq/sdk/blob/main/packages/ethers/src/index.ts
 */
export function rlpEncodeEip1559Tx(tx: {
  chainId: number
  nonce: bigint
  maxPriorityFeePerGas: bigint
  maxFeePerGas: bigint
  gasLimit: bigint
  to: string
  data: string
  value: string
}): string {
  const chainIdBytes = bigIntToBytes(BigInt(tx.chainId))
  const nonce = bigIntToBytes(tx.nonce)
  const maxPriorityFeePerGas = bigIntToBytes(tx.maxPriorityFeePerGas)
  const maxFeePerGas = bigIntToBytes(tx.maxFeePerGas)
  const gasLimit = bigIntToBytes(tx.gasLimit)
  const toBytes = hexToBytes(tx.to)
  const valueBytes =
    tx.value === "0" ? new Uint8Array(0) : bigIntToBytes(BigInt(tx.value))
  const dataBytes = tx.data ? hexToBytes(tx.data) : new Uint8Array(0)

  // RLP-encode the 9-element list
  const fields = [
    rlpEncodeBytes(chainIdBytes),
    rlpEncodeBytes(nonce),
    rlpEncodeBytes(maxPriorityFeePerGas),
    rlpEncodeBytes(maxFeePerGas),
    rlpEncodeBytes(gasLimit),
    rlpEncodeBytes(toBytes),
    rlpEncodeBytes(valueBytes),
    rlpEncodeBytes(dataBytes),
    rlpEncodeList([]), // empty access list
  ]

  const rlpList = rlpEncodeList(fields)

  // EIP-1559 envelope: 0x02 prefix + RLP list
  const result = new Uint8Array(1 + rlpList.length)
  result[0] = 0x02
  result.set(rlpList, 1)

  return bytesToHex(result)
}

/** RLP-encode a byte array */
function rlpEncodeBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 1 && bytes[0] < 0x80) {
    return bytes
  }
  if (bytes.length === 0) {
    return new Uint8Array([0x80])
  }
  if (bytes.length <= 55) {
    const result = new Uint8Array(1 + bytes.length)
    result[0] = 0x80 + bytes.length
    result.set(bytes, 1)
    return result
  }
  const lenBytes = bigIntToBytes(BigInt(bytes.length))
  const result = new Uint8Array(1 + lenBytes.length + bytes.length)
  result[0] = 0xb7 + lenBytes.length
  result.set(lenBytes, 1)
  result.set(bytes, 1 + lenBytes.length)
  return result
}

/** RLP-encode a list of already-RLP-encoded items */
function rlpEncodeList(items: Uint8Array[]): Uint8Array {
  let totalLen = 0
  for (const item of items) totalLen += item.length

  if (totalLen <= 55) {
    const result = new Uint8Array(1 + totalLen)
    result[0] = 0xc0 + totalLen
    let offset = 1
    for (const item of items) {
      result.set(item, offset)
      offset += item.length
    }
    return result
  }

  const lenBytes = bigIntToBytes(BigInt(totalLen))
  const result = new Uint8Array(1 + lenBytes.length + totalLen)
  result[0] = 0xf7 + lenBytes.length
  result.set(lenBytes, 1)
  let offset = 1 + lenBytes.length
  for (const item of items) {
    result.set(item, offset)
    offset += item.length
  }
  return result
}

/** Convert a BigInt to minimal big-endian byte representation */
function bigIntToBytes(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array(0)
  const hex = value.toString(16)
  const padded = hex.length % 2 === 0 ? hex : `0${hex}`
  return hexToBytes(padded)
}

/** Convert a hex string to Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16)
  }
  return bytes
}

/** Convert Uint8Array to hex string */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Convert an ECDSA signature from IEEE P1363 format (raw r||s) to DER encoding.
 * Web Crypto's crypto.subtle.sign returns P1363 (64 bytes for P-256: r[32] || s[32]).
 * Turnkey's stamp auth expects DER-encoded signatures (ASN.1 SEQUENCE of two INTEGERs).
 * @see https://github.com/tkhq/sdk/blob/main/packages/api-key-stamper
 */
export function p1363ToDer(p1363: Uint8Array): Uint8Array {
  const r = p1363.subarray(0, 32)
  const s = p1363.subarray(32, 64)

  const rDer = integerToDer(r)
  const sDer = integerToDer(s)

  const seqLen = rDer.length + sDer.length
  const result = new Uint8Array(2 + seqLen)
  result[0] = 0x30 // SEQUENCE tag
  result[1] = seqLen
  result.set(rDer, 2)
  result.set(sDer, 2 + rDer.length)
  return result
}

/** Encode a big-endian unsigned integer as an ASN.1 DER INTEGER */
function integerToDer(bytes: Uint8Array): Uint8Array {
  // Strip leading zeros
  let start = 0
  while (start < bytes.length - 1 && bytes[start] === 0) start++
  const stripped = bytes.subarray(start)

  // If high bit is set, prepend a 0x00 pad byte (ASN.1 INTEGER sign encoding)
  const needsPad = stripped[0] >= 0x80
  const len = stripped.length + (needsPad ? 1 : 0)

  const result = new Uint8Array(2 + len)
  result[0] = 0x02 // INTEGER tag
  result[1] = len
  if (needsPad) {
    result[2] = 0x00
    result.set(stripped, 3)
  } else {
    result.set(stripped, 2)
  }
  return result
}

/**
 * Wrap a raw 32-byte P-256 private key in a PKCS#8 DER envelope.
 * Web Crypto's importKey("pkcs8") requires the DER-encoded structure,
 * not just the raw key bytes.
 */
function derEncodeP256PrivateKey(rawKey: Uint8Array): ArrayBuffer {
  // PKCS#8 header for P-256 (secp256r1) private key
  const header = new Uint8Array([
    0x30,
    0x41, // SEQUENCE (65 bytes)
    0x02,
    0x01,
    0x00, // INTEGER 0 (version)
    0x30,
    0x13, // SEQUENCE (19 bytes) - AlgorithmIdentifier
    0x06,
    0x07, // OID (7 bytes) - id-ecPublicKey
    0x2a,
    0x86,
    0x48,
    0xce,
    0x3d,
    0x02,
    0x01,
    0x06,
    0x08, // OID (8 bytes) - secp256r1
    0x2a,
    0x86,
    0x48,
    0xce,
    0x3d,
    0x03,
    0x01,
    0x07,
    0x04,
    0x27, // OCTET STRING (39 bytes)
    0x30,
    0x25, // SEQUENCE (37 bytes)
    0x02,
    0x01,
    0x01, // INTEGER 1 (version)
    0x04,
    0x20, // OCTET STRING (32 bytes) - private key
  ])

  const result = new Uint8Array(header.length + rawKey.length)
  result.set(header)
  result.set(rawKey, header.length)
  return result.buffer
}
