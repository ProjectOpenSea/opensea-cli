<p align="center">
  <img src="https://raw2.seadn.io/app_logos/repo-banners/opensea-repo-banner-2026.png" alt="OpenSea" />
</p>

[![Version][version-badge]][version-link]
[![npm][npm-badge]][npm-link]
[![Test CI][ci-badge]][ci-link]
[![License][license-badge]][license-link]

# opensea-cli <!-- omit in toc -->

Query the OpenSea API from your terminal or from TypeScript. Output defaults to JSON for scripts and agents, with table and TOON formats available.

## Table of contents

- [Install](#install)
- [Authentication](#authentication)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Programmatic SDK](#programmatic-sdk)
- [Output formats](#output-formats)
- [Exit codes](#exit-codes)
- [Development](#development)
- [Docs](#docs)

## Install

Requires Node.js 18 or newer.

```bash
npm install -g @opensea/cli
```

Or run it without installing:

```bash
npx @opensea/cli collections get mfers
```

## Authentication

API commands need a key. The CLI reads it from `--api-key`, then `OPENSEA_API_KEY`, then the key saved in `~/.opensea/api_key`.

```bash
# Get an instant free-tier API key (no signup needed) and save it to ~/.opensea/api_key
opensea auth request-key --save --if-missing   # no-op when a key is already set or saved
opensea collections get mfers

# or set it in the environment, which takes precedence over the saved key
export OPENSEA_API_KEY=your-api-key

# or pass inline
opensea --api-key your-api-key collections get mfers
```

`auth request-key` returns a free-tier key with no signup. For higher rate limits, create a key at [opensea.io/settings/developer](https://opensea.io/settings/developer). See the [API key docs](https://docs.opensea.io/reference/api-keys).

### Wallet login

Wallet-authenticated endpoints also need a scoped token:

```bash
export OPENSEA_PRIVATE_KEY="..."
opensea login --private-key --scopes read:favorites,read:wallets,write:wallets
WALLET=$(opensea --format json whoami | jq -r '.address')
opensea api request GET "/api/v2/account/$WALLET/favorites" --params '{"limit":1}'
opensea agent declare
opensea agent list
opensea auth revoke
```

`login --private-key` signs in with SIWE and requires an explicit `--scopes` list. The key signs locally and is never stored. Run `opensea login` without `--private-key` to log in interactively. See the [wallet-auth guide](https://docs.opensea.io/reference/auth).

The CLI stores the session it needs to revoke the personal access token (PAT), and `api request` sends the stored wallet JWT along with `OPENSEA_API_KEY`.

When the stored JWT has expired, or a request with it returns 401, the CLI refreshes it once, prints a one-line notice to stderr, and continues. This only happens against OpenSea's own servers, not with `--base-url` or `--auth-base-url`. Turn it off with `--no-auth-refresh`, or refresh on demand with `opensea auth refresh`. If the refresh token itself is rejected, the error names the login command to run.

## Quick start

```bash
# Get collection details
opensea collections get mfers

# Get floor price and volume stats
opensea collections stats mfers

# List NFTs in a collection
opensea nfts list-by-collection mfers --limit 5

# Get best listings
opensea listings best mfers --limit 5

# Search across OpenSea
opensea search "cool cats" --types collection

# Get trending tokens
opensea tokens trending --limit 5

# Get materialized token activity for selected windows
opensea tokens activity-stats base 0x4200000000000000000000000000000000000006 --windows 1h,24h

# Human-readable table output
opensea --format table collections stats mfers
```

## Commands

| Command | Description |
|---|---|
| `collections` | Get, list, stats, and traits for NFT collections; manage a collection page, its pricing currency and creator fee enforcement |
| `nfts` | Get, list, refresh metadata, and contract details for NFTs |
| `listings` | Query listings and create listing or fulfillment actions |
| `offers` | Query offers and create offer or fulfillment actions |
| `orders` | Cancel orders offchain or create onchain cancellation actions |
| `drops` | Query drops, build same-chain or cross-chain mint transactions, deploy a drop contract, publish or unpublish a drop, and upload its files |
| `transactions` | Poll transaction and cross-chain receipt status |
| `events` | List marketplace events (sales, transfers, mints, etc.) |
| `search` | Search collections, NFTs, tokens, and accounts |
| `tokens` | Get trending tokens, top tokens, token details, and activity stats |
| `swaps` | Get swap quotes for token trading |
| `signals` | Read public signals about a currency, NFT or collection, and post or delete your own |
| `accounts` | Get account details |
| `agent` | Declare an agent account and run the ownership handshake |
| `whoami` | Show the current wallet, the wallets its token covers, scopes, and scope source |
| `api request` | Call any API v2 endpoint with the active API key and wallet JWT |

Run `opensea --help` for the current list, and see [docs/cli-reference.md](docs/cli-reference.md) for every option.

Global options include `--api-key`, `--chain` (default `ethereum`), `--format` (`json`, `table` or `toon`), `--base-url`, `--fields`, `--max-lines`, `--timeout`, `--max-retries`, `--no-retry` and `--verbose`. A `--chain` you pass, before or after the subcommand, reaches subcommands that accept `--chain`. The `ethereum` default never does.

## Programmatic SDK

```typescript
import { OpenSeaCLI, OpenSeaAPIError } from "@opensea/cli"

const client = new OpenSeaCLI({ apiKey: process.env.OPENSEA_API_KEY })

const collection = await client.collections.get("mfers")
const { nfts } = await client.nfts.listByCollection("mfers", { limit: 5 })
const { listings } = await client.listings.best("mfers", { limit: 10 })
const fulfillment = await client.listings.fulfillmentActions({
  listing: {
    hash: "<svm_order.id>",
    chain: "solana",
    protocol_address: "<protocol address>",
  },
  fulfiller: { address: "<buyer address>" },
  include_optional_creator_fees: false,
})
const { asset_events } = await client.events.byCollection("mfers", {
  eventType: "sale",
})
const { tokens } = await client.tokens.trending({ chains: ["base"], limit: 5 })
const activity = await client.tokens.activityStats(
  "base",
  "0x4200000000000000000000000000000000000006",
  { windows: ["1h", "24h"] },
)
const results = await client.search.query("mfers", {
  assetTypes: ["collection"],
  limit: 5,
})
const declared = await client.agent.declare()
const { relationships } = await client.agent.list()

// Error handling
try {
  await client.collections.get("nonexistent")
} catch (error) {
  if (error instanceof OpenSeaAPIError) {
    console.error(error.statusCode)   // e.g. 404
    console.error(error.responseBody) // raw API response
    console.error(error.path)         // request path
  }
}
```

Full reference: [docs/sdk.md](docs/sdk.md).

## Output formats

JSON is the default:

```bash
opensea collections get mfers
```

Table output is easier to read:

```bash
opensea --format table collections list --limit 5
```

[TOON](https://github.com/toon-format/toon) (Token-Oriented Object Notation) uses about 40% fewer tokens than JSON, which helps when output goes into an LLM context window:

```bash
opensea --format toon tokens trending --limit 5
```

Uniform arrays of objects become CSV-like rows under one header, and nested objects use YAML-like indentation:

```
tokens[3]{name,symbol,chain,market_cap,price_usd}:
  Ethereum,ETH,ethereum,250000000000,2100.50
  Bitcoin,BTC,bitcoin,900000000000,48000.00
  Solana,SOL,solana,30000000000,95.25
next: abc123
```

The API does the encoding (the CLI sends `Accept: text/markdown`), so there is no client-side encoder.

## Exit codes

- `0`: success
- `1`: API error other than 401 or 429, or any other failure such as a network error
- `2`: authentication error (missing API key, HTTP 401, or a rejected token refresh)
- `3`: rate limited (HTTP 429)

## Development

```bash
npm install             # Install dependencies
npm run build           # Build CLI + SDK
npm run dev             # Build in watch mode
npm run test            # Run tests
npm run lint            # Lint with Biome
npm run format          # Format with Biome
npm run type-check      # TypeScript type checking
```

## Docs

| Document | Description |
|---|---|
| [CLI reference](docs/cli-reference.md) | Every command, option and flag |
| [Examples](docs/examples.md) | Usage examples for every command |
| [SDK reference](docs/sdk.md) | Every method in the programmatic SDK |
| [Pagination](docs/pagination.md) | Cursor-based pagination patterns for CLI and SDK |
| [Event types](docs/events.md) | Event type values and filtering |

## Contributing

Read-only mirror of a private monorepo, updated on each release. Pull requests are welcome, and we bring accepted changes into the monorepo. See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## Security

Found a vulnerability? Report it through OpenSea's Bugcrowd program at https://bugcrowd.com/engagements/opensea rather than opening a public issue. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

[version-badge]: https://img.shields.io/github/package-json/v/ProjectOpenSea/opensea-cli
[version-link]: https://github.com/ProjectOpenSea/opensea-cli/releases
[npm-badge]: https://img.shields.io/npm/v/@opensea/cli?color=red
[npm-link]: https://www.npmjs.com/package/@opensea/cli
[ci-badge]: https://github.com/ProjectOpenSea/opensea-cli/actions/workflows/ci.yml/badge.svg
[ci-link]: https://github.com/ProjectOpenSea/opensea-cli/actions/workflows/ci.yml
[license-badge]: https://img.shields.io/github/license/ProjectOpenSea/opensea-cli
[license-link]: https://github.com/ProjectOpenSea/opensea-cli/blob/main/LICENSE
