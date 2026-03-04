import type { OpenSeaClientConfig } from "./types/index.js"

declare const __VERSION__: string

const DEFAULT_BASE_URL = "https://api.opensea.io"
const DEFAULT_TIMEOUT_MS = 30_000
const USER_AGENT = `opensea-cli/${__VERSION__}`
const DEFAULT_MAX_RETRIES = 0
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000

function isRetryableStatus(status: number, method: string): boolean {
  if (status === 429) return true
  return status >= 500 && method === "GET"
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (!Number.isNaN(seconds)) return seconds * 1000
  const date = Date.parse(header)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  return undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class OpenSeaClient {
  private apiKey: string
  private baseUrl: string
  private defaultChain: string
  private timeoutMs: number
  private verbose: boolean
  private maxRetries: number
  private retryBaseDelay: number

  constructor(config: OpenSeaClientConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.defaultChain = config.chain ?? "ethereum"
    this.timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS
    this.verbose = config.verbose ?? false
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
    this.retryBaseDelay = config.retryBaseDelay ?? DEFAULT_RETRY_BASE_DELAY_MS
  }

  private get defaultHeaders(): Record<string, string> {
    return {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      "x-api-key": this.apiKey,
    }
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

    const response = await this.fetchWithRetry(
      url.toString(),
      {
        method: "GET",
        headers: this.defaultHeaders,
      },
      path,
    )

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

    const headers: Record<string, string> = { ...this.defaultHeaders }

    if (body) {
      headers["Content-Type"] = "application/json"
    }

    if (this.verbose) {
      console.error(`[verbose] POST ${url.toString()}`)
    }

    const response = await this.fetchWithRetry(
      url.toString(),
      {
        method: "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      },
      path,
    )

    return response.json() as Promise<T>
  }

  getDefaultChain(): string {
    return this.defaultChain
  }

  getApiKeyPrefix(): string {
    if (this.apiKey.length < 8) return "***"
    return `${this.apiKey.slice(0, 4)}...`
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    path: string,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      })

      if (this.verbose) {
        console.error(`[verbose] ${response.status} ${response.statusText}`)
      }

      if (response.ok) {
        return response
      }

      const method = init.method ?? "GET"
      if (
        attempt < this.maxRetries &&
        isRetryableStatus(response.status, method)
      ) {
        const retryAfterMs = parseRetryAfter(
          response.headers.get("Retry-After"),
        )
        const backoffMs = this.retryBaseDelay * 2 ** attempt
        const jitterMs = Math.random() * this.retryBaseDelay
        const delayMs = Math.max(retryAfterMs ?? 0, backoffMs) + jitterMs

        if (this.verbose) {
          console.error(
            `[verbose] Retry ${attempt + 1}/${this.maxRetries} after ${Math.round(delayMs)}ms (status ${response.status})`,
          )
        }

        try {
          await response.body?.cancel()
        } catch {
          // Stream may already be disturbed
        }
        await sleep(delayMs)
        continue
      }

      const text = await response.text()
      throw new OpenSeaAPIError(response.status, text, path)
    }
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
