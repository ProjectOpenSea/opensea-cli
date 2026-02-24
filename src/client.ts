import type { OpenSeaClientConfig } from "./types/index.js"

const DEFAULT_BASE_URL = "https://api.opensea.io"

export class OpenSeaClient {
  private apiKey: string
  private baseUrl: string
  private defaultChain: string

  constructor(config: OpenSeaClientConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.defaultChain = config.chain ?? "ethereum"
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

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": this.apiKey,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new OpenSeaAPIError(response.status, body, path)
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
