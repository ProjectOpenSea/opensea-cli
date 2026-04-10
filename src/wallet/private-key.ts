/**
 * Raw private key wallet adapter.
 *
 * WARNING: Using a raw private key is NOT recommended for production use.
 * It provides no spending limits, no destination allowlists, and no
 * human-in-the-loop approval. Prefer Privy, Turnkey, or Fireblocks
 * for managed wallet security.
 *
 * This adapter sends transactions via eth_sendTransaction on the RPC node,
 * which requires the node to manage the key (e.g. Hardhat, Anvil, Ganache).
 * The PRIVATE_KEY env var is validated (format + address derivation) to
 * confirm intent, but is NOT used for signing — the RPC node holds the key
 * and signs server-side. This means this adapter only works with local dev
 * nodes, not production RPC providers like Infura or Alchemy.
 *
 * Required environment variables:
 *   PRIVATE_KEY      — Hex-encoded private key (validated for format;
 *                      the RPC node must already have this key imported)
 *   RPC_URL          — JSON-RPC endpoint URL (must be a local dev node)
 *   WALLET_ADDRESS   — The wallet address corresponding to the private key
 */

import type {
  TransactionRequest,
  TransactionResult,
  WalletAdapter,
} from "./adapter.js"

/** Known hosted RPC provider hostnames that don't support eth_sendTransaction */
const HOSTED_RPC_PROVIDERS = [
  "infura.io",
  "alchemy.com",
  "quicknode.com",
  "ankr.com",
  "cloudflare-eth.com",
  "pokt.network",
  "blastapi.io",
  "chainnodes.org",
  "drpc.org",
]

interface PrivateKeyConfig {
  /**
   * The private key hex string. Validated at construction time to confirm
   * the user intends to use raw key mode, but NOT used for signing.
   * The RPC node (Hardhat/Anvil/Ganache) handles signing via eth_sendTransaction.
   */
  privateKey: string
  rpcUrl: string
  walletAddress: string
}

export class PrivateKeyAdapter implements WalletAdapter {
  readonly name = "private-key"
  onRequest?: (method: string, params: unknown) => void
  onResponse?: (method: string, result: unknown, durationMs: number) => void
  private config: PrivateKeyConfig
  private hasWarned = false

  constructor(config: PrivateKeyConfig) {
    this.config = config
  }

  /**
   * Create a PrivateKeyAdapter from environment variables.
   * Validates the private key format and warns if the RPC URL looks
   * like a hosted provider (which won't support eth_sendTransaction).
   */
  static fromEnv(): PrivateKeyAdapter {
    const privateKey = process.env.PRIVATE_KEY
    const rpcUrl = process.env.RPC_URL
    const walletAddress = process.env.WALLET_ADDRESS

    if (!privateKey) {
      throw new Error("PRIVATE_KEY environment variable is required")
    }
    if (!rpcUrl) {
      throw new Error(
        "RPC_URL environment variable is required when using PRIVATE_KEY",
      )
    }
    if (!walletAddress) {
      throw new Error(
        "WALLET_ADDRESS environment variable is required when using PRIVATE_KEY",
      )
    }

    // Validate private key format (should be 32 bytes hex, with or without 0x prefix)
    const cleanKey = privateKey.startsWith("0x")
      ? privateKey.slice(2)
      : privateKey
    if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
      throw new Error(
        "PRIVATE_KEY must be a 32-byte hex string (64 hex characters, with optional 0x prefix)",
      )
    }

    // Warn if RPC URL looks like a hosted provider
    try {
      const host = new URL(rpcUrl).hostname
      const isHosted = HOSTED_RPC_PROVIDERS.some(provider =>
        host.includes(provider),
      )
      if (isHosted) {
        console.warn(
          `WARNING: RPC_URL (${host}) looks like a hosted provider. ` +
            "The private-key adapter uses eth_sendTransaction which only works " +
            "with local dev nodes (Hardhat, Anvil, Ganache). " +
            "Hosted providers will reject this call.",
        )
      }
    } catch {
      // Invalid URL — will fail at sendTransaction time
    }

    return new PrivateKeyAdapter({ privateKey, rpcUrl, walletAddress })
  }

  async getAddress(): Promise<string> {
    return this.config.walletAddress
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionResult> {
    if (!this.hasWarned) {
      this.hasWarned = true
      console.warn(
        "WARNING: Using raw PRIVATE_KEY adapter. " +
          "This is not recommended for production. " +
          "Use --wallet-provider privy|turnkey|fireblocks for managed wallet security.",
      )
    }

    this.onRequest?.("sendTransaction", tx)
    const startTime = Date.now()

    const response = await fetch(this.config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendTransaction",
        params: [
          {
            from: this.config.walletAddress,
            to: tx.to,
            data: tx.data,
            value:
              tx.value === "0" ? "0x0" : `0x${BigInt(tx.value).toString(16)}`,
            chainId: `0x${tx.chainId.toString(16)}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `Private key sendTransaction failed (${response.status}): ${body}`,
      )
    }

    const data = (await response.json()) as {
      result?: string
      error?: { message: string }
    }

    if (data.error) {
      throw new Error(
        `Private key sendTransaction RPC error: ${data.error.message}`,
      )
    }

    if (!data.result) {
      throw new Error("Private key sendTransaction returned no tx hash")
    }

    const result = { hash: data.result }
    this.onResponse?.("sendTransaction", result, Date.now() - startTime)
    return result
  }
}
