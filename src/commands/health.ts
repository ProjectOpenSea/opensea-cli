import { Command } from "commander"
import { OpenSeaAPIError, type OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import type { HealthResult } from "../types/index.js"

export function healthCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("health")
    .description("Check API key validity and connectivity")
    .action(async () => {
      const client = getClient()
      const keyPrefix = client.getApiKeyPrefix()

      try {
        await client.get("/api/v2/collections", { limit: 1 })
        const result: HealthResult = {
          status: "ok",
          key_prefix: keyPrefix,
          message: "API key is valid and connectivity is working",
        }
        console.log(formatOutput(result, getFormat()))
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

        const result: HealthResult = {
          status: "error",
          key_prefix: keyPrefix,
          message,
        }
        console.log(formatOutput(result, getFormat()))
        process.exit(1)
      }
    })

  return cmd
}
