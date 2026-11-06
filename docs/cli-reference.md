# CLI Reference

Full command reference for all `opensea` CLI commands.

## Global Options

```
--api-key <key>     OpenSea API key (or set OPENSEA_API_KEY env var)
--chain <chain>     Default chain (default: ethereum)
--format <format>   Output format: json, table, or toon (default: json)
--base-url <url>    API base URL override (for testing against staging or proxies)
--timeout           Request timeout in milliseconds (default: 30000)
--verbose           Log request and response info to stderr
--no-auth-refresh   Do not refresh an expired or rejected stored wallet auth token
```

A `--chain` you pass reaches every subcommand that takes `--chain` (such as
`collections list`, `events by-account` or `drops deploy`), whether you put it
before or after the subcommand. The `ethereum` default never does: a chain
filter you leave out filters nothing, and a command that needs a chain fails
without one. `events list` has no chain filter and refuses a `--chain` you
pass; use `events by-account --chain` or `events by-nft <chain>` instead.

## Authentication

```bash
opensea whoami
opensea auth refresh
```

A wallet auth token from `opensea login` or `opensea auth login` is
short-lived. When the stored token has expired, or a request made with it returns 401,
the CLI refreshes it once, prints a one-line notice to stderr, and retries. It
never refreshes a token passed with `--auth-token` or `OPENSEA_AUTH_TOKEN`, and
it only refreshes against OpenSea's own servers, so a `--base-url` other than
the OpenSea API or any `--auth-base-url` turns it off. `--no-auth-refresh` turns it off
explicitly. `opensea auth refresh` does the
same refresh on demand. When the server refuses the refresh token (401 or 403
for a private-key login, 400, 401 or 403 for OAuth), the error says so and names the
command to sign in again, such as
`opensea auth login --private-key --scopes <scopes>`, and exits 2. A failed
automatic refresh before a request does not stop the request: it goes out with
the old token, and the refresh error is only reported if the server answers
401.

`whoami` reads the current local auth token and shows the wallet address, the
wallets the token resolves to, requested and granted scopes, any broader-scope
warning, the scope source, and expiry. Use `opensea whoami --diagnostic` to
inspect decoded JWT claims and scope differences. Those claims are unverified,
provider-specific diagnostics only and never authorization data.

The `linked_wallets` block answers how many wallets the token covers, which is
what decides whether a portfolio total built from it is complete. It comes from
the token's `linked_wallets` claim, which already contains the token's own
wallet, so that entry is marked `primary` in place rather than added again. Its
`status` separates a real count from an unknown one:

| `status` | Meaning |
|---|---|
| `listed` | The claim listed wallets. `count` and `wallets` are the full set. |
| `empty` | The claim was read and named no wallets. `count` is 0. |
| `claim_absent` | The token carries no `linked_wallets` claim, so the count is unknown. |
| `claim_unreadable` | The claim is present but is not a list, a `null` value included, so the count is unknown. |
| `token_unreadable` | The stored access token is not a readable JWT, so the count is unknown. |

The three unknown statuses carry a `message` and no `count`, so a token minted
without the claim never looks like an account that has one wallet.

Everything `whoami` prints is read out of the token stored in
`~/.opensea/auth.json`, including the wallet address itself, and none of it is
re-verified against the server. Treat it as what your token says, not as an
authorization decision.

```json
{
  "address": "0x1111111111111111111111111111111111111111",
  "linked_wallets": {
    "status": "listed",
    "count": 2,
    "wallets": [
      { "address": "0x1111111111111111111111111111111111111111", "primary": true },
      { "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "primary": false }
    ]
  }
}
```

## Login

```bash
opensea login [--scopes <scopes>] [--client-id <id>] [--device] [--no-browser]
opensea login --private-key --scopes <scopes>
opensea login --private-key <key> --scopes <scopes>
```

`login` obtains a scoped access token and stores it in `~/.opensea/auth.json`.
By default it runs the OAuth 2.1 authorization-code flow in a browser. Use
`--device` for headless environments or `--no-browser` to print the authorization
URL. Pass `--private-key` to authenticate with SIWE instead of OAuth, which is
useful for server-side agents. Set `OPENSEA_PRIVATE_KEY` and use `--private-key`
without a value to keep the key out of shell history; a raw key can be passed as
an option value when necessary. Private-key login requires `--scopes` so the
agent's capabilities are always explicit.

Set `OPENSEA_CONFIG_DIR` to keep the auth store somewhere other than
`~/.opensea`, which is what you want for a container with a mounted volume, a CI
job that should not touch a shared home directory, or a second set of
credentials held separately.

## Collections

```bash
opensea collections get <slug>
opensea collections list [--chain <chain>] [--order-by <field>] [--creator <username>] [--include-hidden] [--limit <n>] [--next <cursor>]
opensea collections stats <slug>
opensea collections traits <slug>
opensea collections trait-floors <slug>
opensea collections pfp-profiles <slug> [--limit <n>] [--next <cursor>]
opensea collections top-pfp [--limit <n>] [--chain <chain>] [--categories <list>] [--min-floor-price-usd <usd>] [--max-floor-price-usd <usd>]
```

`trait-floors` prints the floor price of each text trait value that has at
least one active listing. `pfp-profiles` lists the profiles wearing a verified
NFT from the collection as their profile picture. `top-pfp` ranks collections
by that wearer count; `--limit` takes 1 to 50 (default 20), and leaving out
`--chain` ranks across every chain.

`--order-by` values: `created_date`, `one_day_change`, `seven_day_volume`, `seven_day_change`, `num_owners`, `market_cap`

### Managing a collection page

These need a wallet token with `write:collections` (`opensea auth login`) from
a collection editor, except `creator-fee-enforcement`, which reads public state
with the API key alone.

```bash
opensea collections get-metadata <slug>
opensea collections update-metadata <slug> --body <path>
opensea collections upload-page-media <slug> <placement> --content-type <mime> [--file <path>]
opensea collections set-pricing-currency <slug> --stablecoin <true|false>
opensea collections creator-fee-enforcement <slug>
opensea collections set-creator-fee-enforcement <slug> --enabled <true|false> [--send] [--wallet-provider <provider>]
opensea collections refresh <slug>
```

`get-metadata` prints the saved page (hero, about, overview) in the shape of
the `update-metadata` body, plus the page's preview URL. To keep a saved image
or video in an update, send its url back as the token. A `mux_video` item has
no url, so leave out the field that holds it instead.

`upload-page-media` takes a placement of `hero_desktop`, `hero_mobile`,
`about_preview`, `about_section`, `overview`, `overview_background` or `team`,
and any image type or `video/mp4` up to 50 MB. Without `--file` it prints the
upload context, for `opensea drops upload-file`. With `--file` it uploads the
file and prints `{"token": ...}`. Pass the token in `update-metadata` as
`{ "image": { "token": ... } }` or `{ "video": { "token": ... } }`, matching
the file's type:

```bash
token=$(opensea collections upload-page-media my-drop hero_desktop \
  --content-type video/mp4 --file hero.mp4 | jq -r .token)
```

`set-pricing-currency --stablecoin true` prices secondary sales in the chain's
USD stablecoin (USDG on Robinhood Chain), `false` in its native currency. The
response's `workflow_id` is null when nothing needed to change.

`set-creator-fee-enforcement` prints the transactions that set or remove
OpenSea's transfer validator, in order. The list is empty when the contract is
already in that state. Each transaction's `from` is the contract's onchain
owner. With `--send` it signs and sends them in order with the configured EVM
wallet, writes each hash to stderr as it is sent, prints them all at the end,
and it refuses before sending anything when the
wallet is not every transaction's `from`. `creator-fee-enforcement` shows
whether enforcement is on and whether the contract supports it.

`refresh` queues a refresh of the collection's metadata from its contract's
`contractURI()`. It keeps page content the contract does not set.

## NFTs

```bash
opensea nfts get <chain> <contract> <token-id>
opensea nfts list-by-collection <slug> [--limit <n>] [--next <cursor>] [--traits <json>] [--has-agent-binding <true|false>]
opensea nfts list-by-contract <chain> <contract> [--limit <n>] [--next <cursor>]
opensea nfts list-by-account <chain> <address> [--limit <n>] [--next <cursor>] [--include-auto-hidden]
opensea nfts list-by-group <group> [--franchise <v>] [--grader <v>] [--grade <v>] [--subject <v>] [--year <v>] [--set <v>] [--language <v>] [--edition <v>] [--product-type <v>] [--collection-slug <slug>] [--query <text>] [--is-listed <true|false>] [--min-estimated-value-usd <usd>] [--max-estimated-value-usd <usd>] [--sort-by <field>] [--sort-direction <dir>] [--limit <n>] [--next <cursor>]
opensea nfts group-facets <group> [--facet-type <type>] [--collection-slug <slug>] [attribute filters]
opensea nfts refresh <chain> <contract> <token-id>
opensea nfts contract <chain> <address>
```

`--include-auto-hidden` also returns NFTs hidden automatically because a third party minted or sent them to the account. NFTs the holder hid themselves stay hidden, and NFTs removed for policy violations are not returned.

`list-by-group` searches every collection in a group, such as `trading_cards`, by normalized attributes. The attribute flags, `--collection-slug` and `--facet-type` are repeatable: values of one flag match any of them, and different flags are AND-combined. Use `group-facets` to discover the values and their counts.

```bash
opensea nfts group-facets trading_cards --facet-type grader --franchise Pokemon
opensea nfts list-by-group trading_cards --franchise Pokemon --grader PSA --grader CGC --grade 10 --is-listed true --sort-by price --sort-direction asc
```

## Listings

```bash
opensea listings all <collection> [--limit <n>] [--next <cursor>] [--maker <address>] [--include-private-listings]
opensea listings best <collection> [--limit <n>] [--next <cursor>] [--traits <json>] [--include-private-listings]
opensea listings best-for-nft <collection> <token-id> [--include-private-listings]
opensea listings actions --body <request.json>
opensea listings fulfillment-actions --body <request.json>
opensea listings post <chain> --body <signed-order.json> [--protocol seaport]
opensea listings fulfillment-data --body <request.json>
```

## Offers

```bash
opensea offers all <collection> [--limit <n>] [--next <cursor>]
opensea offers collection <collection> [--limit <n>] [--next <cursor>]
opensea offers best-for-nft <collection> <token-id>
opensea offers traits <collection> [--type <type>] [--value <value>] [--mode <STRING|NUMERIC|MULTI>] [--float-value <n>] [--int-value <n>] [--min-value <n>] [--max-value <n>] [--traits <json>] [--limit <n>] [--next <cursor>]
opensea offers actions --body <request.json>
opensea offers fulfillment-actions --body <request.json>
opensea offers post <chain> --body <signed-order.json> [--protocol seaport]
opensea offers build --body <request.json>
opensea offers post-criteria --body <signed-criteria-offer.json>
opensea offers fulfillment-data --body <request.json>
```

`listings post`, `offers post` and `offers post-criteria` submit an order you have already signed. The CLI does not build or sign orders: it sends the JSON file as the request body and prints the API response. `offers build` returns the unsigned parameters for a collection or trait offer; sign them yourself, then submit the result with `offers post-criteria`.

## Orders

```bash
opensea orders get <chain> <protocol_address> <order_hash>
opensea orders cancel <chain> <protocol_address> <order_hash> [--body <request.json>]
opensea orders cancel-actions <chain> <protocol_address> <order_identifier> --body <request.json>
```

The action commands work across EVM chains and Solana. For Solana, preserve base58 address casing, use `svm_order.id` as the order identifier, and pass through the order's returned protocol address.

## Drops

```bash
opensea drops list [--type <type>] [--chains <chains>] [--limit <n>] [--next <cursor>]
opensea drops get <slug>
opensea drops items <slug> [--limit <n>] [--next <cursor>]
opensea drops mint <slug> --minter <address> [--quantity <n>] [--send] [--wallet-provider <provider>]
opensea drops cross-chain-mint <slug> --payer <address> --minter <address> --payment-chain <chain> --payment-token <address> [--quantity <n>]
```

`items` lists the drop's saved items, a draft's included, and needs a wallet
token with `write:drops` from a collection editor.

`mint` prints a ready-to-sign transaction. With `--send` it signs and sends it
with the configured EVM wallet, which pays, and prints the hash, the chain, the
sending wallet and the minter. The wallet does not have to be the minter:
`--minter` receives the tokens either way.

Cross-chain minting returns ordered transactions plus `receipt_request`.
Submit the transactions in order, save `receipt_request` unchanged to a JSON
file, and poll it with the transactions command until the status is terminal.

### Deploying a drop contract

```bash
opensea drops deploy --chain <chain> --name <name> --symbol <symbol> --drop-type <type> --token-type <type> --sender <address> [--send] [--wallet-provider <provider>]
opensea drops deploy-receipt <chain> <tx-hash> [--wait] [--interval <seconds>] [--wait-timeout <seconds>]
```

`deploy` prints a ready-to-sign deploy transaction. `--chain` is required and
never defaults to `ethereum`. With `--send` it signs and sends the transaction
with the configured EVM wallet, which must be the `--sender` address, and
prints the hash and chain. Pass both to `deploy-receipt` next. `--send` cannot
send an `erc721_standard` deploy, a contract-creation transaction with a null
`to`; print it without `--send` and broadcast it from your own wallet.

`deploy-receipt --wait` polls every `--interval` seconds (default 5) until the
receipt has a `collection_slug` or its status is `failed`, for at most
`--wait-timeout` seconds (default 600). A `success` receipt without a slug keeps
polling, since the collection can appear after the contract lands. It exits 1
on `failed` or a timeout.

### Publishing a drop

These need a wallet token with `write:drops` (`opensea auth login`).

```bash
opensea drops publish <slug> [--send] [--wallet-provider <provider>]
opensea drops unpublish <slug> [--send] [--wallet-provider <provider>]
opensea drops upload-metadata-ipfs <slug> [--wait] [--interval <seconds>] [--wait-timeout <seconds>]
opensea drops metadata-ipfs-status <slug> <workflow-execution-id>
opensea drops create-manifest-upload <slug>
opensea drops upload-file --context <path|-> --file <path> [--index <n>]
opensea drops upload-items <slug> <dir> [--manifest <path>] [--concurrency <n>]
opensea drops create-item-media-upload <slug> --body <path> [--upload-batch-id <uuid>]
opensea drops save-item-media-batch <slug> (--body <path> | --upload-batch-id <uuid> --dir <path>)
```

`publish` and `unpublish` print a ready-to-sign transaction. With `--send`
they sign and send it with the configured EVM wallet and print the hash. The
transaction's `from` is the contract's onchain owner, and a transaction from
any other address reverts, so `--send` refuses a wallet whose address differs.

`upload-metadata-ipfs --wait` polls every `--interval` seconds (default 5)
until the status is no longer `running`, for at most `--wait-timeout` seconds
(default 600). It exits 1 on `failed`, `not_found` or a timeout.

`upload-file` performs the storage upload an upload context describes (from
`create-manifest-upload`, `create-item-media-upload` or
`create-allowlist-upload`) and prints `{"token": ...}`. It takes one context.
For the array `create-item-media-upload` returns, pass `--index <n>` or pipe
one element:

```bash
opensea drops create-manifest-upload my-drop \
  | opensea drops upload-file --context - --file manifest.csv
opensea drops create-item-media-upload my-drop --body filenames.json \
  | jq '.[0]' | opensea drops upload-file --context - --file 1.png
```

The upload URL and fields are short-lived credentials, so avoid saving the
context to a shared location. `upload-file` refuses a context whose `url` is
not HTTPS.

`upload-items` saves a folder of item media as the drop's items, replacing any
it already has. It generates one upload batch id, requests upload contexts 50
files at a time with that id, uploads each chunk (`--concurrency` files at
once, default 4), then saves the whole batch by filename. With `--manifest`, it
uploads the manifest CSV first and the save takes token ids and metadata from
it. Without one, items are numbered 1 to n in natural filename order, so
`2.png` comes before `10.png`. Hidden files, subfolders and `.csv` files in the
folder are skipped, and a symlink fails the command before anything is sent,
since item media is published on a public CDN. Progress goes to stderr, and the result is
`{"upload_batch_id": ..., "item_count": ..., "success": true}`:

```bash
opensea drops upload-items my-drop ./media --manifest manifest.csv
```

If every file uploads but the save fails, for example because the manifest
names a file that is not in the folder, fix the cause and save the same batch
again without re-uploading:

```bash
opensea drops save-item-media-batch my-drop --upload-batch-id <uuid> --dir ./media
```

To run the steps yourself, pass one `--upload-batch-id` (a UUID you generate
per set of files) to every `create-item-media-upload` request, upload each
context with `upload-file`, then run `save-item-media-batch` with a body of
`{"upload_batch_id": "<uuid>", "filenames": [...]}` (up to 15,000 filenames).

## Transactions

```bash
opensea transactions receipt --request <receipt-request.json>
```

## Events

```bash
opensea events list [--event-type <type>] [--after <timestamp>] [--before <timestamp>] [--limit <n>] [--next <cursor>]
opensea events by-account <address> [--event-type <type>] [--chain <chain>] [--limit <n>] [--next <cursor>]
opensea events by-collection <slug> [--event-type <type>] [--limit <n>] [--next <cursor>]
opensea events by-nft <chain> <contract> <token-id> [--event-type <type>] [--limit <n>] [--next <cursor>]
```

Event types: `sale`, `transfer`, `mint`, `listing`, `offer`, `trait_offer`, `collection_offer` ([details](events.md))

## Search

```bash
opensea search <query> [--types <types>] [--chains <chains>] [--limit <n>]
```

`--types` values (comma-separated): `collection`, `nft`, `token`, `account`

## Tokens

```bash
opensea tokens trending [--chains <chains>] [--sort-by <field>] [--sort-direction <asc|desc>] [--limit <n>] [--next <cursor>]
opensea tokens top [--chains <chains>] [--sort-by <field>] [--sort-direction <asc|desc>] [--limit <n>] [--next <cursor>]
opensea tokens get <chain> <address>
opensea tokens payment-token <chain> <address>
opensea tokens activity-stats <chain> <address> [--windows <windows>]
```

`--windows` accepts a comma-separated list containing `5m`, `1h`, `4h`, and
`24h`. If omitted, the API returns every available materialized window.

## Profile

```bash
opensea profile shelves <address>
```

`shelves` lists the profile shelves of any wallet and needs an API key alone.

## Signals

```bash
opensea signals get <signal_id>
opensea signals list --chain <chain> --contract <address> [--token-id <id>] [--limit <limit>] [--next <cursor>]
opensea signals list --collection <slug> [--limit <limit>] [--next <cursor>]
opensea signals create --text <text> (--chain <chain> --contract <address> [--token-id <id>] | --collection <slug>) [--author-address <address>]
opensea signals delete <signal_id>
```

Signals are public posts about one subject: a currency (`--chain` and `--contract`), an NFT (add
`--token-id`, a decimal on EVM chains and the mint address on Solana), or a collection
(`--collection` alone). `get` and `list` need only an API key. `list` returns the newest first and
can return an empty page with a `next` cursor, so keep passing `--next` until `next` is null.
Signal IDs are opaque `sig_v1_...` strings; pass them back unchanged.

`create` and `delete` need a wallet token with the `write:posts` scope:

```bash
export OPENSEA_PRIVATE_KEY="..."
opensea login --private-key --scopes write:posts
opensea signals create --text "Floor looks thin" --collection doodles-official
opensea signals delete sig_v1_...
```

`--author-address` defaults to the wallet the token signed in with. `create` is not idempotent:
retrying after an unknown outcome can post twice once the per-subject cooldown passes, and a post
inside the cooldown returns 422. `delete` returns 404 for a signal that is missing, already deleted
or owned by another account. Signals cannot be edited.

## Swaps

```bash
opensea swaps quote --from-chain <chain> --from-address <address> --to-chain <chain> --to-address <address> --quantity <quantity> --address <address> [--slippage <slippage>] [--recipient <recipient>]
```

## Accounts

```bash
opensea accounts get <address>
```

The wallet-level agent designation used to live here as `mark-agent` and
`remove-agent`. An agent is an account now, so use the `agent` commands below.

## Agent accounts

```bash
# The owner's side: "I ask an account to become my agent".
opensea agent add <identifier>
opensea agent accept <identifier>
opensea agent remove <identifier>

# The agent's side, and either side explicitly.
opensea agent declare
opensea agent withdraw
opensea agent propose <identifier> --role AGENT|OWNER
opensea agent confirm <identifier> --role AGENT|OWNER
opensea agent revoke <identifier> --role AGENT|OWNER

opensea agent list
opensea agent profile <address_or_username>
```

Every `<identifier>` takes an OpenSea username, an ENS name, or a wallet
address. The API's `counterparty_address` field takes an address literally and
answers a username with 400 "Invalid counterparty address", so the CLI resolves
the identifier through `/api/v2/accounts/resolve` first. An address is passed
straight through with no lookup.

`add`, `accept`, and `remove` are `propose`, `confirm`, and `revoke` with
`--role OWNER` fixed, because asking an account to become your agent is the
common direction. An agent program holding a scoped token uses the three
generic verbs with `--role AGENT`.

An agent is an account, not a flag on a wallet. Ownership is a relationship
between two accounts that both sides confirm. Three things it is not:

- Not sub-accounts. Declaring yourself an agent creates no new account type.
- Not delegation. "X is my agent" grants X no ability to act for the owner. It
  is a declaration, not an authorization.
- Not verification. It is self-reported and OpenSea does not check it.

An agent can have no owner at all, and at most one confirmed owner. Either
side may withdraw or revoke at any time, which deletes the relationship. Only
confirmed relationships are public; a pending proposal is visible to the two
parties alone.

`--role` is the side *you* are on. `--role AGENT` means "I am an agent and the
counterparty owns me".

The writes need `write:wallets` and `agent list` needs `read:wallets`, so a
client driving the whole handshake must log in with both:

```bash
opensea login --private-key --scopes read:wallets,write:wallets
```

With only `write:wallets`, `agent list` fails with 403 "Insufficient
permissions". `agent profile` is a public read and needs an API key alone.

Proposing a relationship that is already awaiting you confirms it, so a client
that cannot tell who moved first can just call `propose`:

```bash
# On the agent, declaring itself and asking the owner to confirm.
opensea agent declare
opensea agent propose ryanryanryanryan --role AGENT
opensea agent list   # status PENDING_OWNER, awaiting_confirmation_from OWNER

# On the owner. Either of these lands the same confirmed relationship.
opensea agent accept imatestagent123
opensea agent add imatestagent123
```

The owner can also move first, which leaves the relationship
`PENDING_AGENT` until the agent confirms:

```bash
opensea agent add imatestagent123          # on the owner
opensea agent confirm ryanryanryanryan --role AGENT   # on the agent
```

> REST list commands support cursor-based pagination. The search command returns a flat list with no cursor. See [pagination.md](pagination.md) for details.
