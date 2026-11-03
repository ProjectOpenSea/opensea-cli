import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import {
  addPaginationOptions,
  addSortDirectionOption,
  addTraitsOption,
  collectOption,
  parseBooleanOption,
  parseFloatOption,
  parseIntOption,
  parseTraitsOption,
  pathSegment,
  readJsonBodyOption,
} from "../parse.js"
import type {
  BatchNftsRequest,
  NftBatchResponse,
  ValidateMetadataResponse,
} from "../types/index.js"

/** [CLI flag, Commander option key, wire parameter] per normalized attribute. */
const GROUP_FACET_FILTERS = [
  ["franchise", "franchise", "franchise"],
  ["grader", "grader", "grader"],
  ["grade", "grade", "grade"],
  ["subject", "subject", "subject"],
  ["year", "year", "year"],
  ["set", "set", "set"],
  ["language", "language", "language"],
  ["edition", "edition", "edition"],
  ["product-type", "productType", "product_type"],
] as const

type GroupFacetFilterOptions = Partial<
  Record<(typeof GROUP_FACET_FILTERS)[number][1], string[]>
>

function addGroupFacetFilterOptions(cmd: Command): Command {
  for (const [flag, , wire] of GROUP_FACET_FILTERS) {
    cmd.option(
      `--${flag} <value>`,
      `Only NFTs whose normalized ${wire.replace("_", " ")} is this value (repeatable, matches any)`,
      collectOption,
    )
  }
  return cmd
}

function groupFacetFilterParams(
  options: GroupFacetFilterOptions,
): Record<string, string[] | undefined> {
  const params: Record<string, string[] | undefined> = {}
  for (const [, key, wire] of GROUP_FACET_FILTERS) {
    params[wire] = options[key]
  }
  return params
}

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
        `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(contract)}/nfts/${pathSegment(tokenId)}`,
      )
    })

  addTraitsOption(
    addPaginationOptions(
      cmd
        .command("list-by-collection")
        .description("List NFTs in a collection")
        .argument("<slug>", "Collection slug")
        .option(
          "--has-agent-binding <bool>",
          "Only NFTs that do (true) or do not (false) have an ERC-8217 agent binding",
        ),
    ),
  ).action(
    async (
      slug: string,
      options: {
        limit: string
        next?: string
        traits?: string
        hasAgentBinding?: string
      },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/collection/${pathSegment(slug)}/nfts`,
        {
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
          traits: options.traits
            ? parseTraitsOption(options.traits)
            : undefined,
          has_agent_binding:
            options.hasAgentBinding !== undefined
              ? parseBooleanOption(
                  options.hasAgentBinding,
                  "--has-agent-binding",
                )
              : undefined,
        },
      )
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
        `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(contract)}/nfts`,
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
  )
    .option(
      "--include-auto-hidden",
      "Also return NFTs hidden automatically because a third party minted or sent them to this account. NFTs the holder hid themselves stay hidden, and NFTs removed for policy violations are not returned.",
    )
    .action(
      async (
        chain: string,
        address: string,
        options: {
          limit: string
          next?: string
          includeAutoHidden?: boolean
        },
      ) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/chain/${pathSegment(chain)}/account/${pathSegment(address)}/nfts`,
          {
            limit: parseIntOption(options.limit, "--limit"),
            next: options.next,
            // The CLI client sends param keys verbatim, so this is the wire
            // name. Undefined when the flag is absent, and dropped there.
            include_auto_hidden: options.includeAutoHidden,
          },
        )
      },
    )

  addGroupFacetFilterOptions(
    addSortDirectionOption(
      addPaginationOptions(
        cmd
          .command("list-by-group")
          .description(
            "Search NFTs across a collection group by normalized attributes",
          )
          .argument("<group>", "Collection group (e.g. trading_cards)"),
        "Number of results (max 100)",
      ),
    )
      .option(
        "--collection-slug <slug>",
        "Restrict to this collection in the group (repeatable, max 10)",
        collectOption,
      )
      .option("--query <text>", "Full-text match on NFT name")
      .option("--is-listed <bool>", "Only listed (true) or unlisted (false)")
      .option(
        "--min-estimated-value-usd <usd>",
        "Minimum estimated value in USD, inclusive",
      )
      .option(
        "--max-estimated-value-usd <usd>",
        "Maximum estimated value in USD, inclusive",
      )
      .option(
        "--sort-by <field>",
        "Sort field (price, top_offer, last_sale, last_sale_date, created_date, received_date, listing_created_date, best_deal, estimated_value)",
      ),
  ).action(
    async (
      group: string,
      options: GroupFacetFilterOptions & {
        limit: string
        next?: string
        collectionSlug?: string[]
        query?: string
        isListed?: string
        minEstimatedValueUsd?: string
        maxEstimatedValueUsd?: string
        sortBy?: string
        sortDirection?: string
      },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/nfts/group/${pathSegment(group)}`,
        {
          collection_slugs: options.collectionSlug,
          query: options.query,
          is_listed:
            options.isListed === undefined
              ? undefined
              : parseBooleanOption(options.isListed, "--is-listed"),
          min_estimated_value_usd:
            options.minEstimatedValueUsd === undefined
              ? undefined
              : parseFloatOption(
                  options.minEstimatedValueUsd,
                  "--min-estimated-value-usd",
                ),
          max_estimated_value_usd:
            options.maxEstimatedValueUsd === undefined
              ? undefined
              : parseFloatOption(
                  options.maxEstimatedValueUsd,
                  "--max-estimated-value-usd",
                ),
          sort_by: options.sortBy,
          sort_direction: options.sortDirection,
          limit: parseIntOption(options.limit, "--limit"),
          next: options.next,
          ...groupFacetFilterParams(options),
        },
      )
    },
  )

  addGroupFacetFilterOptions(
    cmd
      .command("group-facets")
      .description(
        "Get normalized attribute values and NFT counts for a collection group",
      )
      .argument("<group>", "Collection group (e.g. trading_cards)")
      .option(
        "--facet-type <type>",
        "Only return this facet type, e.g. grader (repeatable)",
        collectOption,
      )
      .option(
        "--collection-slug <slug>",
        "Restrict counts to this collection in the group (repeatable, max 10)",
        collectOption,
      ),
  ).action(
    async (
      group: string,
      options: GroupFacetFilterOptions & {
        facetType?: string[]
        collectionSlug?: string[]
      },
    ) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/nfts/group/${pathSegment(group)}/facets`,
        {
          facet_types: options.facetType,
          collection_slugs: options.collectionSlug,
          ...groupFacetFilterParams(options),
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
        `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(contract)}/nfts/${pathSegment(tokenId)}/refresh`,
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
        `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(address)}`,
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
          `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(contract)}/nfts/${pathSegment(tokenId)}/validate-metadata`,
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
        `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(contract)}/nfts/${pathSegment(tokenId)}/owners`,
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
        `/api/v2/chain/${pathSegment(chain)}/contract/${pathSegment(contract)}/nfts/${pathSegment(tokenId)}/analytics`,
      )
    })

  return cmd
}
