/**
 * Privy wallet adapter.
 *
 * Uses Privy's server-side wallet API to sign and send transactions.
 * Transactions are governed by Privy's programmable policy engine —
 * policies (transaction limits, destination allowlists, chain restrictions)
 * are evaluated in a trusted execution environment before any signing occurs.
 *
 * Required environment variables:
 *   PRIVY_APP_ID      — Privy application ID
 *   PRIVY_APP_SECRET  — Privy application secret
 *   PRIVY_WALLET_ID   — Wallet ID to use for signing
 *
 * @see https://docs.privy.io/wallets/wallets/server-side-access
 * @see https://docs.privy.io/controls/policies/overview
 */

import type {
  TransactionRequest,
  TransactionResult,
  WalletAdapter,
} from "./adapter.js"

interface PrivyConfig {
  appId: string
  appSecret: string
  walletId: string
  baseUrl?: string
}

const PRIVY_API_BASE = "https://api.privy.io"

export class PrivyAdapter implements WalletAdapter {
  readonly name = "privy"
  onRequest?: (method: string, params: unknown) => void
  onResponse?: (method: string, result: unknown, durationMs: number) => void
  private config: PrivyConfig
  private cachedAddress?: string

  constructor(config: PrivyConfig) {
    this.config = config
  }

  /**
   * Create a PrivyAdapter from environment variables.
   * Throws if any required variable is missing.
   */
  static fromEnv(): PrivyAdapter {
    const appId = process.env.PRIVY_APP_ID
    const appSecret = process.env.PRIVY_APP_SECRET
    const walletId = process.env.PRIVY_WALLET_ID

    if (!appId) {
      throw new Error("PRIVY_APP_ID environment variable is required")
    }
    if (!appSecret) {
      throw new Error("PRIVY_APP_SECRET environment variable is required")
    }
    if (!walletId) {
      throw new Error("PRIVY_WALLET_ID environment variable is required")
    }

    return new PrivyAdapter({
      appId,
      appSecret,
      walletId,
      baseUrl: process.env.PRIVY_API_BASE_URL,
    })
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? PRIVY_API_BASE
  }

  private get authHeaders(): Record<string, string> {
    const credentials = Buffer.from(
      `${this.config.appId}:${this.config.appSecret}`,
    ).toString("base64")
    return {
      Authorization: `Basic ${credentials}`,
      "privy-app-id": this.config.appId,
      "Content-Type": "application/json",
    }
  }

  async getAddress(): Promise<string> {
    if (this.cachedAddress) return this.cachedAddress

    const response = await fetch(
      `${this.baseUrl}/v1/wallets/${this.config.walletId}`,
      { headers: this.authHeaders },
    )

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Privy getAddress failed (${response.status}): ${body}`)
    }

    const data = (await response.json()) as { address: string }
    this.cachedAddress = data.address
    return data.address
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionResult> {
    this.onRequest?.("sendTransaction", tx)
    const startTime = Date.now()

    const caip2 = `eip155:${tx.chainId}`

    const response = await fetch(
      `${this.baseUrl}/v1/wallets/${this.config.walletId}/rpc`,
      {
        method: "POST",
        headers: this.authHeaders,
        body: JSON.stringify({
          method: "eth_sendTransaction",
          caip2,
          params: {
            transaction: {
              to: tx.to,
              data: tx.data,
              value: tx.value,
            },
          },
        }),
      },
    )

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `Privy sendTransaction failed (${response.status}): ${body}`,
      )
    }

    const data = (await response.json()) as { data: { hash: string } }
    const result = { hash: data.data.hash }
    this.onResponse?.("sendTransaction", result, Date.now() - startTime)
    return result
  }
}
