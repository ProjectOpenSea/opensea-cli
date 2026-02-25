import type { OpenSeaClientConfig } from "./types/index.js"

const DEFAULT_BASE_URL = "https://api.opensea.io"
const DEFAULT_GRAPHQL_URL = "https://gql.opensea.io/graphql"

export class OpenSeaClient {
  private apiKey: string
  private baseUrl: string
  private graphqlUrl: string
  private defaultChain: string

  constructor(config: OpenSeaClientConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.graphqlUrl = config.graphqlUrl ?? DEFAULT_GRAPHQL_URL
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

  async post<T>(path: string): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)

    const response = await fetch(url.toString(), {
      method: "POST",
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

  async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(this.graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new OpenSeaAPIError(response.status, body, "graphql")
    }

    const json = (await response.json()) as {
      data?: T
      errors?: { message: string }[]
    }

    if (json.errors?.length) {
      throw new OpenSeaAPIError(
        400,
        json.errors.map(e => e.message).join("; "),
        "graphql",
      )
    }

    if (!json.data) {
      throw new OpenSeaAPIError(500, "GraphQL response missing data", "graphql")
    }

    return json.data
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
