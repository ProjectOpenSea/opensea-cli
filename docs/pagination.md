# Pagination

The OpenSea API uses cursor-based pagination. Paginated responses include a `next` field containing an opaque cursor string. Pass this cursor back to fetch the next page.

## CLI

All paginated commands use `--next <cursor>`:

```bash
# First page
opensea collections list --limit 5

# The response includes a "next" cursor — pass it to get the next page
opensea collections list --limit 5 --next "LXBrPTEwMDA..."

# Tokens also use --next
opensea tokens trending --limit 5
opensea tokens trending --limit 5 --next "abc123..."
```

### Commands that support pagination

| Command | Cursor flag |
|---|---|
| `collections list` | `--next` |
| `nfts list-by-collection` | `--next` |
| `nfts list-by-contract` | `--next` |
| `nfts list-by-account` | `--next` |
| `listings all` | `--next` |
| `listings best` | `--next` |
| `offers all` | `--next` |
| `offers collection` | `--next` |
| `offers traits` | `--next` |
| `events list` | `--next` |
| `events by-account` | `--next` |
| `events by-collection` | `--next` |
| `events by-nft` | `--next` |
| `tokens trending` | `--next` |
| `tokens top` | `--next` |

> **Note:** Search commands (`search collections`, `search nfts`, `search tokens`, `search accounts`) do not support cursor-based pagination. The underlying GraphQL API returns a flat list with no `next` cursor.

## SDK

SDK methods return a `next` cursor in the response object:

```typescript
const client = new OpenSeaCLI({ apiKey: process.env.OPENSEA_API_KEY })

// First page
const page1 = await client.collections.list({ limit: 5 })
console.log(page1.collections)

// Next page
if (page1.next) {
  const page2 = await client.collections.list({ limit: 5, next: page1.next })
}
```

### Iterating through all pages

```typescript
let cursor: string | undefined
do {
  const result = await client.nfts.listByCollection("mfers", {
    limit: 50,
    next: cursor,
  })
  for (const nft of result.nfts) {
    // process each NFT
  }
  cursor = result.next
} while (cursor)
```
