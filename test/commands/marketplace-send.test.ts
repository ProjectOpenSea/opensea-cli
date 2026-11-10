import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { listingsCommand } from "../../src/commands/listings.js"
import { offersCommand } from "../../src/commands/offers.js"
import { ordersCommand } from "../../src/commands/orders.js"
import { runMarketplaceSteps } from "../../src/marketplace/cli.js"
import { planActionSteps, planDigest } from "../../src/marketplace/guard.js"
import {
  ACCOUNT,
  ATTACKER,
  approveCalldata,
  buyStep,
  CONDUIT,
  cancelCalldata,
  createMockWallet,
  FULFILL_BASIC_ORDER_CALLDATA,
  itemApprovalStep,
  LISTING_REQUESTED,
  LIVE_ORDER,
  LIVE_ORDER_HASH,
  OTHER,
  offerOrder,
  paymentApprovalStep,
  SEAPORT,
  signatureStep,
  transaction,
  typedDataMessage,
  WETH,
} from "../marketplace/fixtures.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

const walletMock = vi.hoisted(() => ({ createWalletFromEnv: vi.fn() }))
const readlineMock = vi.hoisted(() => ({
  question: vi.fn(),
  close: vi.fn(),
}))

vi.mock("node:readline/promises", () => ({
  createInterface: () => readlineMock,
}))

vi.mock("../../src/wallet/index.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../../src/wallet/index.js")>()),
  createWalletFromEnv: walletMock.createWalletFromEnv,
}))

function writeTempJson(data: unknown): string {
  const file = join(mkdtempSync(join(tmpdir(), "cli-test-")), "body.json")
  writeFileSync(file, JSON.stringify(data))
  return file
}

const listBody = {
  address: ACCOUNT,
  items: [
    {
      chain: "base",
      contract: "0x3333333333333333333333333333333333333333",
      token_id: "7",
      quantity: 1,
      price: {
        amount: "1",
        currency: "0x0000000000000000000000000000000000000000",
      },
    },
  ],
}

function lastJson(spy: ReturnType<typeof vi.spyOn>): unknown {
  return JSON.parse(String(spy.mock.calls.at(-1)?.[0]))
}

describe("marketplace --send and --dry-run", () => {
  let ctx: CommandTestContext

  const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY")

  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    })
    ctx = createCommandTestContext()
    vi.spyOn(console, "error").mockImplementation(() => {})
    walletMock.createWalletFromEnv.mockReset()
    ctx.mockClient.get.mockResolvedValue({ symbol: "ETH", decimals: 18 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (stdinTTY) Object.defineProperty(process.stdin, "isTTY", stdinTTY)
    else delete (process.stdin as { isTTY?: boolean }).isTTY
  })

  it("without a flag prints the API response and never opens a wallet", async () => {
    const response = { steps: [itemApprovalStep(), signatureStep()] }
    ctx.mockClient.post.mockResolvedValue(response)
    await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["actions", "--body", writeTempJson(listBody)],
      { from: "user" },
    )
    expect(lastJson(ctx.consoleSpy)).toEqual(response)
    expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
  })

  it("--dry-run prints the checked summary without opening a wallet", async () => {
    ctx.mockClient.post.mockResolvedValue({
      steps: [itemApprovalStep(), signatureStep()],
    })
    await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["actions", "--body", writeTempJson(listBody), "--dry-run"],
      { from: "user" },
    )
    const summary = lastJson(ctx.consoleSpy) as {
      steps: Array<{ order?: { price: string } }>
      to_addresses: string[]
    }
    expect(summary.steps[1].order?.price).toBe("1 ETH")
    expect(summary.to_addresses).toEqual([
      "0x3333333333333333333333333333333333333333",
    ])
    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/chain/base/token/0x0000000000000000000000000000000000000000",
    )
    expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
  })

  it("--dry-run fails on a refused step", async () => {
    ctx.mockClient.post.mockResolvedValue({
      steps: [itemApprovalStep(ATTACKER)],
    })
    await expect(
      listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        ["actions", "--body", writeTempJson(listBody), "--dry-run"],
        { from: "user" },
      ),
    ).rejects.toThrow(`it approves ${ATTACKER}`)
  })

  it("listings actions --send approves, signs and posts the listing on its chain", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post
      .mockResolvedValueOnce({ steps: [itemApprovalStep(), signatureStep()] })
      .mockResolvedValueOnce({ order_hash: "0xorder" })

    await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["actions", "--body", writeTempJson(listBody), "--send", "--yes"],
      { from: "user" },
    )

    expect(wallet.sendTransaction).toHaveBeenCalledTimes(1)
    expect(wallet.signTypedData).toHaveBeenCalledTimes(1)
    expect(ctx.mockClient.post.mock.calls[1][0]).toBe(
      "/api/v2/orders/base/seaport/listings",
    )
    expect(ctx.mockClient.post.mock.calls[1][1]).toMatchObject({
      protocol_address: SEAPORT,
      signature: "0xsignature",
    })
    expect(lastJson(ctx.consoleSpy)).toEqual({
      steps: [
        { step: 1, action: "itemApprovalAction", hash: "0xhash1" },
        {
          step: 2,
          action: "createListingsAction",
          order: { order_hash: "0xorder" },
        },
      ],
    })
  })

  it("--send refuses a wallet that is not the request's address before sending anything", async () => {
    const wallet = createMockWallet({ address: OTHER })
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post.mockResolvedValueOnce({
      steps: [itemApprovalStep(), signatureStep()],
    })
    await expect(
      listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        ["actions", "--body", writeTempJson(listBody), "--send", "--yes"],
        { from: "user" },
      ),
    ).rejects.toThrow(`Wallet ${OTHER} is not ${ACCOUNT}`)
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("--send refuses an order signed for another chain than the request's before sending its approval", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post.mockResolvedValueOnce({
      steps: [itemApprovalStep(), signatureStep()],
    })
    const ethereumBody = {
      ...listBody,
      items: [{ ...listBody.items[0], chain: "ethereum" }],
    }
    await expect(
      listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        ["actions", "--body", writeTempJson(ethereumBody), "--send", "--yes"],
        { from: "user" },
      ),
    ).rejects.toThrow(
      "Refusing step 1 (itemApprovalAction): it is on chain 8453, but the request names chain 1",
    )
    expect(ctx.mockClient.post).toHaveBeenCalledTimes(1)
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("runMarketplaceSteps refuses to post an order signed for another chain than orderChain", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    await expect(
      runMarketplaceSteps({
        client: ctx.getClient(),
        format: "json",
        options: { send: true, yes: true },
        account: ACCOUNT,
        purpose: "listing creation",
        orderChain: "ethereum",
        request: async () => ({}),
        plan: () => ({
          steps: planActionSteps(
            [itemApprovalStep(), signatureStep()],
            ACCOUNT,
            { requestedOrder: LISTING_REQUESTED },
          ),
        }),
      }),
    ).rejects.toThrow("signed for chain 8453, not ethereum")
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("orders cancel-actions --send refuses a step on another chain than the one named", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post.mockResolvedValueOnce({
      steps: [
        {
          cancelOrdersAction: {
            transaction: transaction({
              to: SEAPORT,
              data: cancelCalldata([LIVE_ORDER]),
            }),
            orderIds: ["0xorder"],
          },
        },
      ],
    })
    await expect(
      ordersCommand(ctx.getClient, ctx.getFormat).parseAsync(
        [
          "cancel-actions",
          "ethereum",
          SEAPORT,
          LIVE_ORDER_HASH,
          "--body",
          writeTempJson({ address: ACCOUNT }),
          "--send",
          "--yes",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow("it is on chain 8453, but the request names chain 1")
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("--send prints the steps that ran before a failure", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post
      .mockResolvedValueOnce({ steps: [itemApprovalStep(), signatureStep()] })
      .mockRejectedValueOnce(new Error("API 400"))
    await expect(
      listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        ["actions", "--body", writeTempJson(listBody), "--send", "--yes"],
        { from: "user" },
      ),
    ).rejects.toThrow("Step 2 (createListingsAction) failed: API 400")
    expect(lastJson(ctx.consoleSpy)).toEqual({
      steps: [{ step: 1, action: "itemApprovalAction", hash: "0xhash1" }],
    })
  })

  const offerBody = {
    address: ACCOUNT,
    item: {
      chain: "base",
      contract: "0x3333333333333333333333333333333333333333",
      token_id: "7",
    },
    quantity: 1,
    price: { amount: "0.4", currency: WETH },
  }
  const unlimitedOfferSteps = () => ({
    steps: [
      paymentApprovalStep(CONDUIT, (1n << 256n) - 1n),
      signatureStep(
        "createOfferAction",
        typedDataMessage({ order: offerOrder() }),
      ),
    ],
  })

  it("offers actions --send lowers the API's unlimited approval to what the offer spends", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post
      .mockResolvedValueOnce(unlimitedOfferSteps())
      .mockResolvedValueOnce({ order_hash: "0xoffer" })
    await offersCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["actions", "--body", writeTempJson(offerBody), "--send", "--yes"],
      { from: "user" },
    )
    expect(wallet.sendTransaction.mock.calls[0][0].data).toBe(
      approveCalldata(CONDUIT, 4n * 10n ** 17n),
    )
    expect(ctx.mockClient.post.mock.calls[1][0]).toBe(
      "/api/v2/orders/base/seaport/offers",
    )
  })

  it("offers actions --dry-run shows the lowered approval and that the API asked for unlimited", async () => {
    ctx.mockClient.post.mockResolvedValueOnce(unlimitedOfferSteps())
    await offersCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["actions", "--body", writeTempJson(offerBody), "--dry-run"],
      { from: "user" },
    )
    const summary = lastJson(ctx.consoleSpy) as {
      warnings: string[]
      steps: Array<{ description: string }>
    }
    expect(summary.steps[0].description).toBe(
      `Approve ${CONDUIT} (OpenSea conduit) to spend 0.4 ETH. The allowance is shared with your other open orders in this token, so this purchase or offer can use up what they rely on`,
    )
    expect(summary.warnings).toContain(
      `Step 1: the API asked to approve an unlimited amount of ${WETH}; --send approves exactly 400000000000000000 base units, what the plan spends`,
    )
  })

  it("offers actions --send --allow-unlimited-approval sends the API's approval unchanged", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post
      .mockResolvedValueOnce(unlimitedOfferSteps())
      .mockResolvedValueOnce({ order_hash: "0xoffer" })
    await offersCommand(ctx.getClient, ctx.getFormat).parseAsync(
      [
        "actions",
        "--body",
        writeTempJson(offerBody),
        "--send",
        "--yes",
        "--allow-unlimited-approval",
      ],
      { from: "user" },
    )
    expect(wallet.sendTransaction.mock.calls[0][0].data).toBe(
      approveCalldata(CONDUIT, (1n << 256n) - 1n),
    )
  })

  it("offers fulfillment-actions --send refuses an approval for a token the plan does not spend", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post.mockResolvedValueOnce({
      steps: [
        paymentApprovalStep(CONDUIT, (1n << 256n) - 1n),
        {
          acceptOfferAction: {
            transaction: transaction({ to: SEAPORT }),
            assetIdentifiers: [],
          },
        },
      ],
    })
    ctx.mockClient.get.mockImplementation(async (path: string) =>
      path.startsWith("/api/v2/orders/")
        ? {
            order: {
              protocol_data: { parameters: { ...offerOrder(), counter: "0" } },
            },
          }
        : { symbol: "WETH", decimals: 18 },
    )
    await expect(
      offersCommand(ctx.getClient, ctx.getFormat).parseAsync(
        [
          "fulfillment-actions",
          "--body",
          writeTempJson({
            offer: {
              hash: "0xoffer",
              chain: "base",
              protocol_address: SEAPORT,
            },
            fulfiller: { address: ACCOUNT },
          }),
          "--send",
          "--yes",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow(
      `Refusing step 1 (paymentApprovalAction) approves ${CONDUIT} for ${(1n << 256n) - 1n} base units of ${WETH}, but how much of it the plan spends could not be determined. Pass --allow-unlimited-approval to send it anyway.`,
    )
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("offers actions --send refuses an order whose price differs from the request", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post.mockResolvedValueOnce(unlimitedOfferSteps())
    await expect(
      offersCommand(ctx.getClient, ctx.getFormat).parseAsync(
        [
          "actions",
          "--body",
          writeTempJson({
            ...offerBody,
            price: { amount: "0.5", currency: WETH },
          }),
          "--send",
          "--yes",
          "--allow-unlimited-approval",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow(
      "its total payment is 400000000000000000 base units, but the request asks for 500000000000000000",
    )
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("listings actions --dry-run refuses a listing whose currency decimals are unknown", async () => {
    ctx.mockClient.post.mockResolvedValueOnce({ steps: [signatureStep()] })
    ctx.mockClient.get.mockRejectedValue(new Error("404"))
    const wethBody = {
      ...listBody,
      items: [{ ...listBody.items[0], price: { amount: "1", currency: WETH } }],
    }
    await expect(
      listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        ["actions", "--body", writeTempJson(wethBody), "--dry-run"],
        { from: "user" },
      ),
    ).rejects.toThrow(`the decimals of ${WETH} on base are unknown`)
  })

  it("listings actions --dry-run refuses more than one item and a malformed end_time", async () => {
    await expect(
      listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        [
          "actions",
          "--body",
          writeTempJson({
            ...listBody,
            items: [listBody.items[0], listBody.items[0]],
          }),
          "--dry-run",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow("handle one listing per request")
    await expect(
      listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        [
          "actions",
          "--body",
          writeTempJson({
            ...listBody,
            items: [{ ...listBody.items[0], end_time: "next week" }],
          }),
          "--dry-run",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow("end_time next week is not an ISO 8601 time")
  })

  it("listings actions --dry-run refuses a listing that ends after the requested end_time", async () => {
    ctx.mockClient.post.mockResolvedValueOnce({ steps: [signatureStep()] })
    await expect(
      listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        [
          "actions",
          "--body",
          writeTempJson({
            ...listBody,
            items: [{ ...listBody.items[0], end_time: "2026-01-31T00:00:00Z" }],
          }),
          "--dry-run",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow(
      "it ends at 1769904000, later than the latest end time the request allows (1769817600)",
    )
  })

  it("listings fulfillment-actions --send buys through Seaport with the listed value", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post.mockResolvedValueOnce({ steps: [buyStep()] })
    const body = {
      listing: { hash: "0xorder", chain: "base", protocol_address: SEAPORT },
      fulfiller: { address: ACCOUNT },
    }
    await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["fulfillment-actions", "--body", writeTempJson(body), "--send", "--yes"],
      { from: "user" },
    )
    expect(wallet.sendTransaction).toHaveBeenCalledWith({
      to: SEAPORT,
      data: FULFILL_BASIC_ORDER_CALLDATA,
      value: "1000000000000000000",
      chainId: 8453,
    })
    expect(
      vi.mocked(console.error).mock.calls.map(c => String(c[0])),
    ).toContain(
      `Step 1/1: Buy 1 x 0x3333333333333333333333333333333333333333 #7 for 1 ETH through Seaport; the NFTs go to ${ACCOUNT}, the recipient requested (to ${SEAPORT}, value 1 ETH)`,
    )
  })

  it("offers fulfillment-actions --dry-run summarizes the sale", async () => {
    ctx.mockClient.post.mockResolvedValueOnce({
      steps: [
        itemApprovalStep(),
        {
          acceptOfferAction: {
            transaction: transaction({ to: SEAPORT }),
            assetIdentifiers: [
              {
                contractAddress: {
                  value: "0x3333333333333333333333333333333333333333",
                },
                tokenId: "7",
              },
            ],
          },
        },
      ],
    })
    ctx.mockClient.get.mockImplementation(async (path: string) =>
      path.startsWith("/api/v2/orders/")
        ? {
            order: {
              protocol_data: {
                parameters: { ...offerOrder(), counter: "0" },
              },
            },
          }
        : { symbol: path.includes(WETH) ? "WETH" : "ETH", decimals: 18 },
    )
    const body = {
      offer: { hash: "0xoffer", chain: "base", protocol_address: SEAPORT },
      fulfiller: { address: ACCOUNT },
    }
    await offersCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["fulfillment-actions", "--body", writeTempJson(body), "--dry-run"],
      { from: "user" },
    )
    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      `/api/v2/orders/chain/base/protocol/${SEAPORT}/0xoffer`,
    )
    const summary = lastJson(ctx.consoleSpy) as {
      steps: Array<{ action: string; order?: { proceeds?: string } }>
    }
    expect(summary.steps.map(s => s.action)).toEqual([
      "itemApprovalAction",
      "acceptOfferAction",
    ])
    expect(summary.steps[1].order?.proceeds).toBe(`0.39 WETH to ${ACCOUNT}`)
  })

  it("offers fulfillment-actions --send refuses to sell when the offer's terms cannot be loaded", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post.mockResolvedValueOnce({
      steps: [
        itemApprovalStep(),
        {
          acceptOfferAction: {
            transaction: transaction({ to: SEAPORT }),
            assetIdentifiers: [],
          },
        },
      ],
    })
    ctx.mockClient.get.mockRejectedValue(new Error("404"))
    const body = {
      offer: { hash: "0xoffer", chain: "base", protocol_address: SEAPORT },
      fulfiller: { address: ACCOUNT },
    }
    await expect(
      offersCommand(ctx.getClient, ctx.getFormat).parseAsync(
        [
          "fulfillment-actions",
          "--body",
          writeTempJson(body),
          "--send",
          "--yes",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow(
      "Refusing to accept the offer: its price and fees could not be loaded",
    )
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("--dry-run warns when the accepted offer's terms cannot be loaded", async () => {
    ctx.mockClient.post.mockResolvedValueOnce({
      steps: [
        {
          acceptOfferAction: {
            transaction: transaction({ to: SEAPORT }),
            assetIdentifiers: [],
          },
        },
      ],
    })
    ctx.mockClient.get.mockRejectedValue(new Error("404"))
    const body = {
      offer: { hash: "0xoffer", chain: "base", protocol_address: SEAPORT },
      fulfiller: { address: ACCOUNT },
    }
    await offersCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["fulfillment-actions", "--body", writeTempJson(body), "--dry-run"],
      { from: "user" },
    )
    expect(lastJson(ctx.consoleSpy)).toMatchObject({
      warnings: [
        "Step 1 sells into an offer whose terms could not be loaded; check its price with opensea orders get before sending",
      ],
    })
  })

  it("listings sweep --dry-run reports the API's partial-fill errors as warnings", async () => {
    ctx.mockClient.post.mockResolvedValueOnce({
      steps: [buyStep()],
      errors: [{ message: "1 listing became unavailable" }],
    })
    await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      [
        "sweep",
        "--collection",
        "cool-cats",
        "--max-items",
        "2",
        "--max-price-per-item",
        "1000",
        "--buyer",
        ACCOUNT,
        "--payment-chain",
        "base",
        "--payment-token",
        "0x0000000000000000000000000000000000000000",
        "--dry-run",
      ],
      { from: "user" },
    )
    expect(lastJson(ctx.consoleSpy)).toMatchObject({
      warnings: ["1 listing became unavailable"],
    })
  })

  it("listings sweep --send buys each returned listing through Seaport and prints the hashes", async () => {
    const wallet = createMockWallet()
    wallet.sendTransaction
      .mockResolvedValueOnce({ hash: "0xbuy1" })
      .mockResolvedValueOnce({ hash: "0xbuy2" })
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post.mockResolvedValueOnce({ steps: [buyStep(), buyStep()] })
    await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      [
        "sweep",
        "--collection",
        "cool-cats",
        "--max-items",
        "2",
        "--max-price-per-item",
        "1000000000000000000",
        "--buyer",
        ACCOUNT,
        "--payment-chain",
        "base",
        "--payment-token",
        "0x0000000000000000000000000000000000000000",
        "--send",
        "--yes",
      ],
      { from: "user" },
    )
    expect(ctx.mockClient.post.mock.calls[0][0]).toBe("/api/v2/listings/sweep")
    expect(wallet.sendTransaction.mock.calls).toEqual([
      [
        {
          to: SEAPORT,
          data: FULFILL_BASIC_ORDER_CALLDATA,
          value: "1000000000000000000",
          chainId: 8453,
        },
      ],
      [
        {
          to: SEAPORT,
          data: FULFILL_BASIC_ORDER_CALLDATA,
          value: "1000000000000000000",
          chainId: 8453,
        },
      ],
    ])
    expect(lastJson(ctx.consoleSpy)).toEqual({
      steps: [
        { step: 1, action: "buyItemAction", hash: "0xbuy1" },
        { step: 2, action: "buyItemAction", hash: "0xbuy2" },
      ],
    })
  })

  it("listings cross-chain-fulfill --send refuses a bridge transaction before sending anything", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post.mockResolvedValueOnce({
      transactions: [
        {
          chain: "base",
          to: WETH,
          data: approveCalldata(CONDUIT, 1n),
          value: "0",
        },
        { chain: "base", to: ATTACKER, data: "0x01", value: "0" },
      ],
    })
    await expect(
      listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        [
          "cross-chain-fulfill",
          "--hashes",
          "0xorder",
          "--listing-chain",
          "base",
          "--protocol-address",
          SEAPORT,
          "--fulfiller",
          ACCOUNT,
          "--payment-chain",
          "base",
          "--payment-token",
          WETH,
          "--send",
          "--yes",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow("Refusing transaction 2")
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("orders cancel-actions --send cancels through Seaport", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    ctx.mockClient.post.mockResolvedValueOnce({
      steps: [
        {
          cancelOrdersAction: {
            transaction: transaction({
              to: SEAPORT,
              data: cancelCalldata([LIVE_ORDER]),
            }),
            orderIds: ["0xorder"],
          },
        },
      ],
    })
    await ordersCommand(ctx.getClient, ctx.getFormat).parseAsync(
      [
        "cancel-actions",
        "base",
        SEAPORT,
        LIVE_ORDER_HASH,
        "--body",
        writeTempJson({ address: ACCOUNT }),
        "--send",
        "--yes",
      ],
      { from: "user" },
    )
    expect(wallet.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ to: SEAPORT, chainId: 8453 }),
    )
  })

  it("orders cancel-actions --dry-run names the order by its hash, not the API's internal id", async () => {
    ctx.mockClient.post.mockResolvedValueOnce({
      steps: [
        {
          cancelOrdersAction: {
            transaction: transaction({
              to: SEAPORT,
              data: cancelCalldata([LIVE_ORDER]),
            }),
            orderIds: ["internal-123"],
          },
        },
      ],
    })
    await ordersCommand(ctx.getClient, ctx.getFormat).parseAsync(
      [
        "cancel-actions",
        "base",
        SEAPORT,
        LIVE_ORDER_HASH,
        "--body",
        writeTempJson({ address: ACCOUNT }),
        "--dry-run",
      ],
      { from: "user" },
    )
    const summary = lastJson(ctx.consoleSpy) as {
      steps: { description: string }[]
    }
    expect(summary.steps.map(step => step.description)).toEqual([
      `Cancel order ${LIVE_ORDER_HASH} (order id internal-123) onchain through Seaport`,
    ])
    expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
  })

  it("orders cancel-actions --send refuses calldata that cancels a different order", async () => {
    const wallet = createMockWallet()
    walletMock.createWalletFromEnv.mockReturnValue(wallet)
    const other = { ...LIVE_ORDER, salt: "0x1" }
    ctx.mockClient.post.mockResolvedValueOnce({
      steps: [
        {
          cancelOrdersAction: {
            transaction: transaction({
              to: SEAPORT,
              data: cancelCalldata([other]),
            }),
            orderIds: ["0xorder"],
          },
        },
      ],
    })
    await expect(
      ordersCommand(ctx.getClient, ctx.getFormat).parseAsync(
        [
          "cancel-actions",
          "base",
          SEAPORT,
          LIVE_ORDER_HASH,
          "--body",
          writeTempJson({ address: ACCOUNT }),
          "--send",
          "--yes",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow(`not the requested ${LIVE_ORDER_HASH}`)
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("listings cross-chain-fulfill --dry-run lowers a payment approval to the listings' price", async () => {
    ctx.mockClient.post.mockResolvedValueOnce({
      transactions: [
        {
          chain: "base",
          to: WETH,
          data: approveCalldata(CONDUIT, (1n << 256n) - 1n),
          value: "0",
        },
        {
          chain: "base",
          to: SEAPORT,
          data: FULFILL_BASIC_ORDER_CALLDATA,
          value: "0",
        },
      ],
    })
    const priced = {
      ...LIVE_ORDER,
      consideration: LIVE_ORDER.consideration.map(item => ({
        ...item,
        itemType: 1,
        token: WETH,
      })),
    }
    ctx.mockClient.get.mockImplementation(async (path: string) =>
      path.startsWith("/api/v2/orders/")
        ? { order: { protocol_data: { parameters: priced } } }
        : { symbol: "WETH", decimals: 18 },
    )
    await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      [
        "cross-chain-fulfill",
        "--hashes",
        LIVE_ORDER_HASH,
        "--listing-chain",
        "base",
        "--protocol-address",
        SEAPORT,
        "--fulfiller",
        ACCOUNT,
        "--payment-chain",
        "base",
        "--payment-token",
        WETH,
        "--dry-run",
      ],
      { from: "user" },
    )
    const summary = lastJson(ctx.consoleSpy) as {
      steps: Array<{ description: string }>
    }
    expect(summary.steps[0].description).toBe(
      `Approve ${CONDUIT} (OpenSea conduit) to spend 0.0013 WETH. The allowance is shared with your other open orders in this token, so this purchase or offer can use up what they rely on`,
    )
  })

  it("--send with --rpc-url waits on that RPC between steps, and warns without one", async () => {
    walletMock.createWalletFromEnv.mockReturnValue(createMockWallet())
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "0x2105" })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { status: "0x1" } })),
      )
    ctx.mockClient.post
      .mockResolvedValueOnce({ steps: [itemApprovalStep(), signatureStep()] })
      .mockResolvedValueOnce({ order_hash: "0xorder" })
    await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      [
        "actions",
        "--body",
        writeTempJson(listBody),
        "--send",
        "--yes",
        "--rpc-url",
        "https://rpc.example",
      ],
      { from: "user" },
    )
    expect(fetchSpy.mock.calls.map(c => c[0])).toEqual([
      "https://rpc.example",
      "https://rpc.example",
    ])

    const errors = vi.mocked(console.error)
    errors.mockClear()
    walletMock.createWalletFromEnv.mockReturnValue(createMockWallet())
    ctx.mockClient.post
      .mockResolvedValueOnce({
        steps: [itemApprovalStep(), signatureStep()],
        errors: [{ message: "partial" }],
      })
      .mockResolvedValueOnce({ order_hash: "0xorder" })
    await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
      ["actions", "--body", writeTempJson(listBody), "--send", "--yes"],
      { from: "user" },
    )
    expect(errors.mock.calls.map(c => String(c[0]))).toContain(
      "No RPC URL: later steps will not wait for earlier transactions to confirm, so a signed order is posted before its approval confirms. Pass --rpc-url to wait.",
    )
  })

  describe("confirmation", () => {
    const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY")
    const setTTY = (value: boolean) =>
      Object.defineProperty(process.stdin, "isTTY", {
        value,
        configurable: true,
      })

    afterEach(() => {
      if (original) Object.defineProperty(process.stdin, "isTTY", original)
      else delete (process.stdin as { isTTY?: boolean }).isTTY
      readlineMock.question.mockReset()
    })

    const fulfillBody = () =>
      writeTempJson({
        listing: { hash: "0xorder", chain: "base", protocol_address: SEAPORT },
        fulfiller: { address: ACCOUNT },
      })

    it("refuses --send without --yes when stdin is not a terminal, before opening the wallet", async () => {
      setTTY(false)
      await expect(
        listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
          ["fulfillment-actions", "--body", fulfillBody(), "--send"],
          { from: "user" },
        ),
      ).rejects.toThrow("--send needs --yes when stdin is not a terminal")
      expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
      expect(ctx.mockClient.post).not.toHaveBeenCalled()
    })

    const buyDigest = () => planDigest(planActionSteps([buyStep()], ACCOUNT))

    it("runs without a prompt when stdin is not a terminal, --yes is passed and the plan digest matches", async () => {
      setTTY(false)
      const wallet = createMockWallet()
      walletMock.createWalletFromEnv.mockReturnValue(wallet)
      ctx.mockClient.post.mockResolvedValueOnce({ steps: [buyStep()] })
      await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        [
          "fulfillment-actions",
          "--body",
          fulfillBody(),
          "--send",
          "--yes",
          "--expect-plan",
          buyDigest().toUpperCase(),
        ],
        { from: "user" },
      )
      expect(readlineMock.question).not.toHaveBeenCalled()
      expect(wallet.sendTransaction).toHaveBeenCalledTimes(1)
    })

    it("refuses --yes without --expect-plan when stdin is not a terminal, before any request", async () => {
      setTTY(false)
      await expect(
        listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
          ["fulfillment-actions", "--body", fulfillBody(), "--send", "--yes"],
          { from: "user" },
        ),
      ).rejects.toThrow(
        "--send --yes without a terminal also needs --expect-plan <digest>",
      )
      expect(ctx.mockClient.post).not.toHaveBeenCalled()
      expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
    })

    it("refuses a plan whose digest differs from --expect-plan, before opening the wallet", async () => {
      setTTY(false)
      ctx.mockClient.post.mockResolvedValueOnce({
        steps: [buyStep({ value: "2000000000000000000" })],
      })
      await expect(
        listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
          [
            "fulfillment-actions",
            "--body",
            fulfillBody(),
            "--send",
            "--yes",
            "--expect-plan",
            buyDigest(),
          ],
          { from: "user" },
        ),
      ).rejects.toThrow("The plan changed since it was approved")
      expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
    })

    it("--dry-run prints the plan digest that --expect-plan takes", async () => {
      ctx.mockClient.post.mockResolvedValueOnce({ steps: [buyStep()] })
      await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        ["fulfillment-actions", "--body", fulfillBody(), "--dry-run"],
        { from: "user" },
      )
      expect(lastJson(ctx.consoleSpy)).toMatchObject({
        plan_digest: buyDigest(),
      })
      expect(
        vi.mocked(console.error).mock.calls.map(c => String(c[0])),
      ).toContain(`Plan digest: ${buyDigest()}`)
    })

    it("refuses --send together with --dry-run", async () => {
      await expect(
        listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
          [
            "fulfillment-actions",
            "--body",
            fulfillBody(),
            "--send",
            "--dry-run",
          ],
          { from: "user" },
        ),
      ).rejects.toThrow("Pass either --dry-run or --send, not both.")
      expect(ctx.mockClient.post).not.toHaveBeenCalled()
    })

    it("asks on a terminal and sends after yes", async () => {
      setTTY(true)
      readlineMock.question.mockResolvedValue(" Yes ")
      const wallet = createMockWallet()
      walletMock.createWalletFromEnv.mockReturnValue(wallet)
      ctx.mockClient.post.mockResolvedValueOnce({ steps: [buyStep()] })
      await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        ["fulfillment-actions", "--body", fulfillBody(), "--send"],
        { from: "user" },
      )
      expect(readlineMock.question).toHaveBeenCalledWith(
        "Sign and send 1 step? [y/N] ",
      )
      expect(wallet.sendTransaction).toHaveBeenCalledTimes(1)
    })

    it("asks on a terminal and sends nothing after any other answer", async () => {
      setTTY(true)
      readlineMock.question.mockResolvedValue("")
      const wallet = createMockWallet()
      walletMock.createWalletFromEnv.mockReturnValue(wallet)
      ctx.mockClient.post.mockResolvedValueOnce({
        steps: [itemApprovalStep(), signatureStep()],
      })
      await expect(
        listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
          ["actions", "--body", writeTempJson(listBody), "--send"],
          { from: "user" },
        ),
      ).rejects.toThrow("Cancelled. Nothing was signed or sent.")
      expect(readlineMock.question).toHaveBeenCalledWith(
        "Sign and send 2 steps? [y/N] ",
      )
      expect(wallet.sendTransaction).not.toHaveBeenCalled()
      expect(wallet.signTypedData).not.toHaveBeenCalled()
    })

    it("skips the prompt on a terminal when --yes is passed", async () => {
      setTTY(true)
      const wallet = createMockWallet()
      walletMock.createWalletFromEnv.mockReturnValue(wallet)
      ctx.mockClient.post.mockResolvedValueOnce({ steps: [buyStep()] })
      await listingsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        ["fulfillment-actions", "--body", fulfillBody(), "--send", "--yes"],
        { from: "user" },
      )
      expect(readlineMock.question).not.toHaveBeenCalled()
      expect(wallet.sendTransaction).toHaveBeenCalledTimes(1)
    })
  })
})
