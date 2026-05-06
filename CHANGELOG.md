# @opensea/cli

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
