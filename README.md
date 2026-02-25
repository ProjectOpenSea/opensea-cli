# opensea-cli

Query the OpenSea API from the command line or programmatically. Designed for both AI agents and developers.

## Install

```bash
npm install -g opensea-cli
```

Or use without installing:

```bash
npx opensea-cli collections get mfers
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
opensea offers traits <collection> --type <type> --value <value>
```

### Events

```bash
opensea events list [--event-type <type>] [--chain <chain>] [--limit <n>]
opensea events by-account <address> [--event-type <type>]
opensea events by-collection <slug> [--event-type <type>]
opensea events by-nft <chain> <contract> <token-id> [--event-type <type>]
```

### Tokens

```bash
opensea tokens trending [--chains <chains>] [--limit <n>] [--cursor <cursor>]
opensea tokens top [--chains <chains>] [--limit <n>] [--cursor <cursor>]
opensea tokens get <chain> <address>
```

### Swaps

```bash
opensea swaps quote --from-chain <chain> --from-address <address> --to-chain <chain> --to-address <address> --quantity <quantity> --address <address> [--slippage <slippage>] [--recipient <recipient>]
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

const collection = await client.collections.get("mfers")
const stats = await client.collections.stats("mfers")
const nfts = await client.nfts.listByCollection("mfers", { limit: 5 })
const listings = await client.listings.best("mfers", { limit: 10 })
const events = await client.events.byCollection("mfers", { eventType: "sale" })
const account = await client.accounts.get("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")
```

## Output Formats

JSON (default) - structured output for agents and scripts:

```bash
opensea collections get mfers
```

Table - human-readable output:

```bash
opensea --format table collections list --limit 5
```

## Examples

Here are real-world examples using the [tiny dinos](https://opensea.io/collection/tiny-dinos-eth) and [mfers](https://opensea.io/collection/mfers) collections:

### Collections

```bash
# Get collection details
opensea collections get tiny-dinos-eth

# List collections with a limit
opensea collections list --limit 2

# Get collection stats (volume, floor price, etc.)
opensea collections stats tiny-dinos-eth

# Get collection traits
opensea collections traits tiny-dinos-eth
```

### NFTs

```bash
# Get a specific NFT by chain/contract/token-id
opensea nfts get ethereum 0xd9b78a2f1dafc8bb9c60961790d2beefebee56f4 1

# List NFTs in a collection
opensea nfts list-by-collection tiny-dinos-eth --limit 2

# List NFTs by contract address
opensea nfts list-by-contract ethereum 0xd9b78a2f1dafc8bb9c60961790d2beefebee56f4 --limit 2

# List NFTs owned by an account
opensea nfts list-by-account ethereum 0xde7fce3a1cba4a705f299ce41d163017f165d666 --limit 2

# Get contract details
opensea nfts contract ethereum 0xd9b78a2f1dafc8bb9c60961790d2beefebee56f4

# Refresh NFT metadata
opensea nfts refresh ethereum 0xd9b78a2f1dafc8bb9c60961790d2beefebee56f4 1
```

### Listings

```bash
# Get all listings for a collection
opensea listings all tiny-dinos-eth --limit 2

# Get best (cheapest) listings
opensea listings best tiny-dinos-eth --limit 2

# Get the best listing for a specific NFT
opensea listings best-for-nft mfers 3490
```

### Offers

```bash
# Get all offers for a collection
opensea offers all tiny-dinos-eth --limit 2

# Get collection offers
opensea offers collection tiny-dinos-eth --limit 2

# Get best offer for a specific NFT
opensea offers best-for-nft tiny-dinos-eth 1

# Get trait offers (type and value are required)
opensea offers traits tiny-dinos-eth --type background --value blue --limit 2
```

### Events

```bash
# List recent events across all collections
opensea events list --limit 2

# Get events for a collection
opensea events by-collection tiny-dinos-eth --limit 2

# Get events for a specific NFT
opensea events by-nft ethereum 0xd9b78a2f1dafc8bb9c60961790d2beefebee56f4 1 --limit 2

# Get events for an account
opensea events by-account 0xde7fce3a1cba4a705f299ce41d163017f165d666 --limit 2
```

### Tokens

```bash
# Get trending tokens
opensea tokens trending --limit 2

# Get trending tokens on a specific chain
opensea tokens trending --chains base --limit 2

# Get top tokens by 24-hour volume
opensea tokens top --limit 2

# Get top tokens on a specific chain
opensea tokens top --chains base --limit 2

# Get details for a specific token (DebtReliefBot on Base)
opensea tokens get base 0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2
```

### Swaps

```bash
# Get a swap quote for USDC to DRB on Base
opensea swaps quote \
  --from-chain base --from-address 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 \
  --to-chain base --to-address 0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2 \
  --quantity 1000000 \
  --address 0x21130e908bba2d41b63fbca7caa131285b8724f8
```

### Accounts

```bash
# Get account details
opensea accounts get 0xde7fce3a1cba4a705f299ce41d163017f165d666
```

## Exit Codes

- `0` - Success
- `1` - API error
- `2` - Authentication error

## Requirements

- Node.js >= 18.0.0
- OpenSea API key ([get one here](https://docs.opensea.io/reference/api-keys))
