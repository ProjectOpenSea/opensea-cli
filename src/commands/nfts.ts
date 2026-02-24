import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import { formatOutput } from "../output.js"
import type { Contract, NFT } from "../types/index.js"

export function nftsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => "json" | "table",
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

  cmd
    .command("list-by-collection")
    .description("List NFTs in a collection")
    .argument("<slug>", "Collection slug")
    .option("--limit <limit>", "Number of results", "20")
    .option("--next <cursor>", "Pagination cursor")
    .action(async (slug: string, options: { limit: string; next?: string }) => {
      const client = getClient()
      const result = await client.get<{ nfts: NFT[]; next?: string }>(
        `/api/v2/collection/${slug}/nfts`,
        {
          limit: Number.parseInt(options.limit, 10),
          next: options.next,
        },
      )
      console.log(formatOutput(result, getFormat()))
    })

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
            limit: Number.parseInt(options.limit, 10),
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
            limit: Number.parseInt(options.limit, 10),
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

  return cmd
}
