export type * from "./api.js"

export interface OpenSeaClientConfig {
  apiKey: string
  baseUrl?: string
  chain?: string
  timeout?: number
  verbose?: boolean
  maxRetries?: number
  retryBaseDelay?: number
  /** Scoped JWT token for wallet-authenticated endpoints. */
  authToken?: string
}

export interface CommandOptions {
  apiKey?: string
  chain?: string
  format?: "json" | "table"
  raw?: boolean
}

export interface HealthResult {
  status: "ok" | "error"
  key_prefix: string
  authenticated: boolean
  rate_limited: boolean
  message: string
}
