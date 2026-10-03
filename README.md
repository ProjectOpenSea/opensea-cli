<p align="center">
  <img src="./img/banner.png" />
</p>

[![Version][version-badge]][version-link]
[![npm][npm-badge]][npm-link]
[![Test CI][ci-badge]][ci-link]
[![License][license-badge]][license-link]

# opensea-cli <!-- omit in toc -->

> **Read-only mirror.** This package is developed in a private monorepo and mirrored to [ProjectOpenSea/opensea-cli](https://github.com/ProjectOpenSea/opensea-cli) when a version is released, so the public code can trail the internal main branch by weeks.
>
> Pull requests opened on the mirror cannot be merged there. They are read, and a fix worth taking is recreated in the monorepo. Because a fix that has landed internally is not public until the next release, filing an issue before writing a patch is the quickest way to find out whether a bug is already fixed.

Query the OpenSea API from the command line or programmatically. Designed for both AI agents and developers.

## Table of Contents

- [Install](#install)
- [Authentication](#authentication)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Programmatic SDK](#programmatic-sdk)
- [Output Formats](#output-formats)
- [Exit Codes](#exit-codes)
- [Requirements](#requirements)
- [Development](#development)
- [Docs](#docs)

## Install

```bash
npm install -g @opensea/cli
```

Or use without installing:

```bash
npx @opensea/cli collections get mfers
```

## Authentication

Set your API key via environment variable or flag:

```bash
# Get an instant free-tier API key (no signup needed)
export OPENSEA_API_KEY=$(curl -s -X POST https://api.opensea.io/api/v2/auth/keys | jq -r '.api_key')
opensea collections get mfers

# or pass inline
opensea --api-key your-api-key collections get mfers
```

Get an API key instantly via the command above, or get a full key at [opensea.io/settings/developer](https://opensea.io/settings/developer) for higher rate limits. See [API key docs](https://docs.opensea.io/reference/api-keys) for details.

Wallet-authenticated endpoints also require a scoped token:

```bash
export OPENSEA_PRIVATE_KEY="..."
opensea login --private-key --scopes read:favorites,read:wallets,write:wallets
WALLET=$(opensea --format json whoami | jq -r '.address')
opensea api request GET "/api/v2/account/$WALLET/favorites" --params '{"limit":1}'
opensea agent declare
opensea agent list
opensea auth revoke
```

Private-key login uses SIWE and requires an explicit `--scopes` list. The
private key signs locally and is not stored. The CLI
keeps the session needed to revoke the personal access token (PAT), and
`api request` sends the stored wallet JWT alongside `OPENSEA_API_KEY`. When
the stored JWT has expired, or a request with it returns 401, the CLI refreshes
it once, prints a one-line notice to stderr, and continues. It does this only
against OpenSea's own servers (not with `--base-url` or `--auth-base-url`), and
`--no-auth-refresh` turns it off; `opensea auth refresh` runs it on demand. If
the refresh token itself is refused, the error names the login command to run
instead. For interactive login, run
`opensea login` without `--private-key`. See the
[wallet-auth guide](https://docs.opensea.io/reference/auth).

## Quick Start

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
| `accounts` | Get account details |
| `agent` | Declare an agent account and run the ownership handshake |
| `whoami` | Show the current wallet, the wallets its token covers, scopes, and scope source |
| `api request` | Call any API v2 endpoint with the active API key and wallet JWT |

This table is a high-level summary; run `opensea --help` for the current command list and [docs/cli-reference.md](docs/cli-reference.md) for the full reference.

Global options: `--api-key`, `--chain` (default: ethereum), `--format` (json/table/toon), `--base-url`. A `--chain` you pass, before or after the subcommand, reaches subcommands that take `--chain`; the `ethereum` default never does.

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

Full SDK reference: [docs/sdk.md](docs/sdk.md)

## Output Formats

JSON (default) - structured output for agents and scripts:

```bash
opensea collections get mfers
```

Table - human-readable output:

```bash
opensea --format table collections list --limit 5
```

TOON - [Token-Oriented Object Notation](https://github.com/toon-format/toon), a compact format that uses ~40% fewer tokens than JSON. Ideal for piping output into LLM / AI agent context windows:

```bash
opensea --format toon tokens trending --limit 5
```

Example TOON output for a list of tokens:

```
tokens[3]{name,symbol,chain,market_cap,price_usd}:
  Ethereum,ETH,ethereum,250000000000,2100.50
  Bitcoin,BTC,bitcoin,900000000000,48000.00
  Solana,SOL,solana,30000000000,95.25
next: abc123
```

TOON collapses uniform arrays of objects into CSV-like tables with a single header row, while nested objects use YAML-like indentation. The encoding is performed server-side via the `Accept: text/markdown` header — no client-side encoder is needed.

## Exit Codes

- `0` - Success
- `1` - API error (non-429)
- `2` - Authentication error (missing API key, or HTTP 401)
- `3` - Rate limited (HTTP 429)

## Requirements

- Node.js >= 18.0.0
- OpenSea API key — get one instantly: `curl -s -X POST https://api.opensea.io/api/v2/auth/keys | jq -r '.api_key'` or from [opensea.io/settings/developer](https://opensea.io/settings/developer)

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
| [CLI Reference](docs/cli-reference.md) | Full command reference with all options and flags |
| [Examples](docs/examples.md) | Real-world usage examples for every command |
| [SDK Reference](docs/sdk.md) | Full programmatic SDK API with all methods |
| [Pagination](docs/pagination.md) | Cursor-based pagination patterns for CLI and SDK |
| [Event Types](docs/events.md) | Event type values and filtering |

## Contributing

Issues and bug reports are the best way to contribute, and the mirror notice at the top of this page covers what happens to a pull request. See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

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
