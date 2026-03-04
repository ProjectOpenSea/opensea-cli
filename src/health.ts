import { OpenSeaAPIError, type OpenSeaClient } from "./client.js"
import type { HealthResult } from "./types/index.js"

export async function checkHealth(
  client: OpenSeaClient,
): Promise<HealthResult> {
  const keyPrefix = client.getApiKeyPrefix()

  // Step 1: Check basic connectivity with a public endpoint
  try {
    await client.get("/api/v2/collections", { limit: 1 })
  } catch (error) {
    let message: string
    if (error instanceof OpenSeaAPIError) {
      message = `API error (${error.statusCode}): ${error.responseBody}`
    } else {
      message = `Network error: ${(error as Error).message}`
    }
    return {
      status: "error",
      key_prefix: keyPrefix,
      authenticated: false,
      message,
    }
  }

  // Step 2: Validate authentication with an endpoint that requires a valid API key
  try {
    await client.get("/api/v2/listings/collection/boredapeyachtclub/all", {
      limit: 1,
    })
    return {
      status: "ok",
      key_prefix: keyPrefix,
      authenticated: true,
      message: "Connectivity and authentication are working",
    }
  } catch (error) {
    if (
      error instanceof OpenSeaAPIError &&
      (error.statusCode === 401 || error.statusCode === 403)
    ) {
      return {
        status: "error",
        key_prefix: keyPrefix,
        authenticated: false,
        message: `Authentication failed (${error.statusCode}): invalid API key`,
      }
    }
    // Non-auth error on events endpoint — connectivity works but auth is unverified
    return {
      status: "ok",
      key_prefix: keyPrefix,
      authenticated: false,
      message: "Connectivity is working but authentication could not be verified",
    }
  }
}
