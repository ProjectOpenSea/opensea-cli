import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import {
  addPaginationOptions,
  addTraitsOption,
  parseIntOption,
  parseTraitsOption,
  readJsonBodyOption,
} from "../parse.js"
import type {
  BatchNftsRequest,
  Chain,
  NftBatchResponse,
  ValidateMetadataResponse,
} from "../types/index.js"

export function nftsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("nfts").description("Query NFTs")

  cmd
    .command("get")
    .description("Get a single NFT")
    .argument("<chain>", "Chain (e.g. ethereum, base)")
    .argument("<contract>", "Contract address")
    .argument("<token-id>", "Token ID")
    .action(async (chain: string, contract: string, tokenId: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/chain/${chain}/contract/${contract}/nfts/${tokenId}`,
      )
    })

  addTraitsOption(
    addPaginationOptions(
      cmd
        .command("list-by-collection")
        .description("List NFTs in a collection")
        .argument("<slug>", "Collection slug"),
    ),
  ).action(
    async (
      slug: string,
      options: { limit: string; next?: string; traits?: string },
    ) => {
      const client = getClient()
      await outputGet(client, getFormat(), `/api/v2/collection/${slug}/nfts`, {
        limit: parseIntOption(options.limit, "--limit"),
        next: options.next,
        traits: options.traits ? parseTraitsOption(options.traits) : undefined,
      })
    },
  )

  addPaginationOptions(
    cmd
      .command("list-by-contract")
      .description("List NFTs by contract address")
      .argument("<chain>", "Chain")
      .argument("<contract>", "Contract address"),
  ).action(
    async (
      chain: string,
      contract: string,
      options: { limit: string; next?: string },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/chain/${chain}/contract/${contract}/nfts`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        },
      )
    },
  )

  addPaginationOptions(
    cmd
      .command("list-by-account")
      .description("List NFTs owned by an account")
      .argument("<chain>", "Chain")
      .argument("<address>", "Account address"),
  ).action(
    async (
      chain: string,
      address: string,
      options: { limit: string; next?: string },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/chain/${chain}/account/${address}/nfts`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        },
      )
    },
  )

  cmd
    .command("refresh")
    .description("Refresh NFT metadata")
    .argument("<chain>", "Chain")
    .argument("<contract>", "Contract address")
    .argument("<token-id>", "Token ID")
    .action(async (chain: string, contract: string, tokenId: string) => {
      const client = getClient()
      await client.post(
        `/api/v2/chain/${chain}/contract/${contract}/nfts/${tokenId}/refresh`,
      )
      console.log(
        formatOutput(
          { status: "ok", message: "Metadata refresh requested" },
          getFormat(),
        ),
      )
    })

  cmd
    .command("contract")
    .description("Get contract details")
    .argument("<chain>", "Chain")
    .argument("<address>", "Contract address")
    .action(async (chain: string, address: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/chain/${chain}/contract/${address}`,
      )
    })

  cmd
    .command("validate-metadata")
    .description("Validate NFT metadata by fetching and parsing it")
    .argument("<chain>", "Chain")
    .argument("<contract>", "Contract address")
    .argument("<token-id>", "Token ID")
    .option(
      "--ignore-cache",
      "Ignore cached item URLs and re-fetch from source",
    )
    .action(
      async (
        chain: string,
        contract: string,
        tokenId: string,
        options: { ignoreCache?: boolean },
      ) => {
        const client = getClient()
        const params: Record<string, unknown> = {}
        if (options.ignoreCache) {
          params.ignoreCachedItemUrls = true
        }
        const result = await client.post<ValidateMetadataResponse>(
          `/api/v2/chain/${chain}/contract/${contract}/nfts/${tokenId}/validate-metadata`,
          undefined,
          params,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("batch")
    .description("Get multiple NFTs in one request by chain/contract/token id")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the batch request body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<BatchNftsRequest>(
        options.body,
        "--body",
      )
      const result = await client.post<NftBatchResponse>(
        "/api/v2/nfts/batch",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  addPaginationOptions(
    cmd
      .command("owners")
      .description("Get owners of an NFT (paginated for ERC-1155s)")
      .argument("<chain>", "Chain")
      .argument("<contract>", "Contract address")
      .argument("<token-id>", "Token ID"),
    "Number of results (max 100)",
  ).action(
    async (
      chain: string,
      contract: string,
      tokenId: string,
      options: { limit: string; next?: string },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/chain/${chain as Chain}/contract/${contract}/nfts/${tokenId}/owners`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
        },
      )
    },
  )

  cmd
    .command("analytics")
    .description("Get analytics (historical sale points) for an NFT")
    .argument("<chain>", "Chain")
    .argument("<contract>", "Contract address")
    .argument("<token-id>", "Token ID")
    .action(async (chain: string, contract: string, tokenId: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/chain/${chain as Chain}/contract/${contract}/nfts/${tokenId}/analytics`,
      )
    })

  return cmd
}
