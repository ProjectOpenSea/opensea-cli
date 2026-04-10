/**
 * Fireblocks wallet adapter.
 *
 * Uses Fireblocks' REST API to sign and send transactions through their
 * enterprise-grade custody infrastructure. Fireblocks provides MPC-based
 * key management, transaction policy engine, and multi-level approval
 * workflows suitable for institutional use.
 *
 * Required environment variables:
 *   FIREBLOCKS_API_KEY       — Fireblocks API key
 *   FIREBLOCKS_API_SECRET    — Fireblocks API secret (RSA private key, PEM-encoded)
 *   FIREBLOCKS_VAULT_ID      — Fireblocks vault account ID
 *
 * Optional:
 *   FIREBLOCKS_API_BASE_URL  — Override the Fireblocks API base URL
 *                              (default: https://api.fireblocks.io)
 *   FIREBLOCKS_ASSET_ID      — Override the Fireblocks asset ID
 *                              (default: ETH — for EVM chains Fireblocks uses
 *                              asset IDs like ETH, ETH_TEST5, MATIC, etc.)
 *
 * @see https://developers.fireblocks.com/docs/introduction
 * @see https://developers.fireblocks.com/reference/api-overview
 */

import type {
  TransactionRequest,
  TransactionResult,
  WalletAdapter,
} from "./adapter.js"
import { CHAIN_TO_FIREBLOCKS_ASSET } from "./fireblocks.generated.js"

interface FireblocksConfig {
  apiKey: string
  apiSecret: string
  vaultId: string
  assetId?: string
  baseUrl?: string
}

const FIREBLOCKS_API_BASE = "https://api.fireblocks.io"

export class FireblocksAdapter implements WalletAdapter {
  readonly name = "fireblocks"
  onRequest?: (method: string, params: unknown) => void
  onResponse?: (method: string, result: unknown, durationMs: number) => void
  private config: FireblocksConfig
  private cachedAddress?: string

  constructor(config: FireblocksConfig) {
    this.config = config
  }

  /**
   * Create a FireblocksAdapter from environment variables.
   * Throws if any required variable is missing.
   */
  static fromEnv(): FireblocksAdapter {
    const apiKey = process.env.FIREBLOCKS_API_KEY
    const apiSecret = process.env.FIREBLOCKS_API_SECRET
    const vaultId = process.env.FIREBLOCKS_VAULT_ID

    if (!apiKey) {
      throw new Error("FIREBLOCKS_API_KEY environment variable is required")
    }
    if (!apiSecret) {
      throw new Error("FIREBLOCKS_API_SECRET environment variable is required")
    }
    if (!vaultId) {
      throw new Error("FIREBLOCKS_VAULT_ID environment variable is required")
    }

    return new FireblocksAdapter({
      apiKey,
      apiSecret,
      vaultId,
      assetId: process.env.FIREBLOCKS_ASSET_ID,
      baseUrl: process.env.FIREBLOCKS_API_BASE_URL,
    })
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? FIREBLOCKS_API_BASE
  }

  /**
   * Create a JWT for Fireblocks API authentication.
   *
   * Fireblocks uses JWT tokens signed with the API secret (RSA private key).
   * The JWT contains the API key as `sub`, a URI claim for the endpoint path,
   * and a body hash for POST requests.
   *
   * @see https://developers.fireblocks.com/reference/signing-a-request-jwt-structure
   */
  private async createJwt(path: string, bodyHash: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000)

    const header = { alg: "RS256", typ: "JWT" }
    const payload = {
      uri: path,
      nonce: crypto.randomUUID(),
      iat: now,
      exp: now + 30,
      sub: this.config.apiKey,
      bodyHash,
    }

    const b64url = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj)).toString("base64url")

    const unsigned = `${b64url(header)}.${b64url(payload)}`

    const key = await crypto.subtle.importKey(
      "pkcs8",
      this.pemToBuffer(this.config.apiSecret),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    )

    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(unsigned),
    )

    return `${unsigned}.${Buffer.from(sig).toString("base64url")}`
  }

  private pemToBuffer(pem: string): ArrayBuffer {
    const lines = pem
      .replace(/-----BEGIN .*-----/, "")
      .replace(/-----END .*-----/, "")
      .replace(/\s/g, "")
    const buf = Buffer.from(lines, "base64")
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  }

  private async hashBody(body: string): Promise<string> {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(body),
    )
    return Buffer.from(hash).toString("hex")
  }

  private resolveAssetId(chainId: number): string {
    if (this.config.assetId) return this.config.assetId
    const asset = CHAIN_TO_FIREBLOCKS_ASSET[chainId]
    if (!asset) {
      throw new Error(
        `No Fireblocks asset ID mapping for chain ${chainId}. ` +
          `Set FIREBLOCKS_ASSET_ID explicitly or use a supported chain: ${Object.keys(CHAIN_TO_FIREBLOCKS_ASSET).join(", ")}`,
      )
    }
    return asset
  }

  async getAddress(): Promise<string> {
    if (this.cachedAddress) return this.cachedAddress

    const assetId = this.config.assetId ?? "ETH"
    const path = `/v1/vault/accounts/${this.config.vaultId}/${assetId}/addresses`
    const bodyHash = await this.hashBody("")
    const jwt = await this.createJwt(path, bodyHash)

    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        "X-API-Key": this.config.apiKey,
        Authorization: `Bearer ${jwt}`,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `Fireblocks getAddress failed (${response.status}): ${body}`,
      )
    }

    const data = (await response.json()) as { address: string }[]
    if (!data[0]?.address) {
      throw new Error("Fireblocks returned no addresses for vault")
    }
    this.cachedAddress = data[0].address
    return data[0].address
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionResult> {
    this.onRequest?.("sendTransaction", tx)
    const startTime = Date.now()

    const assetId = this.resolveAssetId(tx.chainId)
    const path = "/v1/transactions"

    const requestBody = {
      assetId,
      operation: "CONTRACT_CALL",
      source: {
        type: "VAULT_ACCOUNT",
        id: this.config.vaultId,
      },
      destination: {
        type: "ONE_TIME_ADDRESS",
        oneTimeAddress: { address: tx.to },
      },
      amount: tx.value === "0" ? "0" : tx.value,
      extraParameters: {
        contractCallData: tx.data,
      },
    }

    const bodyStr = JSON.stringify(requestBody)
    const bodyHash = await this.hashBody(bodyStr)
    const jwt = await this.createJwt(path, bodyHash)

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.config.apiKey,
        Authorization: `Bearer ${jwt}`,
      },
      body: bodyStr,
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `Fireblocks sendTransaction failed (${response.status}): ${body}`,
      )
    }

    const data = (await response.json()) as { id: string; txHash?: string }

    if (data.txHash) {
      const result = { hash: data.txHash }
      this.onResponse?.("sendTransaction", result, Date.now() - startTime)
      return result
    }

    // Fireblocks transactions are async — poll until completed
    const result = await this.waitForTransaction(data.id)
    this.onResponse?.("sendTransaction", result, Date.now() - startTime)
    return result
  }

  /**
   * Poll a Fireblocks transaction until it reaches a terminal status.
   * Fireblocks MPC signing + broadcast is asynchronous, so the initial
   * POST returns a transaction ID that must be polled for the final hash.
   */
  private async waitForTransaction(txId: string): Promise<TransactionResult> {
    // Default: 60 attempts × 2s = 120s. Override with FIREBLOCKS_MAX_POLL_ATTEMPTS.
    // Note: transactions requiring multi-party approval may exceed this timeout.
    const maxAttempts = process.env.FIREBLOCKS_MAX_POLL_ATTEMPTS
      ? Number.parseInt(process.env.FIREBLOCKS_MAX_POLL_ATTEMPTS, 10)
      : 60
    const pollIntervalMs = 2000

    for (let i = 0; i < maxAttempts; i++) {
      const path = `/v1/transactions/${txId}`
      const bodyHash = await this.hashBody("")
      const jwt = await this.createJwt(path, bodyHash)

      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          "X-API-Key": this.config.apiKey,
          Authorization: `Bearer ${jwt}`,
        },
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`Fireblocks poll failed (${response.status}): ${body}`)
      }

      const data = (await response.json()) as {
        status: string
        txHash?: string
      }

      if (data.status === "COMPLETED" && data.txHash) {
        return { hash: data.txHash }
      }

      if (
        data.status === "FAILED" ||
        data.status === "REJECTED" ||
        data.status === "CANCELLED" ||
        data.status === "BLOCKED"
      ) {
        throw new Error(
          `Fireblocks transaction ${txId} ended with status: ${data.status}`,
        )
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    throw new Error(
      `Fireblocks transaction ${txId} did not complete within ${(maxAttempts * pollIntervalMs) / 1000}s`,
    )
  }
}
