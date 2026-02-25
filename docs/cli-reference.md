# CLI Reference

Full command reference for all `opensea` CLI commands.

## Global Options

```
--api-key <key>     OpenSea API key (or set OPENSEA_API_KEY env var)
--chain <chain>     Default chain (default: ethereum)
--format <format>   Output format: json or table (default: json)
--base-url <url>    API base URL override (for testing against staging or proxies)
```

## Collections

```bash
opensea collections get <slug>
opensea collections list [--chain <chain>] [--order-by <field>] [--creator <username>] [--include-hidden] [--limit <n>] [--next <cursor>]
opensea collections stats <slug>
opensea collections traits <slug>
```

`--order-by` values: `created_date`, `one_day_change`, `seven_day_volume`, `seven_day_change`, `num_owners`, `market_cap`

## NFTs

```bash
opensea nfts get <chain> <contract> <token-id>
opensea nfts list-by-collection <slug> [--limit <n>] [--next <cursor>]
opensea nfts list-by-contract <chain> <contract> [--limit <n>] [--next <cursor>]
opensea nfts list-by-account <chain> <address> [--limit <n>] [--next <cursor>]
opensea nfts refresh <chain> <contract> <token-id>
opensea nfts contract <chain> <address>
```

## Listings

```bash
opensea listings all <collection> [--limit <n>] [--next <cursor>]
opensea listings best <collection> [--limit <n>] [--next <cursor>]
opensea listings best-for-nft <collection> <token-id>
```

## Offers

```bash
opensea offers all <collection> [--limit <n>] [--next <cursor>]
opensea offers collection <collection> [--limit <n>] [--next <cursor>]
opensea offers best-for-nft <collection> <token-id>
opensea offers traits <collection> --type <type> --value <value> [--limit <n>] [--next <cursor>]
```

## Events

```bash
opensea events list [--event-type <type>] [--after <timestamp>] [--before <timestamp>] [--chain <chain>] [--limit <n>] [--next <cursor>]
opensea events by-account <address> [--event-type <type>] [--chain <chain>] [--limit <n>] [--next <cursor>]
opensea events by-collection <slug> [--event-type <type>] [--limit <n>] [--next <cursor>]
opensea events by-nft <chain> <contract> <token-id> [--event-type <type>] [--limit <n>] [--next <cursor>]
```

Event types: `sale`, `transfer`, `mint`, `listing`, `offer`, `trait_offer`, `collection_offer` ([details](events.md))

## Search

```bash
opensea search collections <query> [--chains <chains>] [--limit <n>]
opensea search nfts <query> [--collection <slug>] [--chains <chains>] [--limit <n>]
opensea search tokens <query> [--chain <chain>] [--limit <n>]
opensea search accounts <query> [--limit <n>]
```

## Tokens

```bash
opensea tokens trending [--chains <chains>] [--limit <n>] [--next <cursor>]
opensea tokens top [--chains <chains>] [--limit <n>] [--next <cursor>]
opensea tokens get <chain> <address>
```

## Swaps

```bash
opensea swaps quote --from-chain <chain> --from-address <address> --to-chain <chain> --to-address <address> --quantity <quantity> --address <address> [--slippage <slippage>] [--recipient <recipient>]
```

## Accounts

```bash
opensea accounts get <address>
```

> REST list commands support cursor-based pagination. Search commands return a flat list with no cursor. See [pagination.md](pagination.md) for details.
