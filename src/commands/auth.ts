import { Command } from "commander"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"

const DEFAULT_BASE_URL = "https://api.opensea.io"

export function authCommand(
  getBaseUrl: () => string | undefined,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("auth").description(
    "Authentication helpers — bootstrap an API key without existing credentials",
  )

  cmd
    .command("request-key")
    .description(
      "Request a free-tier API key (rate limited to 3/hour per IP, keys expire after 30 days)",
    )
    .action(async () => {
      const baseUrl = getBaseUrl() ?? DEFAULT_BASE_URL
      const response = await fetch(`${baseUrl}/api/v2/auth/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      if (!response.ok) {
        const body = await response.text().catch(() => "")
        console.error(
          JSON.stringify(
            { error: "API Error", status: response.status, body },
            null,
            2,
          ),
        )
        process.exit(1)
      }
      const result = (await response.json()) as Record<string, unknown>
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
