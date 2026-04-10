import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaClient } from "../src/client.js"
import { OpenSeaCLI } from "../src/sdk.js"
import type { WalletAdapter } from "../src/wallet/adapter.js"

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
): WalletAdapter & { sendTransaction: ReturnType<typeof vi.fn> } {
  return {
    name: "mock",
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
})
