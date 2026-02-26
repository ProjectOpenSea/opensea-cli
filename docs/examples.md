# Examples

Real-world examples using the [tiny dinos](https://opensea.io/collection/tiny-dinos-eth) and [mfers](https://opensea.io/collection/mfers) collections.

## Collections

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

## NFTs

```bash
# Get a specific NFT by chain/contract/token-id
opensea nfts get ethereum 0xd9b78a2f1dafc8bb9c60961790d2beefebee56f4 1

# List NFTs in a collection
opensea nfts list-by-collection tiny-dinos-eth --limit 2

# List NFTs by contract address
opensea nfts list-by-contract ethereum 0xd9b78a2f1dafc8bb9c60961790d2beefebee56f4 --limit 2

# List NFTs owned by an account
opensea nfts list-by-account ethereum 0x21130e908bba2d41b63fbca7caa131285b8724f8 --limit 2

# Get contract details
opensea nfts contract ethereum 0xd9b78a2f1dafc8bb9c60961790d2beefebee56f4

# Refresh NFT metadata
opensea nfts refresh ethereum 0xd9b78a2f1dafc8bb9c60961790d2beefebee56f4 1
```

## Listings

```bash
# Get all listings for a collection
opensea listings all tiny-dinos-eth --limit 2

# Get best (cheapest) listings
opensea listings best tiny-dinos-eth --limit 2

# Get the best listing for a specific NFT
opensea listings best-for-nft mfers 3490
```

## Offers

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

## Events

```bash
# List recent events across all collections
opensea events list --limit 2

# Get events for a collection
opensea events by-collection tiny-dinos-eth --limit 2

# Get events for a specific NFT
opensea events by-nft ethereum 0xd9b78a2f1dafc8bb9c60961790d2beefebee56f4 1 --limit 2

# Get events for an account
opensea events by-account 0x21130e908bba2d41b63fbca7caa131285b8724f8 --limit 2
```

## Search

```bash
# Search across all types (defaults to collections and tokens)
opensea search mfers

# Search for collections only
opensea search "bored ape" --types collection

# Search for NFTs and collections
opensea search "cool cat" --types collection,nft --limit 5

# Search for tokens on a specific chain
opensea search usdc --types token --chains base --limit 5

# Search for accounts
opensea search vitalik --types account --limit 5

# Search across all types on a specific chain
opensea search "ape" --types collection,nft,token,account --chains ethereum
```

## Tokens

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

## Swaps

```bash
# Get a swap quote for USDC to DRB on Base
opensea swaps quote \
  --from-chain base --from-address 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 \
  --to-chain base --to-address 0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2 \
  --quantity 1000000 \
  --address 0x21130e908bba2d41b63fbca7caa131285b8724f8
```

## Accounts

```bash
# Get account details
opensea accounts get 0x21130e908bba2d41b63fbca7caa131285b8724f8
```
