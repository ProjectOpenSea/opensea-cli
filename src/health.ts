import { OpenSeaAPIError, type OpenSeaClient } from "./client.js"
import type { HealthResult } from "./types/index.js"

export async function checkHealth(
  client: OpenSeaClient,
): Promise<HealthResult> {
  const keyPrefix = client.getApiKeyPrefix()
  try {
    await client.get("/api/v2/collections", { limit: 1 })
    return {
      status: "ok",
      key_prefix: keyPrefix,
      message: "Connectivity is working",
    }
  } catch (error) {
    let message: string
    if (error instanceof OpenSeaAPIError) {
      message =
        error.statusCode === 401 || error.statusCode === 403
          ? `Authentication failed (${error.statusCode}): ${error.responseBody}`
          : `API error (${error.statusCode}): ${error.responseBody}`
    } else {
      message = `Network error: ${(error as Error).message}`
    }
    return {
      status: "error",
      key_prefix: keyPrefix,
      message,
    }
  }
}
