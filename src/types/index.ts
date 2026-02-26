export type * from "./api.js"

export interface OpenSeaClientConfig {
  apiKey: string
  baseUrl?: string
  chain?: string
  timeout?: number
  verbose?: boolean
}

export interface CommandOptions {
  apiKey?: string
  chain?: string
  format?: "json" | "table"
  raw?: boolean
}
