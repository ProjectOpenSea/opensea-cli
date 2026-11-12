# Pagination

The OpenSea API paginates with cursors. A paginated response has a `next` field holding an opaque cursor; pass it back to get the next page.

## CLI

Every paginated command takes `--next <cursor>`:

```bash
# First page
opensea collections list --limit 5

# Pass the "next" cursor from the response to get the next page
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

`search` is not paginated. The search API returns a flat list with no `next` cursor; use `--limit` to set the result count (max 50).

## SDK

SDK methods return the `next` cursor in the response object:

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
