import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import { addPaginationOptions, parseIntOption, pathSegment } from "../parse.js"
import type {
  CreateSignalRequest,
  SignalMutationResponse,
} from "../types/index.js"

type SubjectOptions = {
  chain?: string
  contract?: string
  tokenId?: string
  collection?: string
}

function addSubjectOptions(cmd: Command): Command {
  return cmd
    .option("--chain <chain>", "Chain of the currency or NFT contract")
    .option("--contract <address>", "Currency or NFT contract address")
    .option(
      "--token-id <id>",
      "NFT token ID with --chain and --contract (decimal on EVM, mint address on Solana)",
    )
    .option(
      "--collection <slug>",
      "Collection slug, instead of --chain and --contract",
    )
}

function subjectParams(options: SubjectOptions) {
  return {
    chain: options.chain,
    contract: options.contract,
    token_id: options.tokenId,
    collection: options.collection,
  }
}

export function signalsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("signals").description(
    "Read, post, and delete public OpenSea signals about a currency, NFT, or collection",
  )

  cmd
    .command("get")
    .description("Get a public signal by ID")
    .argument("<signal_id>", "Signal ID (sig_v1_...), passed unchanged")
    .action(async (signalId: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/signals/${pathSegment(signalId)}`,
      )
    })

  addPaginationOptions(
    addSubjectOptions(
      cmd
        .command("list")
        .description(
          "List public signals about one subject, newest first. A page can be empty while next is set; keep paging until next is null",
        ),
    ),
    "Number of results (max 100)",
  ).action(
    async (options: SubjectOptions & { limit: string; next?: string }) => {
      const client = getClient()
      await outputGet(client, getFormat(), "/api/v2/signals", {
        ...subjectParams(options),
        limit: parseIntOption(options.limit, "--limit"),
        cursor: options.next,
      })
    },
  )

  addSubjectOptions(
    cmd
      .command("create")
      .description(
        "Post a signal as the authenticated wallet (needs a token with write:posts). Not idempotent: a retry can post twice",
      )
      .requiredOption("--text <text>", "Signal text (up to 3000 characters)")
      .option(
        "--author-address <address>",
        "Authoring wallet; defaults to the wallet the token signed in with",
      ),
  ).action(
    async (
      options: SubjectOptions & { text: string; authorAddress?: string },
    ) => {
      const client = getClient()
      const body: CreateSignalRequest = {
        text: options.text,
        author_address: options.authorAddress,
        ...subjectParams(options),
      }
      const result = await client.post<SignalMutationResponse>(
        "/api/v2/signals",
        body,
      )
      console.log(formatOutput(result, getFormat()))
    },
  )

  cmd
    .command("delete")
    .description(
      "Delete a signal the authenticated wallet's account owns (needs a token with write:posts)",
    )
    .argument("<signal_id>", "Signal ID (sig_v1_...), passed unchanged")
    .action(async (signalId: string) => {
      const client = getClient()
      await client.delete(`/api/v2/signals/${pathSegment(signalId)}`)
      console.log(
        formatOutput(
          { status: "ok", message: "Signal deleted", signal_id: signalId },
          getFormat(),
        ),
      )
    })

  return cmd
}
