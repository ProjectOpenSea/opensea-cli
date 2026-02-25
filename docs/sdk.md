# SDK Reference

The `@opensea/cli` package exports a programmatic SDK for use in TypeScript/JavaScript applications.

## Setup

```typescript
import { OpenSeaCLI } from "@opensea/cli"

const client = new OpenSeaCLI({ apiKey: process.env.OPENSEA_API_KEY })
```

### Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | *required* | OpenSea API key |
| `baseUrl` | `string` | `https://api.opensea.io` | API base URL override |
| `graphqlUrl` | `string` | `https://gql.opensea.io/graphql` | GraphQL URL override |
| `chain` | `string` | `"ethereum"` | Default chain |

## Collections

```typescript
const collection = await client.collections.get("mfers")

const { collections, next } = await client.collections.list({
  chain: "ethereum",
  limit: 10,
  orderBy: "seven_day_volume",
  creatorUsername: "some-user",
  includeHidden: false,
  next: "cursor_string",
})

const stats = await client.collections.stats("mfers")

const traits = await client.collections.traits("mfers")
```

## NFTs

```typescript
const { nft } = await client.nfts.get("ethereum", "0x123...", "1")

const { nfts, next } = await client.nfts.listByCollection("mfers", {
  limit: 10,
  next: "cursor_string",
})

const { nfts, next } = await client.nfts.listByContract("ethereum", "0x123...", {
  limit: 10,
})

const { nfts, next } = await client.nfts.listByAccount("ethereum", "0x123...", {
  limit: 10,
})

await client.nfts.refresh("ethereum", "0x123...", "1")

const contract = await client.nfts.getContract("ethereum", "0x123...")
```

## Listings

```typescript
const { listings, next } = await client.listings.all("mfers", { limit: 10 })

const { listings, next } = await client.listings.best("mfers", { limit: 10 })

const listing = await client.listings.bestForNFT("mfers", "3490")
```

## Offers

```typescript
const { offers, next } = await client.offers.all("mfers", { limit: 10 })

const { offers, next } = await client.offers.collection("mfers", { limit: 10 })

const offer = await client.offers.bestForNFT("mfers", "1")

const { offers, next } = await client.offers.traits("mfers", {
  type: "background",
  value: "blue",
  limit: 10,
})
```

## Events

```typescript
const { asset_events, next } = await client.events.list({
  eventType: "sale",
  chain: "ethereum",
  after: 1700000000,
  before: 1700100000,
  limit: 10,
})

const { asset_events, next } = await client.events.byAccount("0x123...", {
  eventType: "transfer",
  chain: "ethereum",
  limit: 10,
})

const { asset_events, next } = await client.events.byCollection("mfers", {
  eventType: "sale",
  limit: 10,
})

const { asset_events, next } = await client.events.byNFT(
  "ethereum",
  "0x123...",
  "1",
  { eventType: "sale", limit: 10 },
)
```

## Accounts

```typescript
const account = await client.accounts.get("0x123...")
```

## Tokens

```typescript
const { tokens, next } = await client.tokens.trending({
  chains: ["base", "ethereum"],
  limit: 10,
  cursor: "cursor_string",
})

const { tokens, next } = await client.tokens.top({
  chains: ["base"],
  limit: 10,
})

const tokenDetails = await client.tokens.get("base", "0x123...")
```

## Search

Search methods use GraphQL and return different result shapes than the REST API.

```typescript
const collections = await client.search.collections("mfers", {
  chains: ["ethereum"],
  limit: 5,
})

const nfts = await client.search.nfts("cool cat", {
  collection: "cool-cats-nft",
  chains: ["ethereum"],
  limit: 5,
})

const tokens = await client.search.tokens("usdc", {
  chain: "base",
  limit: 5,
})

const accounts = await client.search.accounts("vitalik", { limit: 5 })
```

## Swaps

```typescript
const { quote, transactions } = await client.swaps.quote({
  fromChain: "base",
  fromAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  toChain: "base",
  toAddress: "0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2",
  quantity: "1000000",
  address: "0x21130e908bba2d41b63fbca7caa131285b8724f8",
  slippage: 0.01,
  recipient: "0x...",
})
```

## Error Handling

All API errors throw `OpenSeaAPIError` with structured fields:

```typescript
import { OpenSeaCLI, OpenSeaAPIError } from "@opensea/cli"

const client = new OpenSeaCLI({ apiKey: process.env.OPENSEA_API_KEY })

try {
  const collection = await client.collections.get("nonexistent")
} catch (error) {
  if (error instanceof OpenSeaAPIError) {
    console.error(error.statusCode)    // e.g. 404
    console.error(error.responseBody)  // raw response body
    console.error(error.path)          // e.g. "/api/v2/collections/nonexistent"
  }
}
```

## Exports

The package exports:

| Export | Description |
|---|---|
| `OpenSeaCLI` | Main SDK class with all API domain methods |
| `OpenSeaClient` | Low-level HTTP client (for advanced usage) |
| `OpenSeaAPIError` | Error class thrown on API failures |
| All types from `types/api.ts` | TypeScript interfaces for all API responses |
