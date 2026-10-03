# @opensea/cli

## 2.11.1

### Patch Changes

- 731e93d: Docs: the SDK guide's exports table no longer points at the internal `types/api.ts` path.
- Updated dependencies [731e93d]
- Updated dependencies [75baa66]
  - @opensea/sdk@12.11.2

## 2.11.0

### Minor Changes

- a39e5b9: Add collection page commands: `collections get-metadata` (the saved page in the `update-metadata` body shape, with its preview URL), `upload-page-media` (an image or MP4 video for a page placement; with `--file` it uploads and prints the token), `set-pricing-currency --stablecoin`, `creator-fee-enforcement`, `set-creator-fee-enforcement --enabled` (with `--send`, signs the returned transactions in order from the owner wallet) and `refresh`. Add `drops items` to list a drop's saved items, a draft's included. `CollectionsAPI` is now exported, with `pageMetadata`, `createPageMediaUpload`, `setPricingCurrency`, `creatorFeeEnforcement`, `buildCreatorFeeEnforcementTransactions`, `sendTransactions` and `refresh`, and `DropsAPI` gains `items`.

## 2.10.0

### Minor Changes

- 07d0bdc: Add `opensea drops upload-items <slug> <dir> [--manifest <path>] [--concurrency <n>]`, which uploads a folder of item media and saves it as the drop's items in one upload batch: it generates one batch id, requests upload contexts 50 files at a time with it, uploads each chunk, then saves the batch by filename. Without a manifest, items are numbered in natural filename order (`2.png` before `10.png`); hidden files, subfolders and `.csv` files are skipped, and a symlink in the folder is refused rather than followed. Add `opensea drops save-item-media-batch <slug>` (`--body <path>`, or `--upload-batch-id <uuid> --dir <path>` to re-save a folder that is already uploaded) and `create-item-media-upload --upload-batch-id <uuid>`. `save-item-media`, which saves by media token, is deprecated.

  The programmatic `DropsAPI` gains `createItemMediaUpload`, `saveItemMediaBatch` and `uploadItemMedia(slug, files, options)`, the helper behind `upload-items`. Each file's `data` can be a function so a large drop is read one file at a time.

### Patch Changes

- Updated dependencies [bab8feb]
- Updated dependencies [07d0bdc]
- Updated dependencies [07d0bdc]
  - @opensea/api-types@0.15.0
  - @opensea/sdk@12.11.0

## 2.9.1

### Patch Changes

- c5aada3: `events list` no longer accepts a chain filter. `GET /api/v2/events` has no `chain` parameter and returns events from every chain whatever is sent, so the flag never filtered anything. `opensea events list --chain <chain>` and `opensea --chain <chain> events list` now exit with an error that points to `events by-account <address> --chain <chain>` and `events by-nft <chain> <contract> <token-id>`, which do filter by chain. The programmatic `EventsAPI.list` stops sending `chain`, and its `chain` option is deprecated.

  Correction to 2.9.0: its notes list `events list` among the commands whose `--chain` filter was restored. That filter never applied on this endpoint; only `collections list` and `events by-account` filter by chain.

- f5676f0: `opensea tokens holders` now describes the distribution it returns: total holders, the share of eligible supply held by the top 250, and a health score and label.
- Updated dependencies [6ffe0c9]
- Updated dependencies [e7882a8]
- Updated dependencies [a1e4356]
- Updated dependencies [f5676f0]
  - @opensea/api-types@0.14.2
  - @opensea/sdk@12.10.2

## 2.9.0

### Minor Changes

- 3cd23af: Fix subcommand `--chain` options, which the program-level `--chain` swallowed. `drops deploy` and `accounts token-transfers` always failed with "required option '--chain <chain>' not specified", and the `--chain` filter on `collections list`, `events list` and `events by-account` was silently dropped. A `--chain` you pass now reaches the subcommand wherever it sits on the line. The program's `ethereum` default is never used as a filter or a required chain, so `drops deploy` without `--chain` still fails rather than targeting ethereum. One behavior change follows from this: `opensea --chain base collections list` now filters by base, where before the flag was ignored.

  Add `drops deploy --send [--wallet-provider <provider>]`, which signs and sends the deploy transaction from the `--sender` wallet (and refuses any other wallet), then prints the hash and chain for `drops deploy-receipt`. Add `drops deploy-receipt --wait [--interval <seconds>] [--wait-timeout <seconds>]`, which polls until the receipt has a collection slug or a `failed` status and exits 1 on failure or timeout. The SDK gains `DropsAPI.sendDeployTransaction` and `DropsAPI.waitForDeployReceipt`.

  Add `drops mint --send [--wallet-provider <provider>]`. Any EVM wallet can send the mint; the output names both the sending wallet and `--minter`.

  Refresh an expired stored wallet auth token automatically, and retry once when a request made with it returns 401, printing a one-line notice to stderr. Tokens passed with `--auth-token` or `OPENSEA_AUTH_TOKEN` are never refreshed, the refresh token is only sent unprompted to OpenSea's own servers (not to a `--base-url` or `--auth-base-url` override), and the new `--no-auth-refresh` global flag turns the behavior off. When the server refuses the refresh token, `auth refresh` and the automatic refresh now fail with `TokenRefreshError` (exit 2) and name the login command to run, instead of printing the raw response body. The drop wait helpers (`waitForDeployReceipt`, `waitForMetadataIpfs`) now reject a non-positive or non-finite `intervalMs` and a negative `timeoutMs`.

## 2.8.1

### Patch Changes

- Updated dependencies [3f93447]
  - @opensea/api-types@0.14.0
  - @opensea/sdk@12.10.1

## 2.8.0

### Minor Changes

- fce0d1d: Add drop publish commands: `opensea drops publish <slug>` and `opensea drops unpublish <slug>` print the transaction, and with `--send` sign and send it with the configured EVM wallet after checking that the wallet is the transaction's `from` (the contract's onchain owner). `drops upload-metadata-ipfs <slug> [--wait]` starts the IPFS upload and can poll it to completion, `drops metadata-ipfs-status` reads its progress, `drops create-manifest-upload` requests a manifest CSV upload, and `drops upload-file --context <path|-> --file <path> [--index <n>]` performs the storage upload an upload context describes and prints its token. The programmatic `DropsAPI` gains the matching methods, and `uploadToContext` is exported for reuse.

  API errors whose body is `{"errors": [...]}` now print the joined errors as `message` and keep the raw body under `response_body`. HTTP 401 now exits with code 2 (auth error) instead of 1, and 401 and 403 errors include a `hint`. Scripts that treated every API failure as exit code 1 should also handle 2 for an expired or missing token.

### Patch Changes

- Updated dependencies [fce0d1d]
  - @opensea/sdk@12.10.0

## 2.7.1

### Patch Changes

- Updated dependencies [7d51b1f]
- Updated dependencies [7d51b1f]
  - @opensea/api-types@0.13.0
  - @opensea/sdk@12.9.2

## 2.7.0

### Minor Changes

- 931433c: Reject numeric option values that are not entirely numeric. `--limit 10foo`, `--limit 1.9`, `--limit 1e2`, `--limit 0x10`, and `--slippage 0.01%` used to be truncated to their numeric prefix and now fail with an "Invalid value" error. Integer options also reject values above `Number.MAX_SAFE_INTEGER`, and float options reject values that overflow to `Infinity`.

## 2.6.1

### Patch Changes

- cd6e615: Support Arc: offers use the 6-decimal USDC native mirror (0x3600…0000), listings use native USDC, approvals use the OS Ledger conduit. Native (0x0) offer currencies advertised by the API are normalized to the mirror.
- Updated dependencies [cd6e615]
- Updated dependencies [0c24b3e]
- Updated dependencies [fbbbea4]
- Updated dependencies [cd6e615]
  - @opensea/sdk@12.9.0
  - @opensea/api-types@0.12.0

## 2.6.0

### Minor Changes

- d198f6d: `opensea whoami` now reports every wallet the stored token resolves to, not just
  one address. The new `linked_wallets` block reads the token's `linked_wallets`
  claim through the SDK's `extractLinkedWallets`, lists the wallets it names, and
  marks the token's own with `primary: true`. The claim already contains that
  wallet, so it is marked in place rather than appended, which would double count
  it.

  A count that is not known is never printed as an empty list. `status` is
  `listed` or `empty` when the claim was read, and `claim_absent`,
  `claim_unreadable` or `token_unreadable` when it was not, each with a message
  and no `count`. A token minted without the claim is therefore distinguishable
  from an account that genuinely has one wallet, which is what a client needs
  before it treats a portfolio total as complete.

  The command's private JWT parser is gone; it now uses the SDK's exported
  `tryDecodeJwtPayload`, so the CLI and SDK share one decoder. One side effect:
  under `--diagnostic`, `jwt_error` now reads "Access token is not a readable JWT"
  instead of the parser's own "Not a JWT" text, and that block also shows the raw
  `linked_wallets` claim.

### Patch Changes

- Updated dependencies [06dcdc3]
  - @opensea/sdk@12.8.0

## 2.5.0

### Minor Changes

- 13db5ef: Expose `include_auto_hidden` on the NFTs-by-account endpoint.

  `GET /api/v2/chain/{chain}/account/{address}/nfts` leaves out NFTs the system hid on its own, which is how airdropped and unsolicited items stay out of a wallet's default view. The spec documents `include_auto_hidden` for callers that want them back, and until now neither package could send it.

  In the SDK, `nfts.getNFTsByAccount` takes a trailing options object: `getNFTsByAccount(address, limit?, next?, chain?, { includeAutoHidden })`. The four positional arguments are unchanged, so existing calls compile and behave as before, and the next filter this endpoint gains goes in the same object instead of becoming a sixth positional argument. The fetcher rewrites the key to `include_auto_hidden`, and a caller who sets nothing sends nothing, which leaves the server default of false in place. The deprecated `api.getNFTsByAccount` passthrough forwards the options too.

  In the CLI, `opensea nfts list-by-account` gains `--include-auto-hidden`, and the programmatic `nfts.listByAccount` gains a matching `includeAutoHidden` option.

  The flag moves only the automatic hiding. NFTs the account holder hid themselves are still not returned, and it does not surface NFTs removed for policy violations.

### Patch Changes

- f73ee96: `opensea auth request-key` now sends the CLI's own `User-Agent`, aborts at `--timeout` instead of hanging, and logs its request under `--verbose`. Output is unchanged: the command still prints the API's raw snake_case body.

  This is the one command that issues its own request rather than going through `OpenSeaClient`, because the endpoint is unauthenticated and `getClient()` exits when no API key is set. That bypass also skipped the client's identity header, its timeout and its verbose logging, so a hung connection hung the CLI indefinitely and CLI-minted keys reached the API as an unidentified request. The endpoint does record `User-Agent`, so that is the header worth sending.

  It still does not call `OpenSeaAPI.requestInstantApiKey` from `@opensea/sdk`. That helper camelizes its response while every other command here prints the raw wire body, so routing this one through it would rename `api_key` to `apiKey` for anyone piping `--format json` into a script, and it hardcodes `x-app-id: opensea-js`, which would attribute CLI traffic to the SDK. The reasoning is now a comment on the command so it does not get re-litigated.

- Updated dependencies [13db5ef]
- Updated dependencies [a2e2cfa]
- Updated dependencies [8783ee4]
- Updated dependencies [e1f390c]
  - @opensea/sdk@12.7.0
  - @opensea/api-types@0.11.1

## 2.4.2

### Patch Changes

- d8f6d6f: Bound and validate the `Retry-After` header in the CLI's retry path. The client now honors only a positive integer count of seconds or an HTTP-date in the future, and waits at most 300 seconds regardless of what the header asks for. Anything else, including fractional values such as `1.5`, values carrying a unit such as `5s`, zero, negatives and dates already in the past, is discarded and the client falls back to its own exponential backoff.

  The old parser passed the header through `Number()` and multiplied by 1000 with no validation and no ceiling, so a server answering `retry-after: 999999` put the CLI to sleep for 11.5 days with no output. Past roughly 24.8 days the millisecond value stopped fitting in a 32-bit signed integer, so `setTimeout` truncated it to 1ms and the retry fired immediately with no backoff at all. Both shapes are reachable from a misconfigured proxy, not only a hostile one.

  The 300 second ceiling and the accept/reject rules match `_parseRetryAfter` in `@opensea/sdk`, which already validated and capped the same header. That parser is private to the SDK and takes a `Response` rather than a header string, so the CLI keeps its own copy and both carry a comment pointing at the other.

  Callers that relied on a fractional or unit-suffixed `Retry-After` being honored will now see the configured backoff instead. Retries are off by default (`--max-retries` defaults to 0), so this only affects runs that opted into retrying.

- Updated dependencies [3a2ff37]
- Updated dependencies [71e1597]
- Updated dependencies [8ea9187]
- Updated dependencies [12f1376]
- Updated dependencies [77206d0]
- Updated dependencies [3271b5b]
- Updated dependencies [bd4aa58]
  - @opensea/api-types@0.11.0
  - @opensea/sdk@12.6.0
  - @opensea/wallet-adapters@1.2.1

## 2.4.1

### Patch Changes

- Updated dependencies [3bca418]
- Updated dependencies [0dddb2e]
- Updated dependencies [4c8b9ab]
  - @opensea/api-types@0.10.0
  - @opensea/wallet-adapters@1.2.0
  - @opensea/sdk@12.5.0

## 2.4.0

### Minor Changes

- c33ddc3: Add `PrivySvmAdapter`, a Solana implementation of `SvmWalletAdapter`.

  Signs through Privy's `/v1/wallets/{id}/rpc`: `signTransaction` to sign without broadcasting,
  `signAndSendTransaction` to sign and submit, and `signMessage`. Privy's SVM RPCs accept only
  `encoding: "base64"`, so a `Uint8Array` request is converted here rather than passed through, and
  the signed result comes back base64 already, which is what `SvmSignedTransaction` promises.
  `sendTransaction` defaults `caip2` to Solana mainnet, since that RPC requires a cluster while
  sign-only ignores one.

  Request bodies are pinned to the types `@privy-io/node` publishes, derived from Privy's own RPC
  input union and discriminated by the same `method` string the adapter sends, so a field they rename
  fails `type-check` rather than failing as a 4xx.

  `createWalletFromEnv`, `createWalletForProvider` and `detectProvider` take an optional
  `{ chainType }` selector, defaulting to `"evm"` so existing callers are unchanged. A Privy wallet is
  bound to one `chain_type`, so the Solana wallet is a separate wallet with its own id, read from
  `PRIVY_SVM_WALLET_ID`. Both chains can be configured at once, and asking for one while only the
  other is configured says so and names the variable to set.

  `PrivyAdapter` and `PrivySvmAdapter` now share `PrivyTransport` for credentials, the
  authorization-signature header and the RPC envelope, rather than keeping two copies that drift.
  No EVM behavior changes.

  Not yet exercised against a live Privy wallet. Every shape here is checked against their published
  types, and the adapter is unit tested against a stubbed transport, but no real Solana transaction
  has been signed or landed.

- 6af806a: Make `WalletAdapter` chain-generic so non-EVM wallets can implement it.

  `WalletAdapter` is now a union discriminated on `chainType`, with `EvmWalletAdapter` and `SvmWalletAdapter` members over a shared `BaseWalletAdapter`. EVM and SVM share no transaction shape, address format or signing scheme, so a single interface covering both would be a pile of optional methods where half are always absent. Narrow with the exported `isEvmAdapter` / `isSvmAdapter` guards.

  `TransactionRequest` is renamed `EvmTransactionRequest`, with the old name kept as an alias. New `SvmTransactionRequest` and `SvmSignedTransaction` carry a serialized transaction rather than `to`/`data`/`value`, since a Solana transaction is instructions over accounts with no single recipient. `SvmWalletAdapter` requires `signTransaction` and leaves `sendTransaction` optional, the reverse of EVM: sign-only providers are ordinary on Solana, where a fee payer co-signs or the caller broadcasts with its own commitment policy.

  The ethers and viem bridges now take `EvmWalletAdapter`, since both are EVM clients. Flows that are EVM-only in substance say so at the type level rather than failing later on a missing method: x402 settlement (EIP-3009), `swaps.execute`, and the `auth`/`smoke` commands that sign EIP-712. Each rejects a Solana wallet with a message naming the reason.

  `requireEvmAdapter(adapter, purpose)` and `WrongChainTypeError` are exported for the four EVM-only flows, so they share one check and one message instead of four hand-written copies that drift.

  `SvmWalletAdapter.capabilities` is typed as the new exported `SvmWalletCapabilities`, which pins `signTypedData` to the literal `false`. EIP-712 is an Ethereum scheme and `SvmWalletAdapter` declares no `signTypedData` method, so an SVM adapter claiming that capability would advertise an operation no consumer could call.

  No adapter behavior changes. The five existing providers declare `chainType: "evm"` and are otherwise untouched.

### Patch Changes

- Updated dependencies [6af806a]
- Updated dependencies [c33ddc3]
- Updated dependencies [a35490c]
- Updated dependencies [e77bf9b]
- Updated dependencies [a2d06b9]
- Updated dependencies [a278c53]
- Updated dependencies [6af806a]
  - @opensea/wallet-adapters@1.0.0
  - @opensea/sdk@12.4.0

## 2.3.0

### Minor Changes

- 3075f59: Add `tools.reportUsage()` for `POST /api/v2/tools/usage`, the one `/api/v2/tools` operation the client did not cover. Metrics only: the response reports whether the usage record was verified.

### Patch Changes

- Updated dependencies [d9df0e2]
- Updated dependencies [3075f59]
  - @opensea/sdk@12.3.0

## 2.2.0

### Minor Changes

- b68b01e: Add typed order-action APIs for creating offers, fulfilling listings and offers, and cancelling orders across EVM chains and Solana.

### Patch Changes

- Updated dependencies [b68b01e]
  - @opensea/sdk@12.1.0

## 2.1.0

### Minor Changes

- bbbbfea: CLI: the `agent` commands now take a username or ENS name anywhere they took an address, and the owner's side of the handshake gets its own verbs.

  `opensea agent add`, `accept`, and `remove` are `propose`, `confirm`, and `revoke` with `--role OWNER` fixed. Asking an account to become your agent is the direction most people are in, and it previously required knowing that `--role` describes your own side, not the counterparty's. The three generic verbs keep `--role` and are unchanged, so an agent program holding a scoped token still has the agent-initiated path.

  `add`, `accept`, `remove`, `propose`, `confirm`, and `revoke` all accept an OpenSea username, an ENS name, or a wallet address. The API's `counterparty_address` field takes an address literally and answers a username with 400 "Invalid counterparty address", so the CLI resolves the identifier through `/api/v2/accounts/resolve` before writing. An address short-circuits, so the common case costs no extra request, and an identifier that resolves to nothing fails before any write is attempted.

  Nothing is removed and no existing invocation changes behavior.

### Patch Changes

- c7342f6: `login`: validate the authorization URL and open it by argv on Windows instead of through `cmd /c start`. The URL is built on the `authorization_endpoint` the SDK reads from the authorization server's OIDC discovery response, so it is not a literal. `spawn` quotes arguments by the C runtime rules and cmd.exe does not parse its command line by those rules, so the hand-added quotes ended early and anything after the next `&` was parsed by cmd as a separate command. The URL is now parsed and re-serialized before it becomes a process argument, which also rejects a `file:`/`javascript:` URL and a bare word that the platform opener would read as one of its own flags.
- Updated dependencies [bbbbfea]
- Updated dependencies [34d3a50]
- Updated dependencies [34d3a50]
- Updated dependencies [f1882a8]
- Updated dependencies [3cc8640]
- Updated dependencies [ea967e2]
- Updated dependencies [93f028c]
  - @opensea/sdk@12.0.1
  - @opensea/wallet-adapters@0.3.5

## 2.0.0

### Major Changes

- 75aa2c2: **Breaking:** removes the retired wallet-level agent designation.

  SDK: `WalletAuthAPI.markWalletAsAgent` and `WalletAuthAPI.removeWalletAgentDesignation` are gone. CLI: `opensea accounts mark-agent` and `opensea accounts remove-agent`, along with `client.accounts.markAgent` and `client.accounts.removeAgent` on `OpenSeaCLI`.

  The endpoints they called, `PUT` and `DELETE /api/v2/accounts/wallets/{wallet}/agent`, no longer exist. os2-core removed them in ProjectOpenSea/os2-core#52946: over the 7 days before that, every `PUT` was rejected with 403 by a kill switch and no wallet's agent flag changed at all. Keeping the methods would mean shipping calls that 404.

  An agent is an account, not a flag on a wallet. Use `declareAgentAccount`, `withdrawAgentAccountDeclaration`, and the `proposeAgentRelationship` / `confirmAgentRelationship` / `revokeAgentRelationship` handshake, or the `opensea agent` command group. Both are unchanged by this release.

  `WalletAgentStatusResponse` is no longer re-exported from the CLI's `types/api`, since the schema goes away with the next spec sync.

### Minor Changes

- 6c0ee99: Add SDK and CLI support for agent accounts, so an agent can declare itself and complete the ownership handshake without hand-rolling HTTP.

  An agent is an account, not a flag on a wallet. Ownership is a relationship between two accounts, mutually confirmed. It is a declaration, not an authorization: naming an account as your agent grants it no ability to act for you. It is self-reported and OpenSea does not verify it. An agent can have no owner at all, and at most one confirmed owner. Either side may withdraw or revoke at any time, which deletes the relationship. Only confirmed relationships are public.

  SDK, on `WalletAuthAPI`: `declareAgentAccount`, `withdrawAgentAccountDeclaration`, `proposeAgentRelationship`, `confirmAgentRelationship`, `revokeAgentRelationship`, and `listOwnAgentRelationships`. `AccountsAPI.getAgentProfileRelationships` already covered the public read.

  CLI, a new `agent` group: `declare`, `withdraw`, `propose`, `confirm`, `revoke`, `list`, and `profile`, plus a matching `client.agent` namespace on `OpenSeaCLI`.

  The scopes differ, which is easy to get wrong. Every write takes `write:wallets` but listing your own relationships takes `read:wallets`, so a client driving the whole handshake must request both or the list call returns 403. `read:wallets` is now in `OPENSEA_SCOPES`, so the default OAuth grant carries it.

  The OpenAPI snapshot is refreshed to generate all of this. That also picks up `read:wallets` in `AuthScope`, which was already live in the scope registry but missing from the committed snapshot, so `scripts/check-auth-scope-drift.mjs` was failing on main beforehand.

  `AgentProfileRelationshipsResponse` no longer surfaces `agent_owner_profile` or `public_agent_wallets`. Both read the retired wallet-level designation, are permanently null and empty, and are removed by os2-core AGE-51. Read `agentOwner` and `agents` instead.

  `markWalletAsAgent` and `removeWalletAgentDesignation` are deprecated. They set a flag on a wallet rather than declaring an account, and the server now rejects new designations; only the removal still works, so an account that set the old flag can clear it.

### Patch Changes

- ddadb41: Replace five hand-rolled API types with the generated ones from `@opensea/api-types`.

  `packages/cli/AGENTS.md` and `packages/api-types/AGENTS.md` both say never to hand-roll API request or response types, but these five predate the rule and duplicated schemas the spec already covered.

  In the SDK: `GetChainsResponse` becomes `Camelize<ChainListResponse>`, `DropMintRequest` and `DropMintResponse` become `Camelize<>` of the identically named generated schemas, `ResolveAccountResponse` becomes `Camelize<AccountResolveResponse>`, and `ValidateMetadataResponse` becomes `Camelize<>` of the generated schema, which decomposes into `ValidateMetadataAssetIdentifier`, `ValidateMetadataDetails`, `ValidateMetadataAttribute` and `MetadataIngestionError`. In the CLI: `ValidateMetadataResponse` becomes a `Schemas[...]` re-export, the one declared violation in a file that is otherwise all re-exports.

  No shape change. Each replacement was diffed field by field against the spec, including required and optional, and they match exactly, so this is types-only with no runtime or behavioral effect. Four of the five were already correct re-exports in the CLI and hand-rolled only in the SDK, so the two packages had disagreed about the same names.

- ad6de0c: `type-check` now covers this package's `test/` directory, through a `tsconfig.check.json` matching the one sdk and api-types already use. It previously compiled `src/` only, so nothing typechecked its test files.

  That gap hid real breakage, because vitest erases types rather than resolving them. `cli/test/sdk-swaps.test.ts` imported `WalletAdapter` from `../src/wallet/adapter.js`, a module that does not exist, and the suite passed. Repointing it at the module that does export the type then surfaced a second error the first had masked: the test's fake wallet omits `capabilities`, which `WalletAdapter` requires. Both fixed, plus two `fetch` spies typed as bare `ReturnType<typeof vi.spyOn>`, which discards the signature.

  The tool-sdk and wallet-adapters halves of the same change are split into their own changesets, since
  both packages are held out of this release.

- Updated dependencies [6c0ee99]
- Updated dependencies [75aa2c2]
- Updated dependencies [ddadb41]
- Updated dependencies [cfbb465]
- Updated dependencies [6e77b5e]
- Updated dependencies [f74c0be]
- Updated dependencies [5fdac00]
  - @opensea/sdk@12.0.0
  - @opensea/api-types@0.8.10

## 1.18.0

### Minor Changes

- 152e3cf: Honor `OPENSEA_CONFIG_DIR` as an override for the auth store location, which defaults to `~/.opensea` as before. Useful for containers with a mounted volume, CI jobs that should not read or write a shared home directory, and holding a second set of credentials separately.

  This also isolates the CLI's own test suite, which until now read the developer's real `~/.opensea/auth.json`: `auth status` asserting `not_authenticated` failed with `expired` on any machine that had ever run `opensea login`, and reproduced for nobody who had not.

### Patch Changes

- Updated dependencies [59f9799]
- Updated dependencies [c5e2906]
  - @opensea/sdk@11.8.0

## 1.17.2

### Patch Changes

- b7a4c68: Remove the `--collection-slug` flag from `profile set-nft-pfp`. The backend now derives the collection slug from the resolved NFT instead of trusting a client-supplied value, so the CLI no longer needs to collect or send it.
- Updated dependencies [4dd7c67]
- Updated dependencies [280acf2]
- Updated dependencies [d88963f]
  - @opensea/sdk@11.7.3
  - @opensea/api-types@0.8.8

## 1.17.1

### Patch Changes

- 0031eed: Add SDK and CLI support for wallet visibility and agent profile relationships

  - `@opensea/sdk`: add `WalletAuthAPI.makeWalletPrivate`, `WalletAuthAPI.makeWalletPublic`, and `WalletAuthAPI.getAgentProfileRelationships`.
  - `@opensea/sdk`: export `WalletVisibilityResponse`, `AgentProfileRelationshipsResponse`, `SvmInstructionAccountResponse`, `SvmInstructionResponse`, and `SvmTransactionDetailsResponse` types.
  - `@opensea/cli`: add `accounts make-private`, `accounts make-public`, and `accounts agent-relationships` commands.
  - `@opensea/cli`: export the new wallet visibility, agent relationship, and SVM transaction detail types.

- 7d2dbef: Sync OpenAPI spec: add `stablechain` to `ChainIdentifier`, add `Chain.StableChain` (chain id 988) to the SDK and generated chain maps
- Updated dependencies [0031eed]
- Updated dependencies [7d2dbef]
- Updated dependencies [8b7ddd2]
- Updated dependencies [0031eed]
- Updated dependencies [f67fbc6]
  - @opensea/sdk@11.7.1
  - @opensea/api-types@0.8.7
  - @opensea/wallet-adapters@0.3.4

## 1.17.0

### Minor Changes

- a093a89: Add first-class SDK and CLI access to materialized token activity stats, with typed window selection and response models.

### Patch Changes

- 954d547: Add typed account agent status fields and helpers to mark or clear registered
  agent wallets from the SDK and CLI.
- Updated dependencies [954d547]
- Updated dependencies [a093a89]
  - @opensea/api-types@0.8.6
  - @opensea/sdk@11.7.0

## 1.16.0

### Minor Changes

- cba26dd: Add typed SDK and CLI support for building cross-chain drop mint transactions and polling the returned receipt request.

### Patch Changes

- Updated dependencies [cba26dd]
  - @opensea/api-types@0.8.4
  - @opensea/sdk@11.6.0

## 1.15.1

### Patch Changes

- 99a5a9e: Add CLI commands for the remaining public scoped-token endpoints: social follow/watch and relationship/followers/following, watchlist add/remove and token/perpetual watchlist reads, order cancellation, wallet unlink, profile writes (settings, username, image upload, NFT PFP set/clear, shelves), drop editing (edits, allowlist, prereveal/self-mint items, item media), and collection editing (modify, metadata, visibility, image upload).
- Updated dependencies [8df1f43]
- Updated dependencies [14fcba5]
  - @opensea/sdk@11.5.1

## 1.15.0

### Minor Changes

- bf5874d: Add `opensea tokens account-activity` to query fungible token activity (transfers, swaps, wraps, unwraps) for an account via `GET /api/v2/account/{address}/token-activity`, and `opensea tools activity` to view payment/usage activity for a registered tool via `GET /api/v2/tools/{registry_chain}/{registry_addr}/{tool_id}/activity`.
- bf5874d: Add `opensea tools saved` subcommands for listing, saving, and removing saved tools via the wallet-authenticated `GET/POST/DELETE /api/v2/saved-tools` endpoints.

### Patch Changes

- 9bc9708: Require explicit scopes for private-key CLI login, and add typed SDK helpers for the wallet-authenticated social and saved-tools REST endpoints.
- Updated dependencies [bf5874d]
- Updated dependencies [bf5874d]
- Updated dependencies [9bc9708]
  - @opensea/sdk@11.5.0

## 1.14.1

### Patch Changes

- 06e96e1: Use the current SIWE session, scoped-token creation, token-exchange, session refresh, and session-only revocation endpoints in the SDK and CLI.
- Updated dependencies [06e96e1]
- Updated dependencies [feb1446]
  - @opensea/sdk@11.4.9
  - @opensea/api-types@0.8.2

## 1.14.0

### Minor Changes

- 66396b6: Add `--private-key` support to `opensea login` for SIWE authentication, enabling server-side agents to log in without a browser.

### Patch Changes

- Updated dependencies [66396b6]
- Updated dependencies [fa2a24e]
- Updated dependencies [333104e]
- Updated dependencies [d7a44df]
  - @opensea/api-types@0.8.1
  - @opensea/sdk@11.4.8

## 1.13.2

### Patch Changes

- a410930: Request Zitadel's role-specific scopes so OAuth tokens are limited to the OpenSea scopes the client asked for.
- Updated dependencies [a410930]
  - @opensea/sdk@11.4.6

## 1.13.1

### Patch Changes

- e325f04: Keep the requested OAuth scopes in the auth store so `whoami` can report broader grants, and fix `auth link-wallet` to preserve wallet-adapter method binding and accept `OPENSEA_PRIVATE_KEY`.

## 1.13.0

### Minor Changes

- d10626b: Add an `opensea whoami` command that displays the current wallet identity,
  scope source, and expiry, with unverified JWT diagnostics available through an
  explicit flag. Expose whether OAuth scopes came from the authorization-server
  response or a JWT fallback.

### Patch Changes

- Updated dependencies [d10626b]
  - @opensea/sdk@11.4.5

## 1.12.5

### Patch Changes

- d846160: Use the current OpenSea API endpoints for SIWE login, scoped-token exchange, refresh, revocation, and wallet-link nonces.
- da5181f: Repair the auth directory and auth file permissions whenever the CLI saves credentials. Existing files created with broader permissions are now restricted to the owning user instead of keeping their old mode.
- Updated dependencies [d846160]
  - @opensea/sdk@11.4.4

## 1.12.4

### Patch Changes

- b64a4d5: Require complete OAuth wallet sessions, retain refresh tokens during rotation, validate the CLI auth store, and preserve case-sensitive wallet addresses.
- Updated dependencies [b64a4d5]
  - @opensea/sdk@11.4.3

## 1.12.3

### Patch Changes

- 3fba2be: Add `opensea drops eligibility <slug>` for checking the authenticated wallet's drop eligibility.
- Updated dependencies [5966017]
  - @opensea/sdk@11.4.2

## 1.12.2

### Patch Changes

- 755d8ab: Refresh browser OAuth sessions through OIDC discovery. New sessions record whether they use OAuth or private-key SIWE so refresh selects the correct endpoint without token-shape heuristics.

  BREAKING CHANGE: Pre-release CLI stores created before `authMethod` was added are rejected. Run `opensea login` again to create a current session.

## 1.12.1

### Patch Changes

- 71ae9ee: Keep OAuth scope status aligned with the OpenAPI scope catalog when the token endpoint omits its `scope` field.
- Updated dependencies [71ae9ee]
  - @opensea/sdk@11.4.1

## 1.12.0

### Minor Changes

- df2b152: Add `opensea auth link-wallet` for public SIWX wallet-link flows.
- 4bef9a5: Add `opensea api request` for authenticated API v2 GET, POST, PUT, PATCH, and DELETE requests.

### Patch Changes

- 6096c0d: Deduplicate Commander option definitions with shared builders while preserving command behavior.
- a917e48: Request the generated public API scope set during OAuth login so stale or deferred project roles cannot break the default flow.
- 2459068: Align wallet-auth scope metadata with the production OpenAPI specification.
- Updated dependencies [df2b152]
- Updated dependencies [2459068]
- Updated dependencies [0df96eb]
- Updated dependencies [4bef9a5]
  - @opensea/api-types@0.8.0
  - @opensea/sdk@11.4.0

## 1.11.0

### Minor Changes

- ef89be8: Add auth commands (login, status, refresh, revoke, tokens, scopes, clear) with token persistence in `~/.opensea/auth.json`. Support `--auth-token` and `--auth-base-url` global options.
- e61a57c: Add keyless `opensea login` command using OAuth 2.1 (authorization-code + PKCE via a loopback redirect, with a device authorization fallback for headless environments). No private key or SIWE signing required. The resulting scoped token is written to the shared `~/.opensea/auth.json` store so every other command picks it up transparently. Configure the public client via `--client-id` or `OPENSEA_OAUTH_CLIENT_ID`.
- c460fc1: Add wallet trading P&L commands: `accounts pnl`, `accounts closed-positions`,
  and `accounts token-transfers` (the last requires `--contract-address` and
  `--chain`).

### Patch Changes

- Updated dependencies [ef89be8]
- Updated dependencies [b816727]
- Updated dependencies [e61a57c]
- Updated dependencies [c9d8cb1]
- Updated dependencies [ef89be8]
- Updated dependencies [e59df7f]
- Updated dependencies [c460fc1]
- Updated dependencies [c460fc1]
- Updated dependencies [ef89be8]
  - @opensea/sdk@11.2.0
  - @opensea/api-types@0.6.0

## 1.10.1

### Patch Changes

- Updated dependencies
  - @opensea/api-types@0.5.0

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
