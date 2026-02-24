# opensea-cli

Query the OpenSea API from the command line or programmatically. Designed for both AI agents and developers.

## Install

```bash
npm install -g opensea-cli
```

Or use without installing:

```bash
npx opensea-cli collections get boredapeyachtclub
```

## Authentication

Set your API key via environment variable or flag:

```bash
export OPENSEA_API_KEY=your-api-key
opensea collections get boredapeyachtclub

# or pass inline
opensea --api-key your-api-key collections get boredapeyachtclub
```

Get an API key at [docs.opensea.io](https://docs.opensea.io/).

## CLI Usage

### Global Options

```
--api-key <key>     OpenSea API key (or set OPENSEA_API_KEY env var)
--chain <chain>     Default chain (default: ethereum)
--format <format>   Output format: json or table (default: json)
--base-url <url>    API base URL override
```

### Collections

```bash
opensea collections get <slug>
opensea collections list [--chain <chain>] [--order-by <field>] [--limit <n>]
opensea collections stats <slug>
opensea collections traits <slug>
```

### NFTs

```bash
opensea nfts get <chain> <contract> <token-id>
opensea nfts list-by-collection <slug> [--limit <n>]
opensea nfts list-by-contract <chain> <contract> [--limit <n>]
opensea nfts list-by-account <chain> <address> [--limit <n>]
opensea nfts refresh <chain> <contract> <token-id>
opensea nfts contract <chain> <address>
```

### Listings

```bash
opensea listings all <collection> [--limit <n>]
opensea listings best <collection> [--limit <n>]
opensea listings best-for-nft <collection> <token-id>
```

### Offers

```bash
opensea offers all <collection> [--limit <n>]
opensea offers collection <collection> [--limit <n>]
opensea offers best-for-nft <collection> <token-id>
opensea offers traits <collection> [--type <type>] [--value <value>]
```

### Events

```bash
opensea events list [--event-type <type>] [--chain <chain>] [--limit <n>]
opensea events by-account <address> [--event-type <type>]
opensea events by-collection <slug> [--event-type <type>]
opensea events by-nft <chain> <contract> <token-id> [--event-type <type>]
```

### Accounts

```bash
opensea accounts get <address>
```

## Programmatic SDK

Use as a TypeScript/JavaScript library:

```typescript
import { OpenSeaCLI } from "opensea-cli"

const client = new OpenSeaCLI({ apiKey: process.env.OPENSEA_API_KEY })

const collection = await client.collections.get("boredapeyachtclub")
const stats = await client.collections.stats("boredapeyachtclub")
const nfts = await client.nfts.listByCollection("boredapeyachtclub", { limit: 5 })
const listings = await client.listings.best("boredapeyachtclub", { limit: 10 })
const events = await client.events.byCollection("boredapeyachtclub", { eventType: "sale" })
const account = await client.accounts.get("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")
```

## Output Formats

JSON (default) - structured output for agents and scripts:

```bash
opensea collections get boredapeyachtclub
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
- OpenSea API key
