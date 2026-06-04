# @opensea/cli

## 1.10.0

### Minor Changes

- Add the `opensea tools` command for searching, listing, and inspecting registered AI agent tools (ERC-8257). New `search`, `get`, and `list` subcommands wrap the `[Beta]` tool registry API, with matching `OpenSeaCLI` SDK methods and `RegisteredToolResponse` / `ToolSearchPaginatedResponse` / `ToolListPaginatedResponse` type re-exports sourced from `@opensea/api-types`.

### Patch Changes

- Updated dependencies
  - @opensea/api-types@0.4.4

## 1.9.0

### Minor Changes

- 8fa9fb5: Expose the new `token/{chain}/{address}/holders` and `token/{chain}/{address}/liquidity-pools` endpoints across SDK, CLI, and skill.

  ## SDK (`@opensea/sdk`)

  - `OpenSeaAPI.getTokenHolders(chain, address, args?)` → `TokenHoldersResponse` — paginated holders (`limit`, `cursor`, `sortBy: "QUANTITY"`, `sortDirection`) plus aggregate distribution health (`STRONG | HEALTHY | CONCERNING | BAD`).
  - `OpenSeaAPI.getTokenLiquidityPools(chain, address, args?)` → `TokenLiquidityPoolsResponse` — pools with pool type, USD reserves, bonding-curve progress, graduation flag.
  - New type exports: `TokenHoldersResponse`, `TokenHoldersArgs`, `TokenLiquidityPoolsResponse`, `TokenLiquidityPoolsArgs`.
  - New path helpers in `apiPaths.ts`: `getTokenHoldersPath`, `getTokenLiquidityPoolsPath`.

  ## CLI (`@opensea/cli`)

  - `opensea tokens holders <chain> <address> [--limit] [--next] [--sort-by] [--sort-direction]`
  - `opensea tokens liquidity-pools <chain> <address> [--limit]`
  - SDK class additions: `OpenSeaCLI.tokens.holders(...)`, `OpenSeaCLI.tokens.liquidityPools(...)`.
  - New type re-exports: `TokenHoldersResponse`, `TokenLiquidityPoolsResponse`.

  ## Skill (`@opensea/skill`)

  - `tokens/opensea-token-holders.sh <chain> <address> [limit] [cursor] [sort_by] [sort_direction]`
  - `tokens/opensea-token-liquidity-pools.sh <chain> <address> [limit]`
  - Documentation: added rows to `SKILL.md` (Investigation Scripts) and `references/rest-api.md` (Tokens).

  Bumps consume `@opensea/api-types` 0.4.3 (released alongside, see the spec-sync PR for full schema details).

### Patch Changes

- Updated dependencies [96928f4]
- Updated dependencies [90702a7]
  - @opensea/api-types@0.4.3

## 1.8.0

### Minor Changes

- 0bc1053: Source `EventAsset`, `AssetEvent`, `Token`, `TokenDetails`, `TokenStats`, and `TokenSocials` from `@opensea/api-types` instead of hand-rolling them.

  ## What changed

  - `EventAsset` is now an alias for the api-types `Nft` schema. It gains `display_image_url`, `display_animation_url`, `original_image_url`, `original_animation_url`, and `traits` fields, and relaxes `name`, `description`, `image_url`, and `metadata_url` from required to optional (matching the OpenAPI spec — these are still present in every live response we probed).
  - `AssetEvent` is now `AssetEventsResponse["asset_events"][number]`, i.e. the `OrderEvent | SaleEvent | TransferEvent` union from the spec. Consumers can now narrow on `event_type` to access variant-specific fields (`seller`, `buyer`, `nft` on sales; `transfer_type`, `from_address`, `to_address` on transfers; `order_type`, `asset`, `maker`, `taker` on orders). The previous `[key: string]: unknown` index signature is gone; code that read arbitrary fields off an `AssetEvent` will need to narrow first or cast.
  - `Token`, `TokenDetails`, `TokenStats`, `TokenSocials` are now aliases for `TokenResponse`, `TokenDetailedResponse`, `TokenStatsResponse`, `TokenSocialsResponse`. Field shapes are identical except `TokenDetails` gains an optional `status` field (`"OK" | "WARNING" | "SPAM" | "LOW_LIQUIDITY"`) that the live API has been returning.
  - `ChainInfo` / `ChainListResponse` are now aliases for the api-types `ChainResponse` / `ChainListResponse`. Identical shape.
  - `TokenBalance` / `TokenBalancePaginatedResponse` are now aliases for the api-types `TokenBalanceResponse` / `TokenBalancePaginatedResponse`. `TokenBalance` gains optional `status`, `base_token_liquidity_usd`, and `quote_token_liquidity_usd` fields that the live API returns.
  - `SearchResultCollection` / `SearchResultToken` / `SearchResultNFT` / `SearchResultAccount` / `SearchResult` / `SearchResponse` are now aliases for api-types `CollectionSearchResponse` / `TokenSearchResponse` / `NftSearchResponse` / `AccountSearchResponse` / `SearchResultResponse` / `SearchResponse`. Field shapes match.
  - `SwapQuote` / `SwapTransaction` / `SwapQuoteResponse` are now aliases for api-types `SwapQuoteDetails` / `SwapTransactionResponse` / `SwapQuoteResponse`. `SwapQuote` gains optional `price_impact`, `swap_provider`, and required `costs` / `route_errors` fields.

  ## Migration

  Most consumers won't need any changes — the same snake_case fields are still there. Code that did `event.someArbitraryField` will need to narrow on `event_type` first:

  ```ts
  // Before
  const seller = event.seller as string;

  // After
  if (event.event_type === "sale") {
    const seller = event.seller; // typed as string
  }
  ```

- a10c5c0: Switch `--format toon` to server-side TOON encoding via `Accept: text/markdown` content negotiation. The client-side encoder (`src/toon.ts` and `formatToon`) is gone now that os2-core supports TOON encoding server-side. `--format toon` still works — it just triggers a `getAsMarkdown` call instead of running a 338-line encoder client-side.

  **Note:** `formatToon` is no longer exported from `@opensea/cli`. The CLI doesn't depend on `@opensea/sdk` directly (responses pass through `outputGet`'s generic JSON formatter), so the SDK 11.0 shape changes don't affect CLI output.

### Patch Changes

- Updated dependencies [fb03c09]
  - @opensea/api-types@0.4.2

## 1.7.0

### Minor Changes

- 051b558: Surface 22 new endpoints added in `@opensea/api-types` 0.4.0 as SDK methods and CLI commands.

  **`@opensea/sdk`** — new methods on `OpenSeaAPI` (and the underlying domain clients):

  - `getTokensBatch`, `getNFTsBatch`, `getCollectionsBatch` — batch lookups
  - `createListingActions` — ordered approval + Seaport-sign actions for new listings
  - `deployDropContract`, `getDeployContractReceipt` — drop contract deployment
  - `transferAssets` — build transactions to transfer NFTs or tokens
  - `getCollectionOfferAggregates`, `getCollectionHolders`, `getCollectionFloorPrices` — collection analytics
  - `getTokenPriceHistory`, `getTokenOhlcv`, `getTokenActivity` — token analytics
  - `getNFTOwners`, `getNFTAnalytics` — NFT analytics
  - `getPortfolioStats`, `getPortfolioHistory`, `getProfileOffers`, `getProfileOffersReceived`, `getProfileListings`, `getProfileFavorites`, `getProfileCollections` — account profile

  New internal `AssetsAPI` client; new request/response types re-exported through `@opensea/sdk` (from `@opensea/api-types`).

  **`@opensea/cli`** — new commands on the existing `accounts`, `collections`, `nfts`, `tokens`, `listings`, `drops` subcommands, plus a new `assets transfer` subcommand. SDK class methods mirroring the same surface added to `OpenSeaCLI`.

  No removed endpoints; pure additive release.

## 1.6.0

### Minor Changes

- 94dbf08: Sync downstream packages to the API surface introduced in `@opensea/api-types` 0.3.0 (os2-core#40171 + #40190): drop methods backed by removed endpoints, fix POST shapes, and surface the four new endpoints (`/listings/sweep`, `/offers/collection/{slug}/nfts/{identifier}`, `/swap/execute`, `/transactions/receipt`).

  ### `@opensea/sdk` — breaking

  **Removed methods** (the underlying GET endpoints were deleted; they would return 404 against the new API):

  - `OpenSeaAPI.getOrder` / `OrdersAPI.getOrder` — was already `@deprecated`. Use `getBestOffer` / `getBestListing` for "best" or `getAllOffers` / `getAllListings` for collection-wide results.
  - `OpenSeaAPI.getOrders` / `OrdersAPI.getOrders` — was already `@deprecated`. Use `getAllOffers` / `getAllListings`.
  - `OpenSeaAPI.postOrder` / `OrdersAPI.postOrder` — was already `@deprecated`. Use `postListing` / `postOffer`.
  - `OpenSeaAPI.getNFTOffers` / `OffersAPI.getNFTOffers` — replaced by `getOffersByNFT(slug, tokenId)` (new endpoint takes a collection slug, not contract address).
  - `OpenSeaAPI.getNFTListings` / `ListingsAPI.getNFTListings` — no per-NFT all-listings endpoint exists. Use `getBestListing(slug, tokenId)` for the best, or `getAllListings(slug)` and filter client-side.
  - Helpers `getOrdersAPIPath`, `serializeOrdersQueryOptions`, `deserializeOrder` — orphaned with the methods above.
  - Types `OrderAPIOptions`, `OrdersQueryOptions`, `OrdersQueryResponse`, `OrdersPostQueryResponse`, `ListingPostQueryResponse`, `OfferPostQueryResponse`, `SerializedOrderV2`, `GetOrdersResponse` — unused after the deletions.
  - Stats fields `IntervalStat.{volume_diff, volume_change, sales_diff, average_price}` and `Stats.{market_cap, average_price}` — server stopped returning them (always `0` previously).

  **Behavior changes:**

  - `OrdersAPI.postListing` and `OrdersAPI.postOffer` now read the bare `Listing` / `Offer` response (the upstream API dropped the legacy `order` wrapper field).
  - `OpenSeaSDK.createOffer` returns `Promise<Offer>` (was `Promise<OrderV2>`).
  - `OpenSeaSDK.createListing` returns `Promise<Listing>` (was `Promise<OrderV2>`).
  - `OpenSeaSDK.createBulkListings` returns `Promise<BulkOrderResult<Listing>>`; `createBulkOffers` returns `Promise<BulkOrderResult<Offer>>`. `BulkOrderResult` is now generic in the success type.

  **New methods:**

  - `OpenSeaAPI.getOffersByNFT(slug, identifier, limit?, next?)` — all offers for one NFT.
  - `OpenSeaAPI.sweepCollection(request)` — bulk-buy items from a collection, any payment token (incl. cross-chain).
  - `OpenSeaAPI.executeSwap(request)` — multi-asset swap; companion to `getSwapQuote`.
  - `OpenSeaAPI.getTransactionReceipt(request)` — fetch transaction status (sweep, swap, fulfillment).
  - New `TransactionsAPI` sub-client.

  ### `@opensea/cli` — additive (with one type re-export removed)

  - `OrdersResponse`, `SimpleAccount` re-exports removed from `src/types/api.ts` (schemas no longer exist).
  - `offers all` and `listings all` now accept `--maker <address>` to filter by order maker.
  - New commands:
    - `listings sweep` — bulk-buy items from a collection with any payment token.
    - `offers by-nft <collection> <token-id>` — all offers for a specific NFT.
    - `transactions receipt --request <file>` — fetch transaction receipt/status (request body via JSON file).
  - New SDK helpers: `OpenSeaCLI.transactions.receipt`, `SwapsAPI.executeMulti` (POST `/swap/execute`).

  ### `@opensea/skill` — docs refresh

  - `opensea-api/references/rest-api.md` — endpoint tables refreshed: removed deleted GET rows, added `?maker=` annotations, added `listings/sweep`, per-NFT offers, `swap/execute`, and `transactions/receipt` rows.
  - `opensea-marketplace/references/marketplace-api.md` — replaced "Get listings/offers for specific NFT" sections (which curled the removed endpoints) with the slug-based replacements.

### Patch Changes

- Updated dependencies [7a51fd0]
  - @opensea/api-types@0.3.0

## 1.5.0

### Minor Changes

- 9ecf704: Provider-aware wallet hardening across Privy, Turnkey, Fireblocks, and Bankr.

  **`@opensea/wallet-adapters`**

  - New `WalletInfo` discriminated union exported.
  - New optional `getWalletInfo()` method on `WalletAdapter` (implemented by all four managed providers).
  - Privy adapter: optional `PRIVY_AUTH_SIGNING_KEY` env var enables `privy-authorization-signature` header on `/rpc` requests via `@privy-io/node` (added as optional peer dependency), supporting the `owner_id` + `additional_signer` hardening pattern.
  - Privy adapter: `personal_sign` now sends `params.encoding` ("utf-8" / "hex") to satisfy Privy's RPC schema (was previously omitting this and getting 400s on owner-gated wallets).
  - Privy adapter: 401 errors with `Invalid app ID or app secret` body now include a `printf %s` hint for the `echo` vs `echo -n` debugging dead-end.
  - Top-of-file security-model docstrings on all four adapters declaring signing-only intent and forbidding mutation surfaces.

  **`@opensea/cli`**

  - New `opensea wallet` command group with three subcommands:
    - `wallet info` — provider-aware posture readout, hardening warnings to stderr, structured info to stdout.
    - `wallet create` — Privy-only, `POST /v1/wallets`. Optional `--owner-public-key` registers an `owner_id` at create time. Narrow mutation surface: creates new resources only.
    - `wallet generate-auth-key` — pure-local P-256 keypair generation, no API calls.

### Patch Changes

- Updated dependencies [9ecf704]
  - @opensea/wallet-adapters@0.3.0

## 1.4.2

### Patch Changes

- 16f4b7e: Re-export `BankrAdapter` and `BankrConfig` from `@opensea/wallet-adapters`. The `swaps execute` command description now lists Bankr alongside Privy, Turnkey, and Fireblocks. `createWalletFromEnv()` already auto-detects Bankr when `BANKR_API_KEY` is set; this just makes the named adapter directly importable from `@opensea/cli`.
- Updated dependencies [a81071b]
  - @opensea/wallet-adapters@0.2.0

## 1.4.1

### Patch Changes

- 961f2c5: fix(api): consume cross-chain fulfillment types from `@opensea/api-types`

  The cross-chain fulfillment types added in the previous release were hand-rolled in `packages/sdk/src/api/types.ts` and `packages/cli/src/types/api.ts` rather than generated from the OpenAPI spec. This release pulls them from `@opensea/api-types` (the source of truth) so future spec changes flow through automatically.

  **`@opensea/api-types`**: Adds named exports for `CrossChainFulfillmentRequest`, `CrossChainFulfillmentResponse`, `CrossChainPaymentToken`, `FulfillerObject`, and `ListingObject` schemas (regenerated from the production OpenAPI spec).

  **`@opensea/sdk`** _(type rename — minimal-impact since the prior release shipped <1 day ago)_:

  - `CrossChainListing` → `ListingObject`
  - `CrossChainFulfillmentDataRequest` → `CrossChainFulfillmentRequest`
  - `CrossChainFulfillmentDataResponse` → `CrossChainFulfillmentResponse`
  - `CrossChainTransaction` → `SwapTransactionResponse`

  The runtime call signature on `BaseOpenSeaSDK.getCrossChainFulfillmentData()` is unchanged.

  **`@opensea/cli`** _(type rename — same minimal impact)_:

  - `CrossChainFulfillmentTransaction` → `SwapTransactionResponse`
  - `CrossChainFulfillmentDataResponse` → `CrossChainFulfillmentResponse`

  Adds a new blocking CI check (`pnpm check-api-paths`) that fails when an `/api/v2/...` URL referenced in SDK or CLI source is not present in `packages/api-types/opensea-api.json`. AGENTS docs updated to make the api-types-first flow explicit for new endpoints.

- Updated dependencies [961f2c5]
  - @opensea/api-types@0.2.3

## 1.4.0

### Minor Changes

- fc44d9f: feat: add cross-chain fulfillment support

  Add support for the new `POST /api/v2/listings/cross_chain_fulfillment_data` endpoint across SDK, CLI, and skill packages.

  **SDK**: New `getCrossChainFulfillmentData()` method on both the API client and the base SDK class. Accepts listings, fulfiller, payment token (chain + address), and optional recipient. Returns ordered transactions to sign and submit.

  **CLI**: New `listings cross-chain-fulfill` subcommand with `--hashes`, `--listing-chain`, `--protocol-address`, `--fulfiller`, `--payment-chain`, `--payment-token`, and optional `--recipient` flags. Supports sweeping multiple listings via comma-separated hashes.

  **Skill**: New `opensea-cross-chain-fulfill.sh` script and updated SKILL.md with cross-chain buying workflow documentation.

## 1.3.0

### Minor Changes

- d247639: Replace duplicated wallet adapter implementations with `@opensea/wallet-adapters` package. All adapter code (Privy, Turnkey, Fireblocks, PrivateKey) now comes from the shared package, reducing ~1200 lines of duplicated code. The CLI re-exports all wallet types and adapters from `@opensea/wallet-adapters` alongside the CLI-specific chain resolution utilities (`CHAIN_IDS`, `resolveChainId`).

### Patch Changes

- 4a76bc1: Add `--traits <json>` flag to `nfts list-by-collection`, `listings best`, and `events by-collection` for server-side trait filtering. Accepts a JSON-encoded array of `{ traitType, value }` filters; multiple entries are AND-combined. Programmatic SDK methods (`client.nfts.listByCollection`, `client.listings.best`, `client.events.byCollection`) accept a structured `TraitFilter[]` array.

## 1.2.0

### Minor Changes

- bc9c6ce: Add token-groups and instant API key endpoints.

  **SDK**:

  - `sdk.api.getTokenGroups({ limit?, cursor? })` and `sdk.api.getTokenGroup(slug)` for the new `/api/v2/token-groups` endpoints.
  - `OpenSeaSDK.requestInstantApiKey()` and `OpenSeaAPI.requestInstantApiKey()` — static methods that call `POST /api/v2/auth/keys` without authentication and return a free-tier key you can pass into the SDK constructor. Rate limited to 3 keys/hour per IP; keys expire after 30 days.
  - `OpenSeaAPI` class is now exported from the package root (`@opensea/sdk` and `@opensea/sdk/viem`).

  **CLI**:

  - New `opensea token-groups list` and `opensea token-groups get <slug>` commands.
  - New `opensea auth request-key` command — works without `--api-key` / `OPENSEA_API_KEY` since the endpoint is unauthenticated.

### Patch Changes

- Updated dependencies [5b6ba13]
  - @opensea/api-types@0.2.1

## 1.1.0

### Minor Changes

- 497b636: Add missing API wrapper methods for full OpenAPI spec coverage:
  - `getNFTCollection()` — get the collection an NFT belongs to
  - `getNFTMetadata()` — get raw NFT metadata (name, description, image, traits)
  - Expose `fulfillPrivateOrder()` as a public method on `OpenSeaSDK`

## 1.0.1

### Patch Changes

- 6bb30d7: Fix `--version` to report correct version; auto-convert decimal quantities in swap commands

## 1.0.0

### Minor Changes

- b3a5e84: Add drops endpoints, trending/top collections, and account resolve

  - api-types: Sync OpenAPI spec with 6 new endpoints and 8 new schemas (drops, trending/top collections, account resolve)
  - SDK: New DropsAPI class, extended CollectionsAPI and AccountsAPI with new methods
  - CLI: New `drops` command, `collections trending/top` subcommands, `accounts resolve` subcommand

### Patch Changes

- f82c035: Replace hardcoded chain ID maps with codegen from OpenSea REST API

  - SDK: Fix Blast chain ID from 238 (testnet) to 81457 (mainnet)
  - CLI: Add chains previously only in SDK (b3, flow, ronin, etc.)
  - CLI: Remove `bsc`, `sepolia`, `base_sepolia`, `monad_testnet` from `CHAIN_IDS` — these are not in the OpenSea API
  - Add `pnpm sync-chains` codegen script (fetches GET /api/v2/chains as source of truth)

- Updated dependencies [b3a5e84]
  - @opensea/api-types@0.2.0
