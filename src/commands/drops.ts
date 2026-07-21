import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import {
  addPaginationOptions,
  parseIntOption,
  readJsonBodyOption,
} from "../parse.js"
import type {
  Chain,
  DropDeployRequest,
  DropDeployResponse,
  DropEligibilityResponse,
  DropMintResponse,
  SaveDropEditsRequest,
  SaveDropItemMediaRequest,
  SavePrerevealDropItemRequest,
  SaveSelfMintDropItemRequest,
  UpdateDropItemRequest,
  UpdateSelfMintDropItemRequest,
  UploadDropItemMediaRequest,
  ValidateDropAllowlistRequest,
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
    .command("eligibility")
    .description("Check drop eligibility for the authenticated wallet")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      const result = await client.get<DropEligibilityResponse>(
        `/api/v2/drops/${slug}/eligibility`,
      )
      console.log(formatOutput(result, getFormat()))
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

  cmd
    .command("save-edits")
    .description("Save edits to a drop's stages and settings (Creator Studio)")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the SaveDropEditsRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<SaveDropEditsRequest>(
        options.body,
        "--body",
      )
      const result = await client.post(`/api/v2/drops/${slug}`, request)
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("create-allowlist-upload")
    .description("Request a presigned upload for a drop allowlist file")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      const result = await client.post(`/api/v2/drops/${slug}/allowlist`)
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("validate-allowlist")
    .description("Validate a previously uploaded drop allowlist file")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the ValidateDropAllowlistRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<ValidateDropAllowlistRequest>(
        options.body,
        "--body",
      )
      const result = await client.post(
        `/api/v2/drops/${slug}/allowlist/validate`,
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("save-prereveal-item")
    .description("Save the prereveal item for a drop")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the SavePrerevealDropItemRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<SavePrerevealDropItemRequest>(
        options.body,
        "--body",
      )
      const result = await client.post(
        `/api/v2/drops/${slug}/prereveal-item`,
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("save-item")
    .description("Save a self-mint drop item")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the SaveSelfMintDropItemRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<SaveSelfMintDropItemRequest>(
        options.body,
        "--body",
      )
      const result = await client.post(`/api/v2/drops/${slug}/items`, request)
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("update-self-mint-item")
    .description("Replace a self-mint drop item by token id")
    .argument("<slug>", "Collection slug")
    .argument("<token_id>", "Token id of the item to update")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the UpdateSelfMintDropItemRequest body",
    )
    .action(
      async (slug: string, tokenId: string, options: { body: string }) => {
        const client = getClient()
        const request = readJsonBodyOption<UpdateSelfMintDropItemRequest>(
          options.body,
          "--body",
        )
        const result = await client.put(
          `/api/v2/drops/${slug}/items/${tokenId}`,
          request,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("update-item")
    .description("Update fields of a drop item by token id")
    .argument("<slug>", "Collection slug")
    .argument("<token_id>", "Token id of the item to update")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the UpdateDropItemRequest body",
    )
    .action(
      async (slug: string, tokenId: string, options: { body: string }) => {
        const client = getClient()
        const request = readJsonBodyOption<UpdateDropItemRequest>(
          options.body,
          "--body",
        )
        const result = await client.patch(
          `/api/v2/drops/${slug}/items/${tokenId}`,
          request,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("create-item-media-upload")
    .description("Request presigned uploads for drop item media files")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the UploadDropItemMediaRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<UploadDropItemMediaRequest>(
        options.body,
        "--body",
      )
      const result = await client.post(
        `/api/v2/drops/${slug}/items/media`,
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("save-item-media")
    .description("Persist previously uploaded drop item media")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the SaveDropItemMediaRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<SaveDropItemMediaRequest>(
        options.body,
        "--body",
      )
      const result = await client.post(
        `/api/v2/drops/${slug}/items/media/save`,
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
