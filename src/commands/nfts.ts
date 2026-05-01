import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { addTraitsOption, parseIntOption, parseTraitsOption } from "../parse.js"
import type { Contract, NFT, ValidateMetadataResponse } from "../types/index.js"

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
      const result = await client.get<{ nft: NFT }>(
        `/api/v2/chain/${chain}/contract/${contract}/nfts/${tokenId}`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  addTraitsOption(
    cmd
      .command("list-by-collection")
      .description("List NFTs in a collection")
      .argument("<slug>", "Collection slug")
      .option("--limit <limit>", "Number of results", "20")
      .option("--next <cursor>", "Pagination cursor"),
  ).action(
    async (
      slug: string,
      options: { limit: string; next?: string; traits?: string },
    ) => {
      const client = getClient()
      const result = await client.get<{ nfts: NFT[]; next?: string }>(
        `/api/v2/collection/${slug}/nfts`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
          traits: options.traits
            ? parseTraitsOption(options.traits)
            : undefined,
        },
      )
      console.log(formatOutput(result, getFormat()))
    },
  )

  cmd
    .command("list-by-contract")
    .description("List NFTs by contract address")
    .argument("<chain>", "Chain")
    .argument("<contract>", "Contract address")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (
        chain: string,
        contract: string,
        options: { limit: string; next?: string },
      ) => {
        const client = getClient()
        const result = await client.get<{ nfts: NFT[]; next?: string }>(
          `/api/v2/chain/${chain}/contract/${contract}/nfts`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            next: options.next,
          },
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("list-by-account")
    .description("List NFTs owned by an account")
    .argument("<chain>", "Chain")
    .argument("<address>", "Account address")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(
      async (
        chain: string,
        address: string,
        options: { limit: string; next?: string },
      ) => {
        const client = getClient()
        const result = await client.get<{ nfts: NFT[]; next?: string }>(
          `/api/v2/chain/${chain}/account/${address}/nfts`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            next: options.next,
          },
        )
        console.log(formatOutput(result, getFormat()))
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
      const result = await client.get<Contract>(
        `/api/v2/chain/${chain}/contract/${address}`,
      )
      console.log(formatOutput(result, getFormat()))
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

  return cmd
}
