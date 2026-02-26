import type { OpenSeaClientConfig } from "./types/index.js"

const DEFAULT_BASE_URL = "https://api.opensea.io"
const DEFAULT_TIMEOUT_MS = 30_000

export class OpenSeaClient {
  private apiKey: string
  private baseUrl: string
  private defaultChain: string
  private timeoutMs: number
  private verbose: boolean

  constructor(config: OpenSeaClientConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.defaultChain = config.chain ?? "ethereum"
    this.timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS
    this.verbose = config.verbose ?? false
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    if (this.verbose) {
      console.error(`[verbose] GET ${url.toString()}`)
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": this.apiKey,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (this.verbose) {
      console.error(`[verbose] ${response.status} ${response.statusText}`)
    }

    if (!response.ok) {
      const body = await response.text()
      throw new OpenSeaAPIError(response.status, body, path)
    }

    return response.json() as Promise<T>
  }

  async post<T>(
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-api-key": this.apiKey,
    }

    if (body) {
      headers["Content-Type"] = "application/json"
    }

    if (this.verbose) {
      console.error(`[verbose] POST ${url.toString()}`)
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (this.verbose) {
      console.error(`[verbose] ${response.status} ${response.statusText}`)
    }

    if (!response.ok) {
      const text = await response.text()
      throw new OpenSeaAPIError(response.status, text, path)
    }

    return response.json() as Promise<T>
  }

  getDefaultChain(): string {
    return this.defaultChain
  }
}

export class OpenSeaAPIError extends Error {
  constructor(
    public statusCode: number,
    public responseBody: string,
    public path: string,
  ) {
    super(`OpenSea API error ${statusCode} on ${path}: ${responseBody}`)
    this.name = "OpenSeaAPIError"
  }
}
