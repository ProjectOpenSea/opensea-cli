import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaClient } from "../src/client.js"
import {
  canonicalSavedSwapQuote,
  DEFAULT_SAVED_QUOTE_MAX_AGE_SECONDS,
  parseSavedSwapQuote,
  type SavedSwapQuote,
  SavedSwapQuoteError,
  signSavedSwapQuote,
  verifySavedSwapQuoteMac,
} from "../src/saved-swap-quote.js"
import { OpenSeaCLI } from "../src/sdk.js"
import type {
  EvmWalletAdapter,
  SvmWalletAdapter,
  WalletAdapter,
} from "../src/wallet/index.js"
import { WrongChainTypeError } from "../src/wallet/index.js"

vi.mock("../src/client.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/client.js")>()
  const MockOpenSeaClient = vi.fn()
  MockOpenSeaClient.prototype.get = vi.fn()
  MockOpenSeaClient.prototype.post = vi.fn()
  MockOpenSeaClient.prototype.getDefaultChain = vi.fn(() => "ethereum")
  MockOpenSeaClient.prototype.getApiKeyPrefix = vi.fn(() => "test...")
  return {
    OpenSeaClient: MockOpenSeaClient,
    OpenSeaAPIError: actual.OpenSeaAPIError,
  }
})

function createMockWallet(
  address = "0x1234567890abcdef1234567890abcdef12345678",
): EvmWalletAdapter & { sendTransaction: ReturnType<typeof vi.fn> } {
  return {
    name: "mock",
    chainType: "evm",
    // Required by WalletAdapter. This fake never exercises the optional signing
    // methods, so every capability is declared false.
    capabilities: {
      signMessage: false,
      signTypedData: false,
      managedGas: false,
      managedNonce: false,
    },
    getAddress: vi.fn().mockResolvedValue(address),
    sendTransaction: vi.fn().mockResolvedValue({ hash: "0xabc123" }),
  }
}

describe("SwapsAPI.execute", () => {
  let sdk: OpenSeaCLI
  let mockGet: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sdk = new OpenSeaCLI({ apiKey: "test-key" })
    mockGet = vi.mocked(OpenSeaClient.prototype.get)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("executes a single-transaction quote", async () => {
    const wallet = createMockWallet()

    mockGet.mockResolvedValue({
      transactions: [
        { to: "0xRouter", data: "0xcalldata", value: "0", chain: "ethereum" },
      ],
    })

    const results = await sdk.swaps.execute(
      {
        fromChain: "ethereum",
        fromAddress: "0xTokenA",
        toChain: "ethereum",
        toAddress: "0xTokenB",
        quantity: "1000000",
      },
      wallet,
    )

    expect(results).toHaveLength(1)
    expect(results[0].hash).toBe("0xabc123")
    expect(wallet.sendTransaction).toHaveBeenCalledWith({
      to: "0xRouter",
      data: "0xcalldata",
      value: "0",
      chainId: 1,
    })
  })

  it("executes multi-transaction quotes in order", async () => {
    const wallet = createMockWallet()
    wallet.sendTransaction
      .mockResolvedValueOnce({ hash: "0xhash1" })
      .mockResolvedValueOnce({ hash: "0xhash2" })

    mockGet.mockResolvedValue({
      transactions: [
        {
          to: "0xApproval",
          data: "0xapprove",
          value: "0",
          chain: "ethereum",
        },
        { to: "0xRouter", data: "0xswap", value: "100", chain: "ethereum" },
      ],
    })

    const results = await sdk.swaps.execute(
      {
        fromChain: "ethereum",
        fromAddress: "0xTokenA",
        toChain: "ethereum",
        toAddress: "0xTokenB",
        quantity: "1000000",
      },
      wallet,
    )

    expect(results).toHaveLength(2)
    expect(results[0].hash).toBe("0xhash1")
    expect(results[1].hash).toBe("0xhash2")
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(2)
  })

  it("skips transactions with missing 'to' address", async () => {
    const wallet = createMockWallet()
    const onSkipped = vi.fn()

    mockGet.mockResolvedValue({
      transactions: [
        { to: null, data: "0x", value: "0", chain: "ethereum" },
        { to: "0xRouter", data: "0xswap", value: "0", chain: "ethereum" },
      ],
    })

    const results = await sdk.swaps.execute(
      {
        fromChain: "ethereum",
        fromAddress: "0xTokenA",
        toChain: "ethereum",
        toAddress: "0xTokenB",
        quantity: "1000000",
      },
      wallet,
      { onSkipped },
    )

    expect(results).toHaveLength(1)
    expect(onSkipped).toHaveBeenCalledWith({
      chain: "ethereum",
      reason: "missing 'to' address",
    })
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(1)
  })

  it("throws on zero transactions in quote", async () => {
    const wallet = createMockWallet()

    mockGet.mockResolvedValue({ transactions: [] })

    await expect(
      sdk.swaps.execute(
        {
          fromChain: "ethereum",
          fromAddress: "0xTokenA",
          toChain: "ethereum",
          toAddress: "0xTokenB",
          quantity: "1000000",
        },
        wallet,
      ),
    ).rejects.toThrow("zero transactions")
  })

  it("throws when all transactions are skipped", async () => {
    const wallet = createMockWallet()

    mockGet.mockResolvedValue({
      transactions: [
        { to: null, data: "0x", value: "0", chain: "ethereum" },
        { to: undefined, data: "0x", value: "0", chain: "base" },
      ],
    })

    await expect(
      sdk.swaps.execute(
        {
          fromChain: "ethereum",
          fromAddress: "0xTokenA",
          toChain: "base",
          toAddress: "0xTokenB",
          quantity: "1000000",
        },
        wallet,
      ),
    ).rejects.toThrow("All swap transactions were skipped")
  })

  it("calls onQuote and onSending callbacks", async () => {
    const wallet = createMockWallet()
    const onQuote = vi.fn()
    const onSending = vi.fn()

    const quote = {
      transactions: [
        { to: "0xRouter", data: "0x", value: "0", chain: "ethereum" },
      ],
    }
    mockGet.mockResolvedValue(quote)

    await sdk.swaps.execute(
      {
        fromChain: "ethereum",
        fromAddress: "0xTokenA",
        toChain: "ethereum",
        toAddress: "0xTokenB",
        quantity: "1000000",
      },
      wallet,
      { onQuote, onSending },
    )

    expect(onQuote).toHaveBeenCalledWith(quote)
    expect(onSending).toHaveBeenCalledWith({
      to: "0xRouter",
      chain: "ethereum",
      chainId: 1,
    })
  })

  it("uses provided address instead of calling getAddress", async () => {
    const wallet = createMockWallet()

    mockGet.mockResolvedValue({
      transactions: [
        { to: "0xRouter", data: "0x", value: "0", chain: "ethereum" },
      ],
    })

    await sdk.swaps.execute(
      {
        fromChain: "ethereum",
        fromAddress: "0xTokenA",
        toChain: "ethereum",
        toAddress: "0xTokenB",
        quantity: "1000000",
        address: "0xPreComputedAddress",
      },
      wallet,
    )

    // Should NOT call getAddress since address was provided
    expect(wallet.getAddress).not.toHaveBeenCalled()
    // Should pass the provided address in the quote request
    expect(mockGet).toHaveBeenCalledWith(
      "/api/v2/swap/quote",
      expect.objectContaining({ address: "0xPreComputedAddress" }),
    )
  })

  it("calls getAddress when no address is provided", async () => {
    const wallet = createMockWallet("0xWalletAddress")

    mockGet.mockResolvedValue({
      transactions: [
        { to: "0xRouter", data: "0x", value: "0", chain: "ethereum" },
      ],
    })

    await sdk.swaps.execute(
      {
        fromChain: "ethereum",
        fromAddress: "0xTokenA",
        toChain: "ethereum",
        toAddress: "0xTokenB",
        quantity: "1000000",
      },
      wallet,
    )

    expect(wallet.getAddress).toHaveBeenCalledOnce()
    expect(mockGet).toHaveBeenCalledWith(
      "/api/v2/swap/quote",
      expect.objectContaining({ address: "0xWalletAddress" }),
    )
  })

  it("accepts a WalletAdapter-typed wallet, as createWalletFromEnv returns", async () => {
    // `createWalletFromEnv()` is typed `WalletAdapter`, so this is the documented happy path.
    // Narrowing `execute` to `EvmWalletAdapter` stopped it compiling, a breaking change no test
    // caught. Passing the union through the published signature pins that it still works.
    //
    // It has to arrive as a function's return type, not `const wallet: WalletAdapter = ...`:
    // control-flow analysis narrows an annotated const straight back to its initializer's type,
    // so that form still compiles against a narrowed parameter and guards nothing. Verified by
    // re-narrowing the signature and watching this line fail to error.
    const fromEnv = (): WalletAdapter => createMockWallet("0xUnionTyped")
    const wallet = fromEnv()

    mockGet.mockResolvedValue({
      transactions: [
        { to: "0xRouter", data: "0x", value: "0", chain: "ethereum" },
      ],
    })

    const results = await sdk.swaps.execute(
      {
        fromChain: "ethereum",
        fromAddress: "0xTokenA",
        toChain: "ethereum",
        toAddress: "0xTokenB",
        quantity: "1000000",
      },
      wallet,
    )

    expect(results).toHaveLength(1)
  })

  it("rejects an SVM wallet before requesting a quote", async () => {
    // `execute` takes the union, which is what `createWalletFromEnv()` returns, so this is a
    // caller that compiles cleanly and is rejected at runtime. The CLI command has its own guard
    // for the same case; this one covers the library entry point.
    const svm: SvmWalletAdapter = {
      name: "svm-mock",
      chainType: "svm",
      capabilities: {
        signMessage: true,
        signTypedData: false,
        managedGas: false,
        managedNonce: false,
      },
      getAddress: vi
        .fn()
        .mockResolvedValue("So11111111111111111111111111111111111111112"),
      signTransaction: vi.fn().mockResolvedValue({ signedTransaction: "" }),
    }

    mockGet.mockResolvedValue({
      transactions: [
        { to: "0xRouter", data: "0x", value: "0", chain: "ethereum" },
      ],
    })

    const call = sdk.swaps.execute(
      {
        fromChain: "ethereum",
        fromAddress: "0xTokenA",
        toChain: "ethereum",
        toAddress: "0xTokenB",
        quantity: "1000000",
      },
      svm,
    )

    await expect(call).rejects.toThrow(WrongChainTypeError)
    await expect(call).rejects.toThrow(
      'wallet "svm-mock" signs for svm; swap execution requires an EVM wallet',
    )
    // The guard runs first, so no quote is fetched and getAddress is never reached. Without it the
    // failure surfaces later as a missing sendTransaction, after a network round trip.
    expect(mockGet).not.toHaveBeenCalled()
    expect(svm.getAddress).not.toHaveBeenCalled()
  })
})

describe("SwapsAPI saved quotes", () => {
  const WALLET = "0x1234567890abcdef1234567890abcdef12345678"
  const APPROVAL = `0x${"a".repeat(40)}`
  const ROUTER = `0x${"b".repeat(40)}`
  const SAVED_AT = new Date("2026-11-09T12:00:00.000Z")
  const secondsAfterSave = (s: number) =>
    new Date(SAVED_AT.getTime() + s * 1000)

  let sdk: OpenSeaCLI
  let mockGet: ReturnType<typeof vi.fn>

  function savedQuote(
    overrides: {
      request?: Partial<SavedSwapQuote["request"]>
      transactions?: unknown[]
    } = {},
  ): SavedSwapQuote {
    return {
      type: "opensea_swap_quote",
      version: 1,
      saved_at: SAVED_AT.toISOString(),
      request: {
        from_chain: "base",
        from_address: "0x0000000000000000000000000000000000000000",
        to_chain: "base",
        to_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        quantity: "100000000000000",
        address: WALLET,
        ...overrides.request,
      },
      response: {
        quote: {
          costs: [],
          estimated_duration_ms: 0,
          marketplace_fee_bps: 45,
          route_errors: [],
          slippage_tolerance: 0.01,
          total_cost_usd: 0.21,
          total_price_usd: 0.2,
        },
        transactions: (overrides.transactions ?? [
          {
            chain: "base",
            to: APPROVAL,
            data: "0x095ea7b3",
            value: null,
          },
          {
            chain: "base",
            to: ROUTER,
            data: "0x12345678abcd",
            value: "100000000000000",
          },
        ]) as SavedSwapQuote["response"]["transactions"],
      },
    }
  }

  beforeEach(() => {
    sdk = new OpenSeaCLI({ apiKey: "test-key" })
    mockGet = vi.mocked(OpenSeaClient.prototype.get)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("quoteForExecution wraps the response with the request and fetch time", async () => {
    vi.useFakeTimers({ now: SAVED_AT })
    try {
      const response = savedQuote().response
      mockGet.mockResolvedValue(response)

      const saved = await sdk.swaps.quoteForExecution({
        fromChain: "base",
        fromAddress: "0x0000000000000000000000000000000000000000",
        toChain: "base",
        toAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        quantity: "100000000000000",
        address: WALLET,
        slippage: 0.02,
      })

      expect(saved).toEqual({
        type: "opensea_swap_quote",
        version: 1,
        saved_at: "2026-11-09T12:00:00.000Z",
        request: {
          from_chain: "base",
          from_address: "0x0000000000000000000000000000000000000000",
          to_chain: "base",
          to_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          quantity: "100000000000000",
          address: WALLET,
          slippage: 0.02,
        },
        response,
      })
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/swap/quote",
        expect.objectContaining({ address: WALLET, slippage: 0.02 }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("executeQuote signs exactly the saved transactions, in order, without fetching a quote", async () => {
    const wallet = createMockWallet(WALLET)
    wallet.sendTransaction
      .mockResolvedValueOnce({ hash: "0xhash1" })
      .mockResolvedValueOnce({ hash: "0xhash2" })
    const onSending = vi.fn()

    const results = await sdk.swaps.executeQuote(savedQuote(), wallet, {
      now: secondsAfterSave(30),
      onSending,
    })

    expect(results.map(r => r.hash)).toEqual(["0xhash1", "0xhash2"])
    expect(wallet.sendTransaction.mock.calls).toEqual([
      [{ to: APPROVAL, data: "0x095ea7b3", value: "0", chainId: 8453 }],
      [
        {
          to: ROUTER,
          data: "0x12345678abcd",
          value: "100000000000000",
          chainId: 8453,
        },
      ],
    ])
    expect(onSending).toHaveBeenCalledWith({
      to: ROUTER,
      chain: "base",
      chainId: 8453,
    })
    expect(mockGet).not.toHaveBeenCalled()
    expect(OpenSeaClient.prototype.post).not.toHaveBeenCalled()
  })

  it("executeQuote reports each sent transaction before a later send fails", async () => {
    const wallet = createMockWallet(WALLET)
    wallet.sendTransaction
      .mockResolvedValueOnce({ hash: "0xhash1" })
      .mockRejectedValueOnce(new Error("replacement underpriced"))
    const onSent = vi.fn()

    await expect(
      sdk.swaps.executeQuote(savedQuote(), wallet, {
        now: secondsAfterSave(1),
        onSent,
      }),
    ).rejects.toThrow("replacement underpriced")
    expect(onSent.mock.calls).toEqual([[{ hash: "0xhash1" }]])
  })

  it("accepts a quote exactly at the default 120s max age", async () => {
    const wallet = createMockWallet(WALLET)
    await sdk.swaps.executeQuote(savedQuote(), wallet, {
      now: secondsAfterSave(DEFAULT_SAVED_QUOTE_MAX_AGE_SECONDS),
    })
    expect(DEFAULT_SAVED_QUOTE_MAX_AGE_SECONDS).toBe(120)
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(2)
  })

  it("refuses a quote past the max age without sending", async () => {
    const wallet = createMockWallet(WALLET)
    await expect(
      sdk.swaps.executeQuote(savedQuote(), wallet, {
        now: secondsAfterSave(121),
      }),
    ).rejects.toThrow(
      new SavedSwapQuoteError(
        "Saved swap quote expired: saved 121s ago, limit 120s. Re-quote.",
      ),
    )
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("honours a longer maxAgeSeconds", async () => {
    const wallet = createMockWallet(WALLET)
    await sdk.swaps.executeQuote(savedQuote(), wallet, {
      now: secondsAfterSave(121),
      maxAgeSeconds: 300,
    })
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(2)
  })

  it("rejects a non-positive maxAgeSeconds", async () => {
    const wallet = createMockWallet(WALLET)
    await expect(
      sdk.swaps.executeQuote(savedQuote(), wallet, {
        now: SAVED_AT,
        maxAgeSeconds: 0,
      }),
    ).rejects.toThrow("maxAgeSeconds must be a positive number")
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("refuses a saved_at more than a minute in the future", async () => {
    const wallet = createMockWallet(WALLET)
    await expect(
      sdk.swaps.executeQuote(savedQuote(), wallet, {
        now: secondsAfterSave(-61),
      }),
    ).rejects.toThrow("is in the future")
    await sdk.swaps.executeQuote(savedQuote(), wallet, {
      now: secondsAfterSave(-60),
    })
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(2)
  })

  it("refuses a quote built for a different wallet", async () => {
    const wallet = createMockWallet(
      "0x9999999999999999999999999999999999999999",
    )
    await expect(
      sdk.swaps.executeQuote(savedQuote(), wallet, {
        now: secondsAfterSave(1),
      }),
    ).rejects.toThrow(
      `Saved swap quote was built for ${WALLET}, but the wallet is 0x9999999999999999999999999999999999999999`,
    )
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("matches EVM wallet addresses case-insensitively", async () => {
    const wallet = createMockWallet(WALLET.toUpperCase().replace("0X", "0x"))
    await sdk.swaps.executeQuote(savedQuote(), wallet, {
      now: secondsAfterSave(1),
    })
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(2)
  })

  it("refuses a transaction on a chain other than from_chain", async () => {
    const wallet = createMockWallet(WALLET)
    const quote = savedQuote({
      transactions: [
        { chain: "base", to: APPROVAL, data: "0x", value: "0" },
        { chain: "ethereum", to: ROUTER, data: "0x12345678abcd", value: "0" },
      ],
    })
    await expect(
      sdk.swaps.executeQuote(quote, wallet, { now: secondsAfterSave(1) }),
    ).rejects.toThrow(
      "Saved swap quote has a transaction on ethereum, but it swaps from base.",
    )
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("refuses a from_chain the wallet cannot resolve to an EVM chain id", async () => {
    const wallet = createMockWallet(WALLET)
    const quote = savedQuote({
      request: { from_chain: "notachain" },
      transactions: [
        { chain: "notachain", to: ROUTER, data: "0x", value: "0" },
      ],
    })
    const call = sdk.swaps.executeQuote(quote, wallet, {
      now: secondsAfterSave(1),
    })
    await expect(call).rejects.toThrow(SavedSwapQuoteError)
    await expect(call).rejects.toThrow('Unknown chain "notachain"')
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("rejects an SVM wallet before reading the quote", async () => {
    const svm: SvmWalletAdapter = {
      name: "svm-mock",
      chainType: "svm",
      capabilities: {
        signMessage: true,
        signTypedData: false,
        managedGas: false,
        managedNonce: false,
      },
      getAddress: vi.fn().mockResolvedValue(WALLET),
      signTransaction: vi.fn().mockResolvedValue({ signedTransaction: "" }),
    }
    await expect(
      sdk.swaps.executeQuote(savedQuote(), svm, { now: secondsAfterSave(1) }),
    ).rejects.toThrow(WrongChainTypeError)
  })

  const valid = () => savedQuote() as unknown as Record<string, unknown>
  const withTx = (tx: Record<string, unknown>) => {
    const q = valid()
    ;(q.response as { transactions: unknown[] }).transactions = [tx]
    return q
  }
  const malformedCases: [string, unknown, string][] = [
    ["a non-object", "quote", "expected a JSON object"],
    [
      "a raw quote response",
      savedQuote().response,
      'type must be "opensea_swap_quote"',
    ],
    ["an unknown version", { ...valid(), version: 2 }, "unsupported version 2"],
    [
      "an invalid saved_at",
      { ...valid(), saved_at: "yesterday" },
      'saved_at "yesterday"',
    ],
    [
      "a missing request",
      { ...valid(), request: undefined },
      "request must be an object",
    ],
    [
      "a missing wallet address",
      { ...valid(), request: { ...savedQuote().request, address: "" } },
      "request.address must be a non-empty string",
    ],
    [
      "a decimal quantity",
      { ...valid(), request: { ...savedQuote().request, quantity: "0.1" } },
      "request.quantity must be an integer",
    ],
    [
      "a non-numeric slippage",
      { ...valid(), request: { ...savedQuote().request, slippage: "1%" } },
      "request.slippage must be a number",
    ],
    [
      "an empty recipient",
      { ...valid(), request: { ...savedQuote().request, recipient: "" } },
      "request.recipient must be a non-empty string",
    ],
    [
      "a missing quote",
      {
        ...valid(),
        response: { transactions: savedQuote().response.transactions },
      },
      "response.quote must be an object",
    ],
    [
      "no transactions",
      { ...valid(), response: { ...savedQuote().response, transactions: [] } },
      "response.transactions must be a non-empty array",
    ],
    [
      "a transaction without to",
      withTx({ chain: "base", to: null, data: "0x", value: "0" }),
      "response.transactions[0].to must be a 0x-prefixed EVM address",
    ],
    [
      "a transaction without data",
      withTx({ chain: "base", to: ROUTER, value: "0" }),
      "response.transactions[0].data must be 0x-prefixed hex calldata",
    ],
    [
      "a non-address to",
      withTx({ chain: "base", to: "0xRouter", data: "0x", value: "0" }),
      "response.transactions[0].to must be a 0x-prefixed EVM address",
    ],
    [
      "a 41-hex-digit to",
      withTx({ chain: "base", to: `${ROUTER}c`, data: "0x", value: "0" }),
      "response.transactions[0].to must be a 0x-prefixed EVM address",
    ],
    [
      "odd-length calldata",
      withTx({ chain: "base", to: ROUTER, data: "0x123", value: "0" }),
      "response.transactions[0].data must be 0x-prefixed hex calldata",
    ],
    [
      "non-hex calldata",
      withTx({ chain: "base", to: ROUTER, data: "0xswap", value: "0" }),
      "response.transactions[0].data must be 0x-prefixed hex calldata",
    ],
    [
      "a hex value",
      withTx({ chain: "base", to: ROUTER, data: "0x", value: "0x10" }),
      "response.transactions[0].value must be a decimal string",
    ],
  ]

  it.each(
    malformedCases,
  )("refuses %s as malformed", async (_name, input, message) => {
    const wallet = createMockWallet(WALLET)
    const call = sdk.swaps.executeQuote(input as SavedSwapQuote, wallet, {
      now: secondsAfterSave(1),
    })
    await expect(call).rejects.toThrow(SavedSwapQuoteError)
    await expect(call).rejects.toThrow(message)
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("parseSavedSwapQuote accepts the valid fixture the malformed cases derive from", () => {
    expect(parseSavedSwapQuote(valid())).toEqual(savedQuote())
  })

  const KEY = new Uint8Array(32).fill(1)

  it("executeQuote with macKey accepts a quote signed with that key", async () => {
    const wallet = createMockWallet(WALLET)
    await sdk.swaps.executeQuote(
      signSavedSwapQuote(savedQuote(), KEY),
      wallet,
      {
        macKey: KEY,
        now: secondsAfterSave(1),
      },
    )
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(2)
  })

  const tampers: [string, (q: SavedSwapQuote) => void][] = [
    [
      "to",
      q => {
        q.response.transactions[1].to = APPROVAL
      },
    ],
    [
      "data",
      q => {
        q.response.transactions[1].data = "0x095ea7b3"
      },
    ],
    [
      "value",
      q => {
        q.response.transactions[1].value = "1"
      },
    ],
    [
      "saved_at",
      q => {
        q.saved_at = secondsAfterSave(5).toISOString()
      },
    ],
    [
      "request.recipient",
      q => {
        q.request.recipient = APPROVAL
      },
    ],
    [
      "request.quantity",
      q => {
        q.request.quantity = "1"
      },
    ],
  ]

  it.each(
    tampers,
  )("executeQuote with macKey refuses an edited %s", async (_field, edit) => {
    const wallet = createMockWallet(WALLET)
    const signed = structuredClone(signSavedSwapQuote(savedQuote(), KEY))
    edit(signed)
    const call = sdk.swaps.executeQuote(signed, wallet, {
      macKey: KEY,
      now: secondsAfterSave(10),
    })
    await expect(call).rejects.toThrow(SavedSwapQuoteError)
    await expect(call).rejects.toThrow(
      "only quote files saved by `opensea swaps quote --out` on this machine can be executed",
    )
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("executeQuote with macKey refuses a quote with no mac", async () => {
    const wallet = createMockWallet(WALLET)
    await expect(
      sdk.swaps.executeQuote(savedQuote(), wallet, {
        macKey: KEY,
        now: secondsAfterSave(1),
      }),
    ).rejects.toThrow("Saved swap quote not verified")
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("executeQuote with macKey refuses a quote signed with another key", async () => {
    const wallet = createMockWallet(WALLET)
    const other = new Uint8Array(32).fill(2)
    await expect(
      sdk.swaps.executeQuote(signSavedSwapQuote(savedQuote(), other), wallet, {
        macKey: KEY,
        now: secondsAfterSave(1),
      }),
    ).rejects.toThrow("Saved swap quote not verified")
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("refuses a mac that is not 64 lowercase hex characters as malformed", async () => {
    const wallet = createMockWallet(WALLET)
    const mac = signSavedSwapQuote(savedQuote(), KEY).mac?.toUpperCase()
    await expect(
      sdk.swaps.executeQuote({ ...savedQuote(), mac }, wallet, {
        now: secondsAfterSave(1),
      }),
    ).rejects.toThrow("mac must be 64 lowercase hex characters")
  })

  it("canonicalSavedSwapQuote sorts keys at every level and drops mac", () => {
    const quote = savedQuote()
    const reordered = {
      mac: "f".repeat(64),
      response: {
        transactions: quote.response.transactions.map(tx =>
          Object.fromEntries(Object.entries(tx).reverse()),
        ),
        quote: quote.response.quote,
      },
      request: Object.fromEntries(Object.entries(quote.request).reverse()),
      saved_at: quote.saved_at,
      version: quote.version,
      type: quote.type,
    } as unknown as SavedSwapQuote
    expect(canonicalSavedSwapQuote(reordered)).toBe(
      canonicalSavedSwapQuote(quote),
    )
    expect(canonicalSavedSwapQuote(quote)).toMatch(
      /^\{"request":\{"address":"0x1234[^}]*\},"response":\{"quote":\{"costs":\[\],/,
    )
  })

  it("quoteForExecution with macKey returns a quote that verifies", async () => {
    mockGet.mockResolvedValue(savedQuote().response)
    const saved = await sdk.swaps.quoteForExecution(
      {
        fromChain: "base",
        fromAddress: "0x0000000000000000000000000000000000000000",
        toChain: "base",
        toAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        quantity: "100000000000000",
        address: WALLET,
      },
      { macKey: KEY },
    )
    expect(saved.mac).toMatch(/^[0-9a-f]{64}$/)
    expect(() => verifySavedSwapQuoteMac(saved, KEY)).not.toThrow()
  })
})
