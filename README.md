<p align="center">
  <img src="./img/banner.png" />
</p>

[![Version][version-badge]][version-link]
[![npm][npm-badge]][npm-link]
[![Test CI][ci-badge]][ci-link]
[![License][license-badge]][license-link]

# opensea-cli <!-- omit in toc -->

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
export OPENSEA_API_KEY=your-api-key
opensea collections get mfers

# or pass inline
opensea --api-key your-api-key collections get mfers
```

Get an API key at [docs.opensea.io](https://docs.opensea.io/reference/api-keys).

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
opensea search collections "cool cats"

# Get trending tokens
opensea tokens trending --limit 5

# Human-readable table output
opensea --format table collections stats mfers
```

## Commands

| Command | Description |
|---|---|
| `collections` | Get, list, stats, and traits for NFT collections |
| `nfts` | Get, list, refresh metadata, and contract details for NFTs |
| `listings` | Get all, best, or best-for-nft listings |
| `offers` | Get all, collection, best-for-nft, and trait offers |
| `events` | List marketplace events (sales, transfers, mints, etc.) |
| `search` | Search collections, NFTs, tokens, and accounts |
| `tokens` | Get trending tokens, top tokens, and token details |
| `swaps` | Get swap quotes for token trading |
| `accounts` | Get account details |

Global options: `--api-key`, `--chain` (default: ethereum), `--format` (json/table), `--base-url`

Full command reference with all options and flags: [docs/cli-reference.md](docs/cli-reference.md)

## Programmatic SDK

```typescript
import { OpenSeaCLI, OpenSeaAPIError } from "@opensea/cli"

const client = new OpenSeaCLI({ apiKey: process.env.OPENSEA_API_KEY })

const collection = await client.collections.get("mfers")
const { nfts } = await client.nfts.listByCollection("mfers", { limit: 5 })
const { listings } = await client.listings.best("mfers", { limit: 10 })
const { asset_events } = await client.events.byCollection("mfers", {
  eventType: "sale",
})
const { tokens } = await client.tokens.trending({ chains: ["base"], limit: 5 })
const results = await client.search.collections("mfers", { limit: 5 })

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

## Exit Codes

- `0` - Success
- `1` - API error
- `2` - Authentication error

## Requirements

- Node.js >= 18.0.0
- OpenSea API key ([get one here](https://docs.opensea.io/reference/api-keys))

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

[version-badge]: https://img.shields.io/github/package-json/v/ProjectOpenSea/opensea-cli
[version-link]: https://github.com/ProjectOpenSea/opensea-cli/releases
[npm-badge]: https://img.shields.io/npm/v/@opensea/cli?color=red
[npm-link]: https://www.npmjs.com/package/@opensea/cli
[ci-badge]: https://github.com/ProjectOpenSea/opensea-cli/actions/workflows/ci.yml/badge.svg
[ci-link]: https://github.com/ProjectOpenSea/opensea-cli/actions/workflows/ci.yml
[license-badge]: https://img.shields.io/github/license/ProjectOpenSea/opensea-cli
[license-link]: https://github.com/ProjectOpenSea/opensea-cli/blob/main/LICENSE
