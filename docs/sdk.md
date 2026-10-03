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
| `chain` | `string` | `"ethereum"` | Default chain |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `verbose` | `boolean` | `false` | Log requests and responses to stderr |

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

## Drops and cross-chain minting

```typescript
const mint = await client.drops.crossChainMint("pyro-on-ape", {
  payer: "0x1111111111111111111111111111111111111111",
  minter: "0x1111111111111111111111111111111111111111",
  quantity: 1,
  payment: {
    chain: "base",
    token_address: "0x0000000000000000000000000000000000000000",
  },
})

// Submit mint.transactions in order, then poll the exact returned request.
const receipt = await client.transactions.receipt(mint.receipt_request)
```

Publishing needs a wallet token with `write:drops`. `sendTransaction` refuses a
wallet that is not the transaction's `from`, the contract's onchain owner.

```typescript
import { createWalletFromEnv, OpenSeaCLI, uploadToContext } from "@opensea/cli"

const creator = new OpenSeaCLI({
  apiKey: process.env.OPENSEA_API_KEY,
  authToken: process.env.OPENSEA_AUTH_TOKEN,
})

const tx = await creator.drops.buildPublishTransaction("my-drop")
const { hash } = await creator.drops.sendTransaction(tx, createWalletFromEnv())

const { workflow_execution_id } =
  await creator.drops.uploadMetadataToIpfs("my-drop")
const final = await creator.drops.waitForMetadataIpfs(
  "my-drop",
  workflow_execution_id,
)

const context = await creator.drops.createManifestUpload("my-drop")
await uploadToContext(context, new Blob([csvBytes]), {
  filename: "manifest.csv",
})
```

`uploadItemMedia` saves a set of item media files as the drop's items, replacing
any it already has. It puts every file in one upload batch (a new UUID unless
you pass `uploadBatchId`), requests upload contexts 50 files at a time and
uploads each chunk before requesting the next, then saves the batch by filename
with `saveItemMediaBatch`. Without a manifest, items are numbered 1 to n in the
order of `files`. A file's `data` can be a function, so a large drop is read one
file at a time:

```typescript
import { readFile } from "node:fs/promises"

const result = await creator.drops.uploadItemMedia(
  "my-drop",
  ["1.png", "2.png"].map(filename => ({
    filename,
    data: async () =>
      new Blob([new Uint8Array(await readFile(`media/${filename}`))]),
  })),
  {
    manifest: { filename: "manifest.csv", data: new Blob([csvBytes]) },
    onProgress: ({ uploaded, total }) => console.error(`${uploaded}/${total}`),
  },
)
// { upload_batch_id: "...", item_count: 2, success: true }
```

For the steps one at a time, pass one `upload_batch_id` to every
`createItemMediaUpload` call, upload each context with `uploadToContext`, then
call `saveItemMediaBatch("my-drop", { upload_batch_id, filenames })`.

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

## Agent accounts

An agent is an account, not a flag on a wallet, and ownership is a
relationship between two accounts that both sides confirm. It is a
declaration, not an authorization: naming an account as your agent grants it
nothing. It is self-reported rather than verified by OpenSea.

```typescript
// Requires write:wallets.
const declared = await client.agent.declare() // { is_agent, changed }
const proposal = await client.agent.propose("0xowner...", "AGENT")
const confirmed = await client.agent.confirm("0xagent...", "OWNER")
const revoked = await client.agent.revoke("0xowner...", "AGENT") // { removed }
const withdrawn = await client.agent.withdraw()

// Requires read:wallets, not write:wallets.
const { relationships } = await client.agent.list()

// Public read, API key only.
const publicView = await client.agent.profile("imatestagent123")
```

The role argument is the caller's own side: `"AGENT"` means "I am an agent and
the counterparty owns me". Proposing a relationship that is already awaiting
you confirms it, so a client that cannot tell who moved first can just call
`propose`. `changed` and `created` are false when the call was a no-op, which
makes a retry distinguishable from a real change.

Log in with both scopes or `agent.list()` returns 403:

```typescript
// opensea login --private-key --scopes read:wallets,write:wallets
```

## Tokens

```typescript
const { tokens, next } = await client.tokens.trending({
  chains: ["base", "ethereum"],
  limit: 10,
  next: "cursor_string",
})

const { tokens, next } = await client.tokens.top({
  chains: ["base"],
  limit: 10,
})

const tokenDetails = await client.tokens.get("base", "0x123...")

const activity = await client.tokens.activityStats(
  "base",
  "0x4200000000000000000000000000000000000006",
  { windows: ["1h", "24h"] },
)
```

Token activity stats use the public REST response shape, including
`computed_at`, `volume_usd`, and `average_trade_usd`. A requested window is
omitted from `windows` when it has no swaps.

## Search

Search uses the unified `/api/v2/search` REST endpoint. Results are ranked by relevance and each result has a `type` discriminator (`collection`, `nft`, `token`, or `account`) with the corresponding typed object. The search endpoint does not support cursor-based pagination; use `limit` to control result count (max 50).

```typescript
const { results } = await client.search.query("mfers", {
  assetTypes: ["collection", "nft"],
  chains: ["ethereum"],
  limit: 10,
})

// Each result has a type and the corresponding object
for (const result of results) {
  switch (result.type) {
    case "collection":
      console.log(result.collection?.name)
      break
    case "nft":
      console.log(result.nft?.name)
      break
    case "token":
      console.log(result.token?.symbol)
      break
    case "account":
      console.log(result.account?.username)
      break
  }
}
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
| API response types (e.g. `Collection`) | TypeScript interfaces for all API responses, imported from `@opensea/cli` |
