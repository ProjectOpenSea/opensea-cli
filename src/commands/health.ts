import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import { checkHealth } from "../health.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"

export function healthCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("health")
    .description("Check API connectivity and authentication")
    .action(async () => {
      const client = getClient()
      const result = await checkHealth(client)
      console.log(formatOutput(result, getFormat()))
      if (result.status === "error") {
        process.exit(1)
      }
    })

  return cmd
}
