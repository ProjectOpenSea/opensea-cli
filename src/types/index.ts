export type * from "./api.js"

export interface OpenSeaClientConfig {
  apiKey: string
  baseUrl?: string
  chain?: string
}

export interface CommandOptions {
  apiKey?: string
  chain?: string
  format?: "json" | "table"
  raw?: boolean
}
