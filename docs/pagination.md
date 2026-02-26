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

- `collections list`
- `nfts list-by-collection`
- `nfts list-by-contract`
- `nfts list-by-account`
- `listings all`
- `listings best`
- `offers all`
- `offers collection`
- `offers traits`
- `events list`
- `events by-account`
- `events by-collection`
- `events by-nft`
- `tokens trending`
- `tokens top`

> **Note:** The `search` command does not support cursor-based pagination. The search API returns a flat list with no `next` cursor; use `--limit` to control result count (max 50).

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
