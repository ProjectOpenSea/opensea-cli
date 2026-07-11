import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { outputGet } from "../output.js"
import { addPaginationOptions, parseIntOption } from "../parse.js"

export function tokenGroupsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("token-groups").description(
    "Query token groups (equivalent currencies across chains, e.g. 'eth')",
  )

  addPaginationOptions(
    cmd
      .command("list")
      .description("List token groups sorted by market cap descending"),
    "Number of results (max 100, default 50)",
    "50",
  ).action(async (options: { limit: string; next?: string }) => {
    const client = getClient()
    await outputGet(client, getFormat(), "/api/v2/token-groups", {
      limit: parseIntOption(options.limit, "--limit"),
      // Token Groups API uses "cursor" instead of "next" as the query param
      cursor: options.next,
    })
  })

  cmd
    .command("get")
    .description("Get a single token group by slug")
    .argument("<slug>", "Token group slug (e.g. 'eth')")
    .action(async (slug: string) => {
      const client = getClient()
      await outputGet(client, getFormat(), `/api/v2/token-groups/${slug}`)
    })

  return cmd
}
