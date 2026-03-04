import { Command } from "commander"
import { OpenSeaAPIError, type OpenSeaClient } from "../client.js"

export function healthCommand(getClient: () => OpenSeaClient): Command {
  const cmd = new Command("health")
    .description("Check API connectivity and key validity")
    .action(async () => {
      const client = getClient()
      const start = performance.now()
      try {
        await client.get("/api/v2/collections", { limit: 1 })
        const ms = Math.round(performance.now() - start)
        console.log(JSON.stringify({ status: "ok", latency_ms: ms }, null, 2))
      } catch (error) {
        const ms = Math.round(performance.now() - start)
        if (error instanceof OpenSeaAPIError) {
          console.error(
            JSON.stringify(
              {
                status: "error",
                latency_ms: ms,
                http_status: error.statusCode,
                message: error.responseBody,
              },
              null,
              2,
            ),
          )
          process.exit(1)
        }
        console.error(
          JSON.stringify(
            {
              status: "error",
              latency_ms: ms,
              message: (error as Error).message,
            },
            null,
            2,
          ),
        )
        process.exit(1)
      }
    })

  return cmd
}
