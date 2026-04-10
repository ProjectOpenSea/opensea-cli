/**
 * Wallet adapter interface for signing and sending transactions.
 *
 * Abstracts away the signing backend so the CLI and SDK can work with
 * any provider (Privy, Turnkey, Fireblocks, etc.) through a single API.
 */

export interface TransactionRequest {
  to: string
  data: string
  value: string
  chainId: number
}

export interface TransactionResult {
  hash: string
}

export interface WalletAdapter {
  /** Human-readable provider name for logging */
  readonly name: string

  /** Get the wallet address */
  getAddress(): Promise<string>

  /** Sign and send a transaction, returns the tx hash */
  sendTransaction(tx: TransactionRequest): Promise<TransactionResult>

  /** Optional hook called before each adapter request (for metrics/logging) */
  onRequest?: (method: string, params: unknown) => void

  /** Optional hook called after each adapter response (for metrics/logging) */
  onResponse?: (method: string, result: unknown, durationMs: number) => void
}
