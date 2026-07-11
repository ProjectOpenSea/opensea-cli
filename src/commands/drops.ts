import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import { addPaginationOptions, parseIntOption } from "../parse.js"
import type {
  Chain,
  DropDeployRequest,
  DropDeployResponse,
  DropMintResponse,
} from "../types/index.js"

export function dropsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("drops").description("Query and mint NFT drops")

  addPaginationOptions(
    cmd
      .command("list")
      .description("List drops (featured, upcoming, or recently minted)")
      .option(
        "--type <type>",
        "Drop type: featured, upcoming, or recently_minted",
        "featured",
      )
      .option(
        "--chains <chains>",
        "Comma-separated list of chains to filter by",
      ),
    "Number of results (max 100)",
  ).action(
    async (options: {
      type: string
      chains?: string
      limit: string
      next?: string
    }) => {
      const client = getClient()
      await outputGet(client, getFormat(), "/api/v2/drops", {
        type: options.type,
        chains: options.chains,
        limit: parseIntOption(options.limit, "--limit"),
        cursor: options.next,
      })
    },
  )

  cmd
    .command("get")
    .description("Get detailed drop info by collection slug")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      await outputGet(client, getFormat(), `/api/v2/drops/${slug}`)
    })

  cmd
    .command("mint")
    .description("Build a mint transaction for a drop")
    .argument("<slug>", "Collection slug")
    .requiredOption("--minter <address>", "Wallet address to receive tokens")
    .option("--quantity <n>", "Number of tokens to mint", "1")
    .action(
      async (
        slug: string,
        options: {
          minter: string
          quantity: string
        },
      ) => {
        const client = getClient()
        const result = await client.post<DropMintResponse>(
          `/api/v2/drops/${slug}/mint`,
          {
            minter: options.minter,
            quantity: parseIntOption(options.quantity, "--quantity"),
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("deploy")
    .description("Build a deploy-contract transaction for a new drop")
    .requiredOption("--chain <chain>", "Chain slug (e.g. ethereum, base)")
    .requiredOption("--name <name>", "Contract name")
    .requiredOption("--symbol <symbol>", "Contract symbol")
    .requiredOption("--drop-type <type>", "Drop type (e.g. seadrop_v1_erc721)")
    .requiredOption("--token-type <type>", "Token type (e.g. erc721_standard)")
    .requiredOption("--sender <address>", "Deployer wallet address")
    .action(
      async (options: {
        chain: string
        name: string
        symbol: string
        dropType: string
        tokenType: string
        sender: string
      }) => {
        const client = getClient()
        const body: DropDeployRequest = {
          chain: options.chain,
          contract_name: options.name,
          contract_symbol: options.symbol,
          drop_type: options.dropType,
          token_type: options.tokenType,
          sender: options.sender,
        }
        const result = await client.post<DropDeployResponse>(
          "/api/v2/drops/deploy",
          body,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("deploy-receipt")
    .description(
      "Get the receipt for a previously submitted deploy transaction",
    )
    .argument("<chain>", "Chain slug")
    .argument("<tx-hash>", "Transaction hash")
    .action(async (chain: string, txHash: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/drops/deploy/${chain as Chain}/${txHash}/receipt`,
      )
    })

  return cmd
}
