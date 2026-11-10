import { describe, expect, it, vi } from "vitest"
import {
  normalizeSeaportOrder,
  planActionSteps,
  planSwapTransactions,
} from "../../src/marketplace/guard.js"
import {
  type CurrencyLookup,
  formatUnits,
  summarizePlan,
} from "../../src/marketplace/summary.js"
import {
  ACCOUNT,
  approveCalldata,
  BASE,
  buyStep,
  CONDUIT,
  cancelCalldata,
  FEE_RECIPIENT,
  itemApprovalStep,
  LISTING_REQUESTED,
  LIVE_ORDER,
  LIVE_ORDER_HASH,
  listingOrder,
  NFT,
  OFFER_REQUESTED,
  offerOrder,
  paymentApprovalStep,
  plannedSignature,
  SEAPORT,
  setApprovalForAllCalldata,
  signatureStep,
  transaction,
  typedDataMessage,
  WETH,
  ZERO,
} from "./fixtures.js"

const lookup: CurrencyLookup = vi.fn(async (_chainId, address) => {
  if (address === ZERO) return { symbol: "ETH", decimals: 18 }
  if (address === WETH) return { symbol: "WETH", decimals: 18 }
  return undefined
})

describe("formatUnits", () => {
  it("formats whole, fractional, zero and negative amounts", () => {
    expect(formatUnits("1000000000000000000", 18)).toBe("1")
    expect(formatUnits(25_000_000_000_000_000n, 18)).toBe("0.025")
    expect(formatUnits("89000000", 6)).toBe("89")
    expect(formatUnits("1", 6)).toBe("0.000001")
    expect(formatUnits("0", 18)).toBe("0")
    expect(formatUnits(-1500n, 3)).toBe("-1.5")
  })
})

const SHARED =
  "The allowance is shared with your other open orders in this token, so this purchase or offer can use up what they rely on"

describe("summarizePlan", () => {
  it("summarizes a listing: approval, item, price, fees, proceeds and expiry", async () => {
    const steps = planActionSteps(
      [itemApprovalStep(), signatureStep()],
      ACCOUNT,
      { requestedOrder: LISTING_REQUESTED },
    )
    const summary = await summarizePlan(steps, ACCOUNT, lookup)

    expect(summary.account).toBe(ACCOUNT)
    expect(summary.to_addresses).toEqual([NFT])
    expect(summary.steps[0]).toEqual({
      step: 1,
      action: "itemApprovalAction",
      type: "transaction",
      chain_id: BASE,
      description: `Approve ${CONDUIT} (OpenSea conduit) to transfer all your tokens in ${NFT}`,
      to: NFT,
      value: "0",
    })
    expect(summary.steps[1]).toMatchObject({
      type: "signature",
      verifying_contract: SEAPORT,
      description: `Sign a Seaport listing of 1 x ${NFT} #7 for 1 ETH, then post it to OpenSea`,
      order: {
        side: "listing",
        items: [`1 x ${NFT} #7`],
        price: "1 ETH",
        fees: [`0.025 ETH to ${FEE_RECIPIENT} (2.5%, OpenSea fee)`],
        proceeds: `0.975 ETH to ${ACCOUNT}`,
        starts: "2026-01-01T00:00:00.000Z",
        expires: "2026-02-01T00:00:00.000Z",
      },
    })
    expect(summary.warnings).toBeUndefined()
  })

  it("summarizes an offer with its payment token, fee and NFT recipient", async () => {
    const steps = planActionSteps(
      [
        paymentApprovalStep(),
        signatureStep(
          "createOfferAction",
          typedDataMessage({ order: offerOrder() }),
        ),
      ],
      ACCOUNT,
      { requestedOrder: OFFER_REQUESTED },
    )
    const summary = await summarizePlan(steps, ACCOUNT, lookup)
    expect(summary.steps[0].description).toBe(
      `Approve ${CONDUIT} (OpenSea conduit) to spend 1 WETH. ${SHARED}`,
    )
    expect(summary.steps[1].order).toMatchObject({
      side: "offer",
      items: [`1 x ${NFT} #7`],
      price: "0.4 WETH",
      fees: [`0.01 WETH to ${FEE_RECIPIENT} (2.5%, OpenSea fee)`],
      recipient: ACCOUNT,
    })
  })

  it("summarizes a buy with its price and native value", async () => {
    const summary = await summarizePlan(
      planActionSteps([buyStep()], ACCOUNT),
      ACCOUNT,
      lookup,
    )
    expect(summary.steps[0]).toMatchObject({
      description: `Buy 1 x ${NFT} #7 for 1 ETH through Seaport; the NFTs go to ${ACCOUNT}, the recipient requested`,
      to: SEAPORT,
      value: "1 ETH",
    })
  })

  it("names a requested NFT recipient other than the buyer", async () => {
    const summary = await summarizePlan(
      planActionSteps([buyStep()], ACCOUNT),
      ACCOUNT,
      lookup,
      { recipient: FEE_RECIPIENT },
    )
    expect(summary.steps[0].description).toBe(
      `Buy 1 x ${NFT} #7 for 1 ETH through Seaport; the NFTs go to ${FEE_RECIPIENT}, the recipient requested`,
    )
  })

  it("names OpenSea's fee and labels any other non-seller payment as another payout", async () => {
    const order = listingOrder({
      consideration: [
        {
          itemType: 0,
          token: ZERO,
          identifierOrCriteria: "0",
          startAmount: "900000000000000000",
          endAmount: "900000000000000000",
          recipient: ACCOUNT,
        },
        {
          itemType: 0,
          token: ZERO,
          identifierOrCriteria: "0",
          startAmount: "10000000000000000",
          endAmount: "10000000000000000",
          recipient: FEE_RECIPIENT,
        },
        {
          itemType: 0,
          token: ZERO,
          identifierOrCriteria: "0",
          startAmount: "90000000000000000",
          endAmount: "90000000000000000",
          recipient: NFT,
        },
      ],
    })
    const summary = await summarizePlan(
      [plannedSignature(order)],
      ACCOUNT,
      lookup,
    )
    expect(summary.steps[0].order?.fees).toEqual([
      `0.01 ETH to ${FEE_RECIPIENT} (1%, OpenSea fee)`,
      `0.09 ETH to ${NFT} (9%, other payout)`,
    ])
  })

  it("computes each fee's percentage against the same token's total only", async () => {
    const order = listingOrder({
      consideration: [
        {
          itemType: 0,
          token: ZERO,
          identifierOrCriteria: "0",
          startAmount: "1000000000000000000",
          endAmount: "1000000000000000000",
          recipient: ACCOUNT,
        },
        {
          itemType: 1,
          token: WETH,
          identifierOrCriteria: "0",
          startAmount: "100",
          endAmount: "100",
          recipient: ACCOUNT,
        },
        {
          itemType: 1,
          token: WETH,
          identifierOrCriteria: "0",
          startAmount: "100",
          endAmount: "100",
          recipient: FEE_RECIPIENT,
        },
      ],
    })
    const summary = await summarizePlan(
      [plannedSignature(order)],
      ACCOUNT,
      lookup,
    )
    expect(summary.steps[0].order?.fees).toEqual([
      `0.0000000000000001 WETH to ${FEE_RECIPIENT} (50%, OpenSea fee)`,
    ])
  })

  it("describes accepts, cancels, unlimited approvals and revokes", async () => {
    const steps = planActionSteps(
      [
        {
          acceptOfferAction: {
            transaction: transaction({ to: SEAPORT }),
            assetIdentifiers: [
              { contractAddress: { value: NFT }, tokenId: "9" },
            ],
          },
        },
        {
          cancelOrdersAction: {
            transaction: transaction({
              to: SEAPORT,
              data: cancelCalldata([LIVE_ORDER]),
            }),
            orderIds: ["0xorder"],
          },
        },
        paymentApprovalStep(CONDUIT, (1n << 256n) - 1n),
        {
          itemApprovalAction: {
            ...itemApprovalStep().itemApprovalAction,
            transaction: transaction({
              to: NFT,
              data: approveCalldata(SEAPORT, 7n),
            }),
          },
        },
        {
          itemApprovalAction: {
            ...itemApprovalStep().itemApprovalAction,
            transaction: transaction({
              to: NFT,
              data: setApprovalForAllCalldata(CONDUIT, false),
            }),
          },
        },
      ],
      ACCOUNT,
      { cancelledOrders: [LIVE_ORDER_HASH] },
    )
    const summary = await summarizePlan(steps, ACCOUNT, lookup)
    const descriptions = summary.steps.map(s => s.description)
    expect(descriptions).toEqual([
      `Sell ${NFT} #9 into the offer through Seaport`,
      `Cancel order ${LIVE_ORDER_HASH} (order id 0xorder) onchain through Seaport`,
      `Approve ${CONDUIT} (OpenSea conduit) to spend an unlimited amount of ${WETH}. ${SHARED}`,
      `Approve ${SEAPORT.toLowerCase()} (Seaport) to transfer ${NFT} #7`,
      `Revoke ${CONDUIT} (OpenSea conduit)'s approval for ${NFT}`,
    ])
    expect(summary.steps.map(st => st.unlimited_approval)).toEqual([
      undefined,
      undefined,
      true,
      undefined,
      undefined,
    ])
    expect(summary.warnings).toEqual([
      "Step 1 sells into an offer whose terms could not be loaded; check its price with opensea orders get before sending",
      `Step 3 approves ${CONDUIT} to spend an unlimited amount of ${WETH}`,
    ])
  })

  it("names a cancel by hash alone without internal ids, and by internal id without matched hashes", async () => {
    const plan = (orderIds?: string[]) =>
      planActionSteps(
        [
          {
            cancelOrdersAction: {
              transaction: transaction({
                to: SEAPORT,
                data: cancelCalldata([LIVE_ORDER]),
              }),
              ...(orderIds ? { orderIds } : {}),
            },
          },
        ],
        ACCOUNT,
        { cancelledOrders: [LIVE_ORDER_HASH] },
      )
    const descriptionOf = async (steps: ReturnType<typeof plan>) =>
      (await summarizePlan(steps, ACCOUNT, lookup)).steps[0].description

    expect(await descriptionOf(plan())).toBe(
      `Cancel order ${LIVE_ORDER_HASH} onchain through Seaport`,
    )

    const unmatched = plan(["internal-7"])
    for (const step of unmatched) {
      if (step.type === "transaction") delete step.cancelledOrderHashes
    }
    expect(await descriptionOf(unmatched)).toBe(
      "Cancel order internal-7 onchain through Seaport",
    )
  })

  it("shows the accepted offer's price, fees and the seller's proceeds", async () => {
    const steps = planActionSteps(
      [
        {
          acceptOfferAction: {
            transaction: transaction({ to: SEAPORT }),
            assetIdentifiers: [
              { contractAddress: { value: NFT }, tokenId: "7" },
            ],
          },
        },
      ],
      ACCOUNT,
    )
    const acceptedOffer = normalizeSeaportOrder({
      ...offerOrder(),
      offerer: FEE_RECIPIENT,
      counter: "0",
    })
    const summary = await summarizePlan(steps, ACCOUNT, lookup, {
      acceptedOffer,
    })
    expect(summary.steps[0]).toMatchObject({
      description: `Sell ${NFT} #7 into the offer for 0.4 WETH through Seaport`,
      order: {
        side: "offer",
        price: "0.4 WETH",
        fees: [`0.01 WETH to ${FEE_RECIPIENT} (2.5%, OpenSea fee)`],
        proceeds: `0.39 WETH to ${ACCOUNT}`,
      },
    })
    expect(summary.warnings).toBeUndefined()
  })

  it("shows raw base units for a currency the lookup cannot resolve, and a failing lookup is not fatal", async () => {
    const unknownToken = "0x5555555555555555555555555555555555555555"
    const failing: CurrencyLookup = vi.fn(async () => {
      throw new Error("404")
    })
    const order = listingOrder({
      consideration: [
        {
          itemType: 1,
          token: unknownToken,
          identifierOrCriteria: "0",
          startAmount: "100",
          endAmount: "100",
          recipient: ACCOUNT,
        },
      ],
    })
    const summary = await summarizePlan(
      [plannedSignature(order)],
      ACCOUNT,
      failing,
    )
    expect(summary.steps[0].order?.price).toBe(
      `100 base units of ${unknownToken}`,
    )
  })

  it("falls back to 18 decimals for the native token when the lookup returns nothing", async () => {
    const summary = await summarizePlan(
      planActionSteps([buyStep({ value: "2000000000000000000" })], ACCOUNT),
      ACCOUNT,
      async () => undefined,
    )
    expect(summary.steps[0].value).toBe("2 native token")
  })

  it("shows a price that changes over the order's life", async () => {
    const order = listingOrder({
      consideration: [
        {
          itemType: 0,
          token: ZERO,
          identifierOrCriteria: "0",
          startAmount: "1950000000000000000",
          endAmount: "975000000000000000",
          recipient: ACCOUNT,
        },
        {
          itemType: 0,
          token: ZERO,
          identifierOrCriteria: "0",
          startAmount: "50000000000000000",
          endAmount: "25000000000000000",
          recipient: FEE_RECIPIENT,
        },
      ],
    })
    const summary = await summarizePlan(
      [plannedSignature(order)],
      ACCOUNT,
      lookup,
    )
    expect(summary.steps[0].order).toMatchObject({
      price: "2 ETH, changing to 1 ETH by expiry",
      fees: [
        `0.05 ETH, changing to 0.025 ETH by expiry, to ${FEE_RECIPIENT} (2.5%, OpenSea fee)`,
      ],
      proceeds: `1.95 ETH, changing to 0.975 ETH by expiry, to ${ACCOUNT}`,
    })
  })

  it("shows a seller's proceeds as a range when the accepted offer's amounts change", async () => {
    const base = offerOrder()
    const acceptedOffer = normalizeSeaportOrder({
      ...base,
      offerer: FEE_RECIPIENT,
      counter: "0",
      offer: [
        {
          itemType: 1,
          token: WETH,
          identifierOrCriteria: "0",
          startAmount: "400000000000000000",
          endAmount: "200000000000000000",
        },
      ],
    })
    const steps = planActionSteps(
      [
        {
          acceptOfferAction: {
            transaction: transaction({ to: SEAPORT }),
            assetIdentifiers: [
              { contractAddress: { value: NFT }, tokenId: "7" },
            ],
          },
        },
      ],
      ACCOUNT,
    )
    const summary = await summarizePlan(steps, ACCOUNT, lookup, {
      acceptedOffer,
    })
    expect(summary.steps[0].order?.proceeds).toBe(
      `0.39 WETH, changing to 0.19 WETH by expiry, to ${ACCOUNT}`,
    )
  })

  it("carries warnings and lists each transaction 'to' once", async () => {
    const steps = planSwapTransactions(
      [
        {
          chain: "base",
          to: WETH,
          data: approveCalldata(CONDUIT, 1n),
          value: "0",
        },
        { chain: "base", to: SEAPORT, data: "0xfb0f3ee101", value: "0" },
        { chain: "base", to: SEAPORT, data: "0xfb0f3ee102", value: "0" },
      ],
      ACCOUNT,
      WETH,
    )
    const summary = await summarizePlan(steps, ACCOUNT, lookup, {
      warnings: ["1 listing became unavailable"],
    })
    expect(summary.to_addresses).toEqual([WETH, SEAPORT])
    expect(summary.warnings).toEqual(["1 listing became unavailable"])
    expect(summary.steps[1].description).toBe(
      `Fulfill through Seaport; the NFTs go to ${ACCOUNT}, the recipient requested`,
    )
  })

  it("describes a criteria offer and keeps an out-of-range expiry raw", async () => {
    const base = offerOrder()
    const order = {
      ...base,
      endTime: "99999999999999999999",
      consideration: [
        {
          itemType: 4,
          token: NFT,
          identifierOrCriteria: "0",
          startAmount: "1",
          endAmount: "1",
          recipient: ACCOUNT,
        },
      ],
    }
    const summary = await summarizePlan(
      [plannedSignature(order, "offer")],
      ACCOUNT,
      lookup,
    )
    expect(summary.steps[0].order).toMatchObject({
      items: [`1 x any token in ${NFT} matching criteria 0`],
      fees: [],
      expires: "99999999999999999999",
    })
  })
})
