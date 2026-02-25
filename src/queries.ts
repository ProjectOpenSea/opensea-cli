export const SEARCH_COLLECTIONS_QUERY = `
query SearchCollections($query: String!, $limit: Int, $chains: [ChainIdentifier!]) {
  collectionsByQuery(query: $query, limit: $limit, chains: $chains) {
    slug
    name
    description
    imageUrl
    chain {
      identifier
      name
    }
    stats {
      totalSupply
      ownerCount
      volume {
        usd
      }
      sales
    }
    floorPrice {
      pricePerItem {
        usd
        native {
          unit
          symbol
        }
      }
    }
  }
}`

export const SEARCH_NFTS_QUERY = `
query SearchItems($query: String!, $collectionSlug: String, $limit: Int, $chains: [ChainIdentifier!]) {
  itemsByQuery(query: $query, collectionSlug: $collectionSlug, limit: $limit, chains: $chains) {
    tokenId
    name
    description
    imageUrl
    contractAddress
    collection {
      slug
      name
    }
    chain {
      identifier
      name
    }
    bestListing {
      pricePerItem {
        usd
        native {
          unit
          symbol
        }
      }
    }
    owner {
      address
      displayName
    }
  }
}`

export const SEARCH_TOKENS_QUERY = `
query SearchCurrencies($query: String!, $limit: Int, $chain: ChainIdentifier) {
  currenciesByQuery(query: $query, limit: $limit, chain: $chain, allowlistOnly: false) {
    name
    symbol
    imageUrl
    usdPrice
    contractAddress
    chain {
      identifier
      name
    }
    stats {
      marketCapUsd
      oneDay {
        priceChange
        volume
      }
    }
  }
}`

export const SEARCH_ACCOUNTS_QUERY = `
query SearchAccounts($query: String!, $limit: Int) {
  accountsByQuery(query: $query, limit: $limit) {
    address
    username
    imageUrl
    isVerified
  }
}`
