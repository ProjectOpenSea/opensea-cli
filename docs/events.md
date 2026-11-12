# Event types

Every `events` command takes `--event-type` to filter by type.

## Valid event types

| Type | Description |
|---|---|
| `sale` | NFT sold |
| `transfer` | NFT transferred between wallets |
| `mint` | NFT minted |
| `listing` | NFT listed for sale |
| `offer` | Offer made on an NFT |
| `trait_offer` | Offer made on NFTs with a specific trait |
| `collection_offer` | Offer made on any NFT in a collection |

## CLI usage

```bash
# Filter by event type
opensea events list --event-type sale --limit 5

# Combine with other filters
opensea events by-collection mfers --event-type transfer --limit 10
opensea events by-account 0x123... --event-type mint --chain ethereum
opensea events by-nft ethereum 0x123... 1 --event-type listing

# Time-based filtering (events list only)
opensea events list --event-type sale --after 1700000000 --before 1700100000
```

## SDK usage

```typescript
const { asset_events } = await client.events.byCollection("mfers", {
  eventType: "sale",
  limit: 10,
})
```

The CLI flag is `--event-type`; the SDK option is `eventType`.
