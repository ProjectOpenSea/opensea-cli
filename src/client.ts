import type { OpenSeaClientConfig } from "./types/index.js"

declare const __VERSION__: string

const DEFAULT_BASE_URL = "https://api.opensea.io"
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRIES = 3
const USER_AGENT = `opensea-cli/${__VERSION__}`

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

function retryDelay(attempt: number, retryAfter?: string): number {
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter)
    if (!Number.isNaN(seconds)) return seconds * 1000
  }
  const base = Math.min(1000 * 2 ** attempt, 30_000)
  return base + Math.random() * base * 0.5
}

export class OpenSeaClient {
  private apiKey: string
  private baseUrl: string
  private defaultChain: string
  private timeoutMs: number
  private verbose: boolean
  private retries: number

  constructor(config: OpenSeaClientConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.defaultChain = config.chain ?? "ethereum"
    this.timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS
    this.verbose = config.verbose ?? false
    this.retries = config.retries ?? DEFAULT_RETRIES
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

    return this.fetchWithRetry<T>(
      url,
      {
        method: "GET",
        headers: this.defaultHeaders,
      },
      path,
    )
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

    return this.fetchWithRetry<T>(
      url,
      {
        method: "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      },
      path,
    )
  }

  getDefaultChain(): string {
    return this.defaultChain
  }

  private async fetchWithRetry<T>(
    url: URL,
    init: RequestInit,
    path: string,
  ): Promise<T> {
    let lastError: OpenSeaAPIError | undefined

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0 && lastError) {
        const delay = retryDelay(attempt - 1, lastError.retryAfter)
        if (this.verbose) {
          console.error(
            `[verbose] retry ${attempt}/${this.retries}` +
              ` after ${Math.round(delay)}ms`,
          )
        }
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      if (this.verbose) {
        console.error(`[verbose] ${init.method} ${url.toString()}`)
      }

      const response = await fetch(url.toString(), {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      })

      if (this.verbose) {
        console.error(`[verbose] ${response.status} ${response.statusText}`)
      }

      if (response.ok) {
        return response.json() as Promise<T>
      }

      const body = await response.text()
      lastError = new OpenSeaAPIError(
        response.status,
        body,
        path,
        response.headers.get("retry-after") ?? undefined,
      )

      if (!isRetryable(response.status) || attempt === this.retries) {
        throw lastError
      }
    }

    throw lastError!
  }
}

export class OpenSeaAPIError extends Error {
  constructor(
    public statusCode: number,
    public responseBody: string,
    public path: string,
    public retryAfter?: string,
  ) {
    super(`OpenSea API error ${statusCode} on ${path}: ${responseBody}`)
    this.name = "OpenSeaAPIError"
  }
}
