import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { parseIntOption } from "../parse.js"

type TokenGroup = Record<string, unknown>

export function tokenGroupsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("token-groups").description(
    "Query token groups (equivalent currencies across chains, e.g. 'eth')",
  )

  cmd
    .command("list")
    .description("List token groups sorted by market cap descending")
    .option("--limit <limit>", "Number of results (max 100, default 50)", "50")
    .option("--next <cursor>", "Pagination cursor")
    .action(async (options: { limit: string; next?: string }) => {
      const client = getClient()
      const result = await client.get<{
        token_groups: TokenGroup[]
        next?: string
      }>("/api/v2/token-groups", {
        limit: parseIntOption(options.limit, "--limit"),
        // Token Groups API uses "cursor" instead of "next" as the query param
        cursor: options.next,
      })
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("get")
    .description("Get a single token group by slug")
    .argument("<slug>", "Token group slug (e.g. 'eth')")
    .action(async (slug: string) => {
      const client = getClient()
      const result = await client.get<TokenGroup>(
        `/api/v2/token-groups/${slug}`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
