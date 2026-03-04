export type * from "./api.js"

export interface OpenSeaClientConfig {
  apiKey: string
  baseUrl?: string
  chain?: string
  timeout?: number
  verbose?: boolean
  retries?: number
}

export interface CommandOptions {
  apiKey?: string
  chain?: string
  format?: "json" | "table"
  raw?: boolean
}
