# @opensea/cli

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
