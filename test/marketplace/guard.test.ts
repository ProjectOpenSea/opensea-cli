import {
  Chain,
  getChainId,
  getDefaultConduit,
  getFeeRecipient,
  getSeaportAddress,
  getSignedZone,
} from "@opensea/sdk"
import { describe, expect, it } from "vitest"
import {
  checkOrderAgainstRequest,
  checkOrderTypedData,
  checkTransaction,
  clampApprovals,
  contractsForChain,
  decodeApproval,
  decodeCancelCalldata,
  describeAddress,
  excessiveApprovals,
  signedZoneExtraData as locateSignedZoneExtraData,
  MarketplaceGuardError,
  normalizeSeaportOrder,
  parseJsonPreservingIntegers,
  parseUnits,
  planActionSteps,
  planDigest,
  planSwapTransactions,
  seaportOrderHash,
} from "../../src/marketplace/guard.js"
import type { SignTypedDataRequest } from "../../src/wallet/index.js"
import {
  ACCOUNT,
  ALT_SEAPORT,
  ATTACKER,
  approveCalldata,
  BASE,
  BIG_COUNTER,
  buyStep,
  CANCEL_CALLDATA,
  CONDUIT,
  cancelCalldata,
  FEE_RECIPIENT,
  FULFILL_BASIC_ORDER_CALLDATA,
  fulfillAdvancedOrderCalldata,
  fulfillAvailableAdvancedOrdersCalldata,
  itemApprovalStep,
  LISTING_REQUESTED,
  LIVE_ORDER,
  LIVE_ORDER_HASH,
  listingOrder,
  NFT,
  OFFER_REQUESTED,
  OTHER,
  offerOrder,
  paymentApprovalStep,
  plannedSignature,
  SEAPORT,
  SEAPORT_TYPES,
  SIGNED_ZONE,
  setApprovalForAllCalldata,
  signatureStep,
  signedZoneExtraData,
  transaction,
  typedDataMessage,
  WETH,
  ZERO,
} from "./fixtures.js"

const GUNZILLA = 43419
const ABSTRACT = 2741
const CONDUIT_2 = "0x963f00d3ff000064ffcba824b800c0000000c300"
const UNKNOWN_CHAIN = 999_999

const SDK_EVM_CHAINS = (Object.values(Chain) as Chain[]).flatMap(chain => {
  try {
    return [{ chain, chainId: Number(getChainId(chain)) }]
  } catch {
    return []
  }
})

describe("per-chain allowlist", () => {
  it("covers every EVM chain in @opensea/sdk with that chain's Seaport and conduit", () => {
    expect(SDK_EVM_CHAINS.length).toBeGreaterThan(20)
    for (const { chain, chainId } of SDK_EVM_CHAINS) {
      expect(contractsForChain(chainId)).toEqual({
        seaport: getSeaportAddress(chain).toLowerCase(),
        conduit: getDefaultConduit(chain).address.toLowerCase(),
        feeRecipient: getFeeRecipient(chain).toLowerCase(),
        signedZone: getSignedZone(chain).toLowerCase(),
      })
    }
  })

  it("accepts a Seaport call and a conduit approval on every SDK chain", () => {
    for (const { chain, chainId } of SDK_EVM_CHAINS) {
      expect(
        checkTransaction(
          {
            label: chain,
            to: getSeaportAddress(chain),
            data: FULFILL_BASIC_ORDER_CALLDATA,
            value: "1",
            chainId,
          },
          ACCOUNT,
        ),
      ).toBeUndefined()
      expect(
        checkTransaction(
          {
            label: chain,
            to: NFT,
            data: setApprovalForAllCalldata(
              getDefaultConduit(chain).address,
              true,
            ),
            value: "0",
            chainId,
            approves: NFT,
          },
          ACCOUNT,
        )?.method,
      ).toBe("setApprovalForAll")
    }
  })

  it("pins the literal Seaport and conduit addresses for a few chains", () => {
    expect(contractsForChain(1)).toMatchObject({
      seaport: "0x0000000000000068f116a894984e2db1123eb395",
      conduit: "0x1e0049783f008a0085193e00003d00cd54003c71",
      feeRecipient: "0x0000a26b00c1f0df003000390027140000faa719",
    })
    expect(contractsForChain(8453)).toMatchObject({
      seaport: "0x0000000000000068f116a894984e2db1123eb395",
      conduit: "0x1e0049783f008a0085193e00003d00cd54003c71",
    })
    expect(contractsForChain(2741)).toMatchObject({
      seaport: "0x0000000000000068f116a894984e2db1123eb395",
      conduit: "0x963f00d3ff000064ffcba824b800c0000000c300",
    })
    expect(contractsForChain(43419)).toMatchObject({
      seaport: "0x00000000006687982678b03100b9bdc8be440814",
      conduit: "0x00000000001566479594a2e05532d81afa09bc52",
      feeRecipient: "0xd9f68d28e451a83affdb7c71cc2c20552555b07f",
    })
  })

  it("has no entry for a chain the SDK does not know", () => {
    expect(contractsForChain(UNKNOWN_CHAIN)).toBeUndefined()
  })

  it("describes addresses case-insensitively, on their own chain only", () => {
    expect(describeAddress(SEAPORT.toLowerCase(), BASE)).toBe("Seaport")
    expect(
      describeAddress(CONDUIT.toUpperCase().replace("0X", "0x"), BASE),
    ).toBe("OpenSea conduit")
    expect(describeAddress(ATTACKER, BASE)).toBeUndefined()
    expect(describeAddress(SEAPORT, GUNZILLA)).toBeUndefined()
    expect(describeAddress(SEAPORT, UNKNOWN_CHAIN)).toBeUndefined()
  })
})

describe("decodeApproval", () => {
  it("decodes approve", () => {
    expect(decodeApproval(approveCalldata(CONDUIT, 5n))).toEqual({
      method: "approve",
      spender: CONDUIT,
      amount: "5",
    })
  })

  it("decodes setApprovalForAll true and false", () => {
    expect(decodeApproval(setApprovalForAllCalldata(CONDUIT, true))).toEqual({
      method: "setApprovalForAll",
      spender: CONDUIT,
      approved: true,
    })
    expect(
      decodeApproval(setApprovalForAllCalldata(CONDUIT, false))?.approved,
    ).toBe(false)
  })

  it("rejects other selectors, trailing bytes, dirty address words and non-bool flags", () => {
    expect(
      decodeApproval(
        approveCalldata(CONDUIT, 5n).replace("095ea7b3", "a9059cbb"),
      ),
    ).toBeUndefined()
    expect(decodeApproval(`${approveCalldata(CONDUIT, 5n)}00`)).toBeUndefined()
    const dirty = approveCalldata(CONDUIT, 5n).replace(
      /^0x095ea7b30/,
      "0x095ea7b31",
    )
    expect(decodeApproval(dirty)).toBeUndefined()
    const flagTwo = `${setApprovalForAllCalldata(CONDUIT, true).slice(0, -1)}2`
    expect(decodeApproval(flagTwo)).toBeUndefined()
  })
})

describe("checkTransaction", () => {
  const seaportCall = {
    label: "step 1 (buyItemAction)",
    to: SEAPORT,
    data: FULFILL_BASIC_ORDER_CALLDATA,
    value: "1000",
    chainId: BASE,
  }

  it("allows a Seaport call to the chain's own deployment", () => {
    expect(checkTransaction(seaportCall, ACCOUNT)).toBeUndefined()
    expect(
      checkTransaction(
        { ...seaportCall, to: ALT_SEAPORT, chainId: GUNZILLA },
        ACCOUNT,
      ),
    ).toBeUndefined()
  })

  it("refuses a Seaport address that belongs to another chain", () => {
    expect(() =>
      checkTransaction({ ...seaportCall, to: ALT_SEAPORT }, ACCOUNT),
    ).toThrow(`'to' ${ALT_SEAPORT} is not Seaport on chain 8453`)
    expect(() =>
      checkTransaction({ ...seaportCall, chainId: GUNZILLA }, ACCOUNT),
    ).toThrow("is not Seaport on chain 43419")
  })

  it("refuses any transaction on a chain the SDK does not know", () => {
    expect(() =>
      checkTransaction({ ...seaportCall, chainId: UNKNOWN_CHAIN }, ACCOUNT),
    ).toThrow(
      "Refusing step 1 (buyItemAction): --send does not support chain 999999 yet; run without --send",
    )
  })

  it("refuses a non-approval call to anything but Seaport", () => {
    expect(() =>
      checkTransaction({ ...seaportCall, to: CONDUIT }, ACCOUNT),
    ).toThrow(/'to' 0x1e00.* is not Seaport/)
  })

  it("allows every Seaport fulfillment function for a buy and only cancel functions for a cancel", () => {
    for (const selector of [
      "0x00000000",
      "0xfb0f3ee1",
      "0xb3a34c4c",
      "0xe7acab24",
      "0xed98a574",
      "0x87201b41",
      "0xa8174404",
      "0xf2d12b12",
    ]) {
      expect(
        checkTransaction({ ...seaportCall, data: `${selector}00` }, ACCOUNT),
      ).toBeUndefined()
    }
    expect(
      checkTransaction(
        { ...seaportCall, data: CANCEL_CALLDATA, seaportCall: "cancel" },
        ACCOUNT,
      ),
    ).toBeUndefined()
  })

  it("refuses incrementCounter, which would invalidate every open order of the account", () => {
    expect(() =>
      checkTransaction(
        { ...seaportCall, data: "0x5b34b966", seaportCall: "cancel" },
        ACCOUNT,
      ),
    ).toThrow(
      "selector 0x5b34b966, which is not one of the cancel functions (cancel)",
    )
  })

  it("refuses a Seaport function that does not match the step", () => {
    expect(() =>
      checkTransaction({ ...seaportCall, data: CANCEL_CALLDATA }, ACCOUNT),
    ).toThrow(
      "it calls Seaport with selector 0xfd9f1e10, which is not one of the fulfillment functions",
    )
    expect(() =>
      checkTransaction(
        {
          ...seaportCall,
          data: FULFILL_BASIC_ORDER_CALLDATA,
          seaportCall: "cancel",
        },
        ACCOUNT,
      ),
    ).toThrow("selector 0xfb0f3ee1, which is not one of the cancel functions")
    expect(() =>
      checkTransaction({ ...seaportCall, data: "0x88147732" }, ACCOUNT),
    ).toThrow("selector 0x88147732")
    expect(() =>
      checkTransaction({ ...seaportCall, data: "0x" }, ACCOUNT),
    ).toThrow("selector (none)")
  })

  it("refuses a cancel step that calls a fulfillment function", () => {
    expect(() =>
      planActionSteps(
        [
          {
            cancelOrdersAction: {
              transaction: transaction({ to: SEAPORT }),
              orderIds: ["0xorder"],
            },
          },
        ],
        ACCOUNT,
      ),
    ).toThrow(
      "Refusing step 1 (cancelOrdersAction): it calls Seaport with selector 0xfb0f3ee1",
    )
  })

  it("refuses a transaction built for another sender", () => {
    expect(() =>
      checkTransaction({ ...seaportCall, from: OTHER }, ACCOUNT),
    ).toThrow(`it is built for ${OTHER}, not ${ACCOUNT}`)
  })

  it("refuses a 'to' that is not an EVM address", () => {
    expect(() =>
      checkTransaction({ ...seaportCall, to: "So11111111" }, ACCOUNT),
    ).toThrow(MarketplaceGuardError)
  })

  const approval = {
    label: "step 1 (itemApprovalAction)",
    to: NFT,
    data: setApprovalForAllCalldata(CONDUIT, true),
    value: "0",
    chainId: BASE,
    approves: NFT,
  }

  it("allows an approval of a conduit or Seaport sent to the approved contract", () => {
    expect(checkTransaction(approval, ACCOUNT)).toMatchObject({
      method: "setApprovalForAll",
      spender: CONDUIT,
    })
    expect(
      checkTransaction(
        { ...approval, data: setApprovalForAllCalldata(SEAPORT, true) },
        ACCOUNT,
      )?.spender,
    ).toBe(SEAPORT.toLowerCase())
  })

  it("refuses an approval sent to a contract other than the one it names", () => {
    expect(() => checkTransaction({ ...approval, to: WETH }, ACCOUNT)).toThrow(
      "is not 0x3333333333333333333333333333333333333333",
    )
  })

  it("refuses an approval of a conduit that belongs to another chain", () => {
    expect(() =>
      checkTransaction(
        { ...approval, data: setApprovalForAllCalldata(CONDUIT_2, true) },
        ACCOUNT,
      ),
    ).toThrow(
      `it approves ${CONDUIT_2}, which is neither Seaport nor an OpenSea conduit on chain 8453`,
    )
    expect(
      checkTransaction(
        {
          ...approval,
          chainId: ABSTRACT,
          data: setApprovalForAllCalldata(CONDUIT_2, true),
        },
        ACCOUNT,
      )?.spender,
    ).toBe(CONDUIT_2)
  })

  it("refuses an approval of any other operator", () => {
    expect(() =>
      checkTransaction(
        { ...approval, data: setApprovalForAllCalldata(ATTACKER, true) },
        ACCOUNT,
      ),
    ).toThrow(`it approves ${ATTACKER}, which is neither Seaport nor`)
  })

  it("refuses an approval step whose calldata is not an approval", () => {
    expect(() =>
      checkTransaction({ ...approval, data: "0xdeadbeef" }, ACCOUNT),
    ).toThrow("not an approve or setApprovalForAll call")
  })

  it("refuses an approval that sends native value, at the 1 wei boundary", () => {
    expect(() =>
      checkTransaction({ ...approval, value: "1" }, ACCOUNT),
    ).toThrow("must not send native value")
  })
})

describe("checkOrderTypedData", () => {
  const typedData = (
    overrides: Partial<{
      types: Record<string, unknown>
      verifyingContract: string
      chainId: number
      primaryType: string
      order: Record<string, unknown>
    }> = {},
  ) =>
    parseJsonPreservingIntegers(
      typedDataMessage(overrides),
    ) as SignTypedDataRequest
  const options = { label: "step 2", chainId: BASE, account: ACCOUNT }

  it("returns the normalized order with the exact counter", () => {
    const order = checkOrderTypedData(typedData(), options)
    expect(order.counter).toBe(BIG_COUNTER)
    expect(order.offer[0]).toEqual({
      itemType: 2,
      token: NFT,
      identifierOrCriteria: "7",
      startAmount: "1",
      endAmount: "1",
    })
    expect(order.consideration[1].recipient).toBe(
      "0x0000a26b00c1f0df003000390027140000faa719",
    )
  })

  it("refuses a domain whose verifyingContract is not Seaport", () => {
    expect(() =>
      checkOrderTypedData(typedData({ verifyingContract: CONDUIT }), options),
    ).toThrow(`verifyingContract ${CONDUIT} is not Seaport on chain 8453`)
  })

  it("refuses a verifyingContract that is Seaport on another chain", () => {
    expect(() =>
      checkOrderTypedData(
        typedData({ verifyingContract: ALT_SEAPORT }),
        options,
      ),
    ).toThrow(`verifyingContract ${ALT_SEAPORT} is not Seaport on chain 8453`)
  })

  it("refuses an order on a chain the SDK does not know", () => {
    expect(() =>
      checkOrderTypedData(typedData({ chainId: UNKNOWN_CHAIN }), {
        ...options,
        chainId: UNKNOWN_CHAIN,
      }),
    ).toThrow("--send does not support chain 999999 yet")
  })

  it("refuses a domain chain that differs from the step's chain", () => {
    expect(() =>
      checkOrderTypedData(typedData({ chainId: 1 }), options),
    ).toThrow("chainId 1 does not match the step's chain 8453")
  })

  it("accepts Seaport's canonical types, with or without EIP712Domain", () => {
    expect(
      checkOrderTypedData(
        typedData({
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            ...SEAPORT_TYPES,
          },
        }),
        options,
      ).counter,
    ).toBe(BIG_COUNTER)
  })

  it("refuses EIP-712 types that differ from Seaport's", () => {
    const renamed = {
      ...SEAPORT_TYPES,
      ConsiderationItem: SEAPORT_TYPES.ConsiderationItem.map(f =>
        f.name === "recipient" ? { ...f, name: "payee" } : f,
      ),
    }
    const retyped = {
      ...SEAPORT_TYPES,
      OfferItem: SEAPORT_TYPES.OfferItem.map(f =>
        f.name === "startAmount" ? { ...f, type: "uint128" } : f,
      ),
    }
    const extra = {
      ...SEAPORT_TYPES,
      Permit: [{ name: "spender", type: "address" }],
    }
    const { OfferItem: _omitted, ...missing } = SEAPORT_TYPES
    const badDomain = {
      ...SEAPORT_TYPES,
      EIP712Domain: [{ name: "name", type: "string" }],
    }
    for (const [types, name] of [
      [renamed, "ConsiderationItem"],
      [retyped, "OfferItem"],
      [extra, "Permit"],
      [missing, "OfferItem"],
      [badDomain, "EIP712Domain"],
    ] as const) {
      expect(() => checkOrderTypedData(typedData({ types }), options)).toThrow(
        `the EIP-712 type ${name} is not Seaport 1.6's`,
      )
    }
  })

  it("refuses a Seaport bulk order", () => {
    expect(() =>
      checkOrderTypedData(typedData({ primaryType: "BulkOrder" }), options),
    ).toThrow("bulk order")
  })

  it("refuses any other primary type", () => {
    expect(() =>
      checkOrderTypedData(typedData({ primaryType: "Permit" }), options),
    ).toThrow("primary type Permit is not a Seaport order")
  })

  it("refuses an order offered by another address", () => {
    expect(() =>
      checkOrderTypedData(
        typedData({ order: listingOrder({ offerer: OTHER }) }),
        options,
      ),
    ).toThrow(`offerer is ${OTHER}, not ${ACCOUNT}`)
  })

  it("refuses a malformed order", () => {
    expect(() =>
      checkOrderTypedData(
        typedData({ order: listingOrder({ salt: "not-a-number" }) }),
        options,
      ),
    ).toThrow("the order is malformed: salt is not an unsigned integer")
  })
})

describe("parseJsonPreservingIntegers", () => {
  it("keeps unsafe integers exact and leaves safe numbers and strings alone", () => {
    expect(
      parseJsonPreservingIntegers(
        `{"big":${BIG_COUNTER},"small":42,"neg":-3,"float":1.5,"s":"a\\"b:9007199254740993,"}`,
      ),
    ).toEqual({
      big: BIG_COUNTER,
      small: 42,
      neg: -3,
      float: 1.5,
      s: 'a"b:9007199254740993,',
    })
  })

  it("keeps 2^53 exact and 2^53 - 1 a number", () => {
    expect(
      parseJsonPreservingIntegers("[9007199254740992,9007199254740991]"),
    ).toEqual(["9007199254740992", 9007199254740991])
  })
})

describe("planActionSteps", () => {
  it("plans a listing's approval and order signature in the returned order", () => {
    const steps = planActionSteps(
      [itemApprovalStep(), signatureStep()],
      ACCOUNT,
      { requestedOrder: LISTING_REQUESTED },
    )
    expect(steps.map(s => [s.type, s.action])).toEqual([
      ["transaction", "itemApprovalAction"],
      ["signature", "createListingsAction"],
    ])
    const [approval, signature] = steps
    expect(approval).toMatchObject({
      to: NFT,
      chainId: BASE,
      value: "0",
      gas: "60000",
      approval: { contract: NFT, asset: "item", spender: CONDUIT },
    })
    expect(signature).toMatchObject({
      side: "listing",
      protocolAddress: SEAPORT,
      order: { counter: BIG_COUNTER },
    })
  })

  it("plans offer creation as an offer and a buy as a Seaport transaction", () => {
    const [payment, offer, buy] = planActionSteps(
      [
        paymentApprovalStep(),
        signatureStep(
          "createOfferAction",
          typedDataMessage({ order: offerOrder() }),
        ),
        buyStep(),
      ],
      ACCOUNT,
      { requestedOrder: OFFER_REQUESTED },
    )
    expect(payment).toMatchObject({
      approval: {
        asset: "payment",
        contract: WETH,
        amount: "1000000000000000000",
      },
    })
    expect(offer).toMatchObject({ type: "signature", side: "offer" })
    expect(buy).toMatchObject({ to: SEAPORT, value: "1000000000000000000" })
  })

  it("refuses an approval of an unknown operator before planning later steps", () => {
    expect(() =>
      planActionSteps([itemApprovalStep(ATTACKER), signatureStep()], ACCOUNT),
    ).toThrow(`Refusing step 1 (itemApprovalAction): it approves ${ATTACKER}`)
  })

  it("refuses a buy that does not go to Seaport", () => {
    expect(() => planActionSteps([buyStep({ to: ATTACKER })], ACCOUNT)).toThrow(
      "Refusing step 1 (buyItemAction)",
    )
  })

  it("refuses an order signature for another verifying contract", () => {
    expect(() =>
      planActionSteps(
        [
          signatureStep(
            "createListingsAction",
            typedDataMessage({ verifyingContract: ATTACKER }),
          ),
        ],
        ACCOUNT,
      ),
    ).toThrow("is not Seaport")
  })

  it("refuses action kinds it does not run", () => {
    expect(() =>
      planActionSteps(
        [{ swapAssetsAction: { transaction: transaction({ to: SEAPORT }) } }],
        ACCOUNT,
      ),
    ).toThrow("--send does not run swapAssetsAction steps")
  })

  it("refuses malformed steps and responses", () => {
    expect(() => planActionSteps([], ACCOUNT)).toThrow("no steps")
    expect(() => planActionSteps([buyStep()], "not-an-address")).toThrow(
      "need an EVM account address",
    )
    expect(() =>
      planActionSteps([{ ...buyStep(), ...itemApprovalStep() }], ACCOUNT),
    ).toThrow("exactly one action")
    expect(() => planActionSteps([{ buyItemAction: null }], ACCOUNT)).toThrow(
      "the action is empty",
    )
    expect(() =>
      planActionSteps(
        [{ itemApprovalAction: { transaction: transaction({ to: NFT }) } }],
        ACCOUNT,
      ),
    ).toThrow("does not name the contract it approves")
    expect(() =>
      planActionSteps(
        [{ buyItemAction: { transaction: { to: { value: SEAPORT } } } }],
        ACCOUNT,
      ),
    ).toThrow("no EVM chain id")
    expect(() =>
      planActionSteps(
        [
          {
            buyItemAction: {
              transaction: { chainIdentifier: { chainId: BASE } },
            },
          },
        ],
        ACCOUNT,
      ),
    ).toThrow("no 'to' address")
    expect(() => planActionSteps([buyStep({ value: "-1" })], ACCOUNT)).toThrow(
      "value -1 is not a wei amount",
    )
    expect(() =>
      planActionSteps([{ createListingsAction: { orders: [] } }], ACCOUNT),
    ).toThrow("no EIP-712 signature request")
    expect(() =>
      planActionSteps([signatureStep("createListingsAction", "{")], ACCOUNT),
    ).toThrow("not valid JSON")
    expect(() =>
      planActionSteps(
        [signatureStep("createListingsAction", '{"domain":{}}')],
        ACCOUNT,
      ),
    ).toThrow("lacks domain, types, primaryType or message")
  })

  it("refuses a step on another chain than the one the request names", () => {
    expect(
      planActionSteps([itemApprovalStep(), signatureStep()], ACCOUNT, {
        chainId: BASE,
        requestedOrder: LISTING_REQUESTED,
      }),
    ).toHaveLength(2)
    expect(() => planActionSteps([buyStep()], ACCOUNT, { chainId: 1 })).toThrow(
      "Refusing step 1 (buyItemAction): it is on chain 8453, but the request names chain 1",
    )
    expect(() =>
      planActionSteps([signatureStep()], ACCOUNT, { chainId: 1 }),
    ).toThrow("Refusing step 1 (createListingsAction): it is on chain 8453")
  })

  it("treats a missing value as zero", () => {
    const step = buyStep()
    delete (step.buyItemAction.transaction as { value?: string }).value
    expect(planActionSteps([step], ACCOUNT)[0]).toMatchObject({ value: "0" })
  })
})

describe("planSwapTransactions", () => {
  const seaportTx = {
    chain: "base",
    to: SEAPORT,
    data: "0xfb0f3ee1",
    value: "5",
  }
  const approvalTx = {
    chain: "base",
    to: WETH,
    data: approveCalldata(CONDUIT, 10n),
    value: "0",
  }

  it("plans a payment approval and a Seaport fulfillment", () => {
    const steps = planSwapTransactions([approvalTx, seaportTx], ACCOUNT, WETH)
    expect(steps.map(s => s.action)).toEqual(["paymentApproval", "fulfillment"])
    expect(steps[0]).toMatchObject({
      chainId: BASE,
      approval: { contract: WETH, spender: CONDUIT, asset: "payment" },
    })
    expect(steps[1]).toMatchObject({ to: SEAPORT, value: "5" })
  })

  it("refuses a transaction to a bridge or swap router", () => {
    expect(() =>
      planSwapTransactions([{ ...seaportTx, to: ATTACKER }], ACCOUNT, WETH),
    ).toThrow("Refusing transaction 1: 'to'")
  })

  it("refuses an approval of a token other than the payment token", () => {
    expect(() =>
      planSwapTransactions([{ ...approvalTx, to: NFT }], ACCOUNT, WETH),
    ).toThrow("is not Seaport")
  })

  it("refuses Solana transactions, unknown chains and empty responses", () => {
    expect(() =>
      planSwapTransactions([{ ...seaportTx, svm: {} }], ACCOUNT, WETH),
    ).toThrow("not an EVM transaction")
    expect(() =>
      planSwapTransactions([{ ...seaportTx, chain: "nowhere" }], ACCOUNT, WETH),
    ).toThrow("unknown chain nowhere")
    expect(() => planSwapTransactions([], ACCOUNT, WETH)).toThrow(
      "no transactions",
    )
  })
})

describe("normalizeSeaportOrder", () => {
  it("normalizes order parameters and returns undefined for anything malformed", () => {
    expect(
      normalizeSeaportOrder({ ...listingOrder(), counter: 3 })?.counter,
    ).toBe("3")
    expect(normalizeSeaportOrder({ ...listingOrder(), zone: "nope" })).toBe(
      undefined,
    )
    expect(normalizeSeaportOrder("not an object")).toBeUndefined()
    const { counter: _counter, ...noCounter } = listingOrder()
    expect(normalizeSeaportOrder(noCounter)).toBeUndefined()
    expect(
      normalizeSeaportOrder(noCounter, { counterOptional: true })?.counter,
    ).toBe("0")
  })
})

describe("parseUnits", () => {
  it("converts decimal amounts and rejects malformed or over-precise ones", () => {
    expect(parseUnits("5", 18)).toBe(5n * 10n ** 18n)
    expect(parseUnits("0.4", 18)).toBe(4n * 10n ** 17n)
    expect(parseUnits("89.5", 6)).toBe(89_500_000n)
    expect(parseUnits("1.000001", 6)).toBe(1_000_001n)
    expect(() => parseUnits("1.0000001", 6)).toThrow(
      "more than 6 decimal places",
    )
    expect(() => parseUnits("-1", 18)).toThrow("is not a decimal amount")
    expect(() => parseUnits("1e18", 18)).toThrow("is not a decimal amount")
  })
})

describe("checkOrderAgainstRequest", () => {
  const label = "step 2 (createListingsAction)"
  const ether = 10n ** 18n
  const payment = (amount: bigint, recipient: string, token = ZERO) => ({
    itemType: token === ZERO ? 0 : 1,
    token,
    identifierOrCriteria: "0",
    startAmount: amount.toString(),
    endAmount: amount.toString(),
    recipient,
  })
  const listing = (consideration: unknown[], overrides = {}) =>
    plannedSignature(listingOrder({ consideration, ...overrides }))

  it("accepts the requested listing and offer", () => {
    expect(() =>
      checkOrderAgainstRequest(
        plannedSignature(listingOrder()),
        LISTING_REQUESTED,
        label,
      ),
    ).not.toThrow()
    expect(() =>
      checkOrderAgainstRequest(
        plannedSignature(offerOrder(), "offer"),
        OFFER_REQUESTED,
        label,
      ),
    ).not.toThrow()
  })

  it("refuses an order signature when the request creates no order, or the other side", () => {
    expect(() =>
      checkOrderAgainstRequest(
        plannedSignature(listingOrder()),
        undefined,
        label,
      ),
    ).toThrow("this request does not create an order")
    expect(() =>
      checkOrderAgainstRequest(
        plannedSignature(listingOrder()),
        OFFER_REQUESTED,
        label,
      ),
    ).toThrow("it signs a listing, but the request creates an offer")
  })

  it("refuses a dust price", () => {
    expect(() =>
      checkOrderAgainstRequest(
        listing([payment(1n, ACCOUNT)]),
        LISTING_REQUESTED,
        label,
      ),
    ).toThrow(
      `its total payment is 1 base units, but the request asks for ${ether}`,
    )
  })

  it("refuses the wrong token id or quantity", () => {
    const wrongId = listingOrder({
      offer: [
        {
          itemType: 2,
          token: NFT,
          identifierOrCriteria: "8",
          startAmount: "1",
          endAmount: "1",
        },
      ],
    })
    expect(() =>
      checkOrderAgainstRequest(
        plannedSignature(wrongId),
        LISTING_REQUESTED,
        label,
      ),
    ).toThrow(`it does not offer exactly 1 x ${NFT} #7`)
    const wrongQuantity = listingOrder({
      offer: [
        {
          itemType: 3,
          token: NFT,
          identifierOrCriteria: "7",
          startAmount: "2",
          endAmount: "2",
        },
      ],
    })
    expect(() =>
      checkOrderAgainstRequest(
        plannedSignature(wrongQuantity),
        LISTING_REQUESTED,
        label,
      ),
    ).toThrow("it does not offer exactly 1 x")
  })

  it("refuses the wrong currency", () => {
    expect(() =>
      checkOrderAgainstRequest(
        listing([payment(ether, ACCOUNT, WETH)]),
        LISTING_REQUESTED,
        label,
      ),
    ).toThrow(
      `it pays in ${WETH} (item type 1), not the requested currency ${ZERO}`,
    )
  })

  it("refuses consideration diverted to a third party, at the fee cap boundary", () => {
    expect(() =>
      checkOrderAgainstRequest(
        listing([
          payment(475n * 10n ** 15n, ACCOUNT),
          payment(25n * 10n ** 15n, FEE_RECIPIENT),
          payment(5n * 10n ** 17n, ATTACKER),
        ]),
        LISTING_REQUESTED,
        label,
      ),
    ).toThrow("more than the 1100 bps OpenSea and creator fees can add up to")
    expect(() =>
      checkOrderAgainstRequest(
        listing([
          payment(89n * 10n ** 16n, ACCOUNT),
          payment(11n * 10n ** 16n, OTHER),
        ]),
        LISTING_REQUESTED,
        label,
      ),
    ).not.toThrow()
    expect(() =>
      checkOrderAgainstRequest(
        listing([
          payment(89n * 10n ** 16n - 1n, ACCOUNT),
          payment(11n * 10n ** 16n + 1n, OTHER),
        ]),
        LISTING_REQUESTED,
        label,
      ),
    ).toThrow("1100 bps")
  })

  it("refuses a start time earlier than the request's start_time, at the boundary", () => {
    expect(() =>
      checkOrderAgainstRequest(
        plannedSignature(listingOrder()),
        { ...LISTING_REQUESTED, earliestStartTime: 1767225600n },
        label,
      ),
    ).not.toThrow()
    expect(() =>
      checkOrderAgainstRequest(
        plannedSignature(listingOrder()),
        { ...LISTING_REQUESTED, earliestStartTime: 1767225601n },
        label,
      ),
    ).toThrow(
      "it starts at 1767225600, earlier than the request's start_time (1767225601)",
    )
  })

  it("refuses an end time later than the request allows, at the boundary", () => {
    expect(() =>
      checkOrderAgainstRequest(
        plannedSignature(listingOrder()),
        {
          ...LISTING_REQUESTED,
          latestEndTime: 1769903999n,
        },
        label,
      ),
    ).toThrow(
      "it ends at 1769904000, later than the latest end time the request allows (1769903999)",
    )
  })

  it("refuses amounts that change over time", () => {
    const changing = { ...payment(ether, ACCOUNT), endAmount: "1" }
    expect(() =>
      checkOrderAgainstRequest(listing([changing]), LISTING_REQUESTED, label),
    ).toThrow("its amounts change over time")
  })

  it("requires a private listing's NFT to go to the taker, and nobody else", () => {
    const toTaker = {
      itemType: 2,
      token: NFT,
      identifierOrCriteria: "7",
      startAmount: "1",
      endAmount: "1",
      recipient: OTHER,
    }
    const fees = [
      payment(975n * 10n ** 15n, ACCOUNT),
      payment(25n * 10n ** 15n, FEE_RECIPIENT),
    ]
    expect(() =>
      checkOrderAgainstRequest(
        listing([...fees, toTaker]),
        { ...LISTING_REQUESTED, taker: OTHER },
        label,
      ),
    ).not.toThrow()
    expect(() =>
      checkOrderAgainstRequest(
        listing([...fees, toTaker]),
        LISTING_REQUESTED,
        label,
      ),
    ).toThrow("it asks for NFTs in return that the request does not name")
    expect(() =>
      checkOrderAgainstRequest(
        listing(fees),
        { ...LISTING_REQUESTED, taker: OTHER },
        label,
      ),
    ).toThrow(`it does not deliver the NFT to the private taker ${OTHER}`)
  })

  it("refuses an offer whose NFT goes to someone else or that offers more than payment", () => {
    const base = offerOrder()
    const toOther = {
      ...base,
      consideration: base.consideration.map((item, i) =>
        i === 0 ? { ...item, recipient: OTHER } : item,
      ),
    }
    expect(() =>
      checkOrderAgainstRequest(
        plannedSignature(toOther, "offer"),
        OFFER_REQUESTED,
        label,
      ),
    ).toThrow(`delivered to ${ACCOUNT}`)
    const extraOffer = {
      ...base,
      offer: [
        ...base.offer,
        {
          itemType: 2,
          token: NFT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
        },
      ],
    }
    expect(() =>
      checkOrderAgainstRequest(
        plannedSignature(extraOffer, "offer"),
        OFFER_REQUESTED,
        label,
      ),
    ).toThrow("it offers something other than the payment")
  })
})

describe("excessiveApprovals", () => {
  const offer = () => plannedSignature(offerOrder(), "offer")

  it("flags an approval larger than the plan spends, including the API's unlimited one", () => {
    const [unlimited] = planActionSteps(
      [paymentApprovalStep(CONDUIT, (1n << 256n) - 1n)],
      ACCOUNT,
    )
    expect(excessiveApprovals([unlimited, offer()])).toEqual([
      {
        step: 1,
        action: "paymentApprovalAction",
        token: WETH,
        spender: CONDUIT,
        amount: (1n << 256n) - 1n,
        required: 4n * 10n ** 17n,
      },
    ])
    const [oneWeiOver] = planActionSteps(
      [paymentApprovalStep(CONDUIT, 4n * 10n ** 17n + 1n)],
      ACCOUNT,
    )
    expect(excessiveApprovals([oneWeiOver, offer()])).toHaveLength(1)
  })

  it("accepts an approval of exactly what an offer or a buy spends, and ignores NFT approvals", () => {
    const [exact] = planActionSteps(
      [paymentApprovalStep(CONDUIT, 4n * 10n ** 17n)],
      ACCOUNT,
    )
    expect(excessiveApprovals([exact, offer()])).toEqual([])
    const buy = buyStep()
    buy.buyItemAction.paymentAssetQuantity[0].assetIdentifier.contractAddress.value =
      WETH
    const steps = planActionSteps(
      [paymentApprovalStep(CONDUIT, 10n ** 18n), buy, itemApprovalStep()],
      ACCOUNT,
    )
    expect(excessiveApprovals(steps)).toEqual([])
  })
})

describe("clampApprovals", () => {
  const offer = () => plannedSignature(offerOrder(), "offer")

  it("lowers an approval to what the plan spends and re-encodes its calldata", () => {
    const steps = clampApprovals([
      ...planActionSteps(
        [paymentApprovalStep(CONDUIT, (1n << 256n) - 1n)],
        ACCOUNT,
      ),
      offer(),
    ])
    expect(steps[0]).toMatchObject({
      data: approveCalldata(CONDUIT, 4n * 10n ** 17n),
      approval: {
        amount: "400000000000000000",
        requestedAmount: ((1n << 256n) - 1n).toString(),
      },
    })
    expect(excessiveApprovals(steps)).toEqual([])
  })

  it("leaves exact approvals, NFT approvals and tokens the plan does not spend unchanged", () => {
    const exact = planActionSteps(
      [paymentApprovalStep(CONDUIT, 4n * 10n ** 17n)],
      ACCOUNT,
    )
    expect(clampApprovals([...exact, offer()])[0]).toBe(exact[0])
    const nft = planActionSteps([itemApprovalStep()], ACCOUNT)
    expect(clampApprovals(nft)[0]).toBe(nft[0])
    const unspent = planActionSteps(
      [paymentApprovalStep(CONDUIT, (1n << 256n) - 1n)],
      ACCOUNT,
    )
    expect(clampApprovals(unspent)[0]).toBe(unspent[0])
    expect(excessiveApprovals(clampApprovals(unspent))).toHaveLength(1)
  })
})

describe("planDigest", () => {
  const listingPlan = (order = listingOrder()) => [
    ...planActionSteps([itemApprovalStep(), buyStep()], ACCOUNT),
    plannedSignature(order),
  ]

  it("is a stable SHA-256 hex digest that ignores an order's salt, times and counter but not calldata", () => {
    const digest = planDigest(listingPlan())
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(
      planDigest(
        listingPlan(
          listingOrder({
            salt: "0x9999",
            startTime: "1",
            endTime: "2",
            counter: "7",
          }),
        ),
      ),
    ).toBe(digest)
    const [approval, buy, order] = listingPlan()
    if (buy.type !== "transaction") throw new Error("expected a transaction")
    expect(
      planDigest([approval, { ...buy, data: `${buy.data}ff` }, order]),
    ).not.toBe(digest)
  })

  it("changes when an order's type, zone, zone hash or conduit key changes", () => {
    const digest = planDigest(listingPlan())
    for (const change of [
      { orderType: 2 },
      { zone: SIGNED_ZONE },
      { zoneHash: `0x${"1".repeat(64)}` },
      { conduitKey: `0x${"2".repeat(64)}` },
    ]) {
      expect(
        planDigest(listingPlan(listingOrder(change))),
        JSON.stringify(change),
      ).not.toBe(digest)
    }
  })

  it("changes when a to, value, approval amount, item amount or recipient changes", () => {
    const digest = planDigest(listingPlan())
    const [approval, buy, order] = listingPlan()
    if (buy.type !== "transaction" || approval.type !== "transaction")
      throw new Error()
    expect(planDigest([approval, { ...buy, value: "1" }, order])).not.toBe(
      digest,
    )
    expect(planDigest([approval, { ...buy, to: ALT_SEAPORT }, order])).not.toBe(
      digest,
    )
    expect(
      planDigest([
        {
          ...approval,
          approval: approval.approval && {
            ...approval.approval,
            spender: SEAPORT,
          },
        },
        buy,
        order,
      ]),
    ).not.toBe(digest)
    const cheaper = listingOrder()
    ;(cheaper.consideration as Array<{ startAmount: string }>)[0].startAmount =
      "1"
    expect(planDigest([approval, buy, plannedSignature(cheaper)])).not.toBe(
      digest,
    )
    const diverted = listingOrder()
    ;(diverted.consideration as Array<{ recipient: string }>)[0].recipient =
      ATTACKER
    expect(planDigest([approval, buy, plannedSignature(diverted)])).not.toBe(
      digest,
    )
    const [unlimited] = planActionSteps(
      [paymentApprovalStep(CONDUIT, (1n << 256n) - 1n)],
      ACCOUNT,
    )
    const [exact] = planActionSteps([paymentApprovalStep(CONDUIT, 1n)], ACCOUNT)
    expect(planDigest([unlimited])).not.toBe(planDigest([exact]))
  })
})

describe("SignedZone extraData", () => {
  const buyWith = (data: string) => {
    const step = buyStep()
    step.buyItemAction.transaction.data = data
    return planActionSteps([step], ACCOUNT)
  }
  const extraData = signedZoneExtraData({})
  const base = fulfillAdvancedOrderCalldata(extraData)

  it("locates the fulfiller of a SignedZone order in fulfillAdvancedOrder and fulfillAvailableAdvancedOrders", () => {
    expect(locateSignedZoneExtraData(base, SIGNED_ZONE)).toEqual([
      { offset: expect.any(Number), fulfiller: ACCOUNT },
    ])
    expect(
      locateSignedZoneExtraData(
        fulfillAvailableAdvancedOrdersCalldata(extraData),
        SIGNED_ZONE,
      ),
    ).toHaveLength(1)
    expect(locateSignedZoneExtraData(base, ATTACKER)).toEqual([])
    expect(
      locateSignedZoneExtraData(
        fulfillAdvancedOrderCalldata(signedZoneExtraData({ version: "01" })),
        SIGNED_ZONE,
      ),
    ).toEqual([])
    expect(locateSignedZoneExtraData(base.slice(0, 200), SIGNED_ZONE)).toEqual(
      [],
    )
    expect(
      locateSignedZoneExtraData(FULFILL_BASIC_ORDER_CALLDATA, SIGNED_ZONE),
    ).toEqual([])
  })

  it("gives the same digest for calldata that differs only in the expiration and signature", () => {
    const fresh = fulfillAdvancedOrderCalldata(
      signedZoneExtraData({
        expiration: 0x6af29aaan,
        signature: "12".repeat(64),
      }),
    )
    expect(fresh).not.toBe(base)
    expect(planDigest(buyWith(fresh))).toBe(planDigest(buyWith(base)))
    const freshArray = fulfillAvailableAdvancedOrdersCalldata(
      signedZoneExtraData({ expiration: 1n, signature: "34".repeat(64) }),
    )
    expect(planDigest(buyWith(freshArray))).toBe(
      planDigest(buyWith(fulfillAvailableAdvancedOrdersCalldata(extraData))),
    )
  })

  it("changes the digest when any other byte after the selector changes", () => {
    const [segment] = locateSignedZoneExtraData(base, SIGNED_ZONE)
    const masked = new Set(
      Array.from({ length: 72 }, (_, i) => segment.offset + 21 + i),
    )
    const digest = planDigest(buyWith(base))
    const bytes = (base.length - 10) / 2
    let checked = 0
    for (let i = 0; i < bytes; i++) {
      if (masked.has(i)) continue
      const at = 10 + i * 2
      const flipped =
        base.slice(0, at) +
        (base.slice(at, at + 2) === "ff" ? "00" : "ff") +
        base.slice(at + 2)
      let changed: string
      try {
        changed = planDigest(buyWith(flipped))
      } catch {
        continue
      }
      checked++
      expect(changed, `byte ${i}`).not.toBe(digest)
    }
    expect(checked).toBeGreaterThan(bytes - 72 - 21)
  })

  it("hashes another zone's extraData unmasked", () => {
    const other = (expiration: bigint) =>
      fulfillAdvancedOrderCalldata(
        signedZoneExtraData({ expiration }),
        ATTACKER,
      )
    expect(planDigest(buyWith(other(1n)))).not.toBe(
      planDigest(buyWith(other(2n))),
    )
  })

  it("refuses a SignedZone authorization issued for another fulfiller", () => {
    expect(() =>
      buyWith(
        fulfillAdvancedOrderCalldata(signedZoneExtraData({ fulfiller: OTHER })),
      ),
    ).toThrow(
      `Refusing step 1 (buyItemAction): its SignedZone authorization is for fulfiller ${OTHER}, not ${ACCOUNT}`,
    )
  })
})

describe("Seaport order hashes and cancels", () => {
  const TRUNCATED_CANCEL = `0xfd9f1e10${"0".repeat(62)}20`
  const live = normalizeSeaportOrder(LIVE_ORDER)
  const cancelStep = (data: string) => ({
    cancelOrdersAction: {
      transaction: transaction({ to: SEAPORT, data }),
      orderIds: ["0xorder"],
    },
  })

  it("matches the order hash the API reports for a live order", () => {
    if (!live) throw new Error("fixture order is malformed")
    expect(seaportOrderHash(live)).toBe(LIVE_ORDER_HASH)
  })

  it("decodes cancel calldata back to the order components", () => {
    const decoded = decodeCancelCalldata(
      cancelCalldata([LIVE_ORDER, LIVE_ORDER]),
    )
    expect(decoded).toHaveLength(2)
    expect(decoded.map(seaportOrderHash)).toEqual([
      LIVE_ORDER_HASH,
      LIVE_ORDER_HASH,
    ])
    expect(() => decodeCancelCalldata(FULFILL_BASIC_ORDER_CALLDATA)).toThrow(
      "not a Seaport cancel call",
    )
    expect(decodeCancelCalldata(CANCEL_CALLDATA)).toEqual([])
    expect(() => decodeCancelCalldata(TRUNCATED_CANCEL)).toThrow(
      "calldata is too short",
    )
  })

  it("accepts a cancel of exactly the requested order", () => {
    expect(
      planActionSteps([cancelStep(cancelCalldata([LIVE_ORDER]))], ACCOUNT, {
        cancelledOrders: [LIVE_ORDER_HASH.toUpperCase().replace("0X", "0x")],
      }),
    ).toHaveLength(1)
  })

  it("refuses a cancel of another order, an extra order, undecodable calldata, or no requested order", () => {
    const options = { cancelledOrders: [LIVE_ORDER_HASH] }
    expect(() =>
      planActionSteps(
        [cancelStep(cancelCalldata([{ ...LIVE_ORDER, salt: "0x1" }]))],
        ACCOUNT,
        options,
      ),
    ).toThrow(`not the requested ${LIVE_ORDER_HASH}`)
    expect(() =>
      planActionSteps(
        [
          cancelStep(
            cancelCalldata([LIVE_ORDER, { ...LIVE_ORDER, counter: "1" }]),
          ),
        ],
        ACCOUNT,
        options,
      ),
    ).toThrow("not the requested")
    expect(() =>
      planActionSteps([cancelStep(TRUNCATED_CANCEL)], ACCOUNT, options),
    ).toThrow("its cancel calldata does not decode (calldata is too short)")
    expect(() =>
      planActionSteps([cancelStep(CANCEL_CALLDATA)], ACCOUNT, options),
    ).toThrow(`it cancels no orders, not the requested ${LIVE_ORDER_HASH}`)
    expect(() =>
      planActionSteps([cancelStep(cancelCalldata([LIVE_ORDER]))], ACCOUNT),
    ).toThrow("this request does not cancel an order")
  })
})

describe("planSwapTransactions request binding", () => {
  const approval = {
    chain: "base",
    to: WETH,
    data: approveCalldata(CONDUIT, (1n << 256n) - 1n),
    value: "0",
  }
  const buy = {
    chain: "base",
    to: SEAPORT,
    data: FULFILL_BASIC_ORDER_CALLDATA,
    value: "0",
  }

  it("refuses a transaction on a chain the request does not name", () => {
    expect(() =>
      planSwapTransactions([{ ...buy, chain: "ethereum" }], ACCOUNT, WETH, {
        chainIds: [BASE],
      }),
    ).toThrow(
      "Refusing transaction 1: it is on chain 1, which is neither the listing chain nor the payment chain (8453)",
    )
  })

  it("lowers a payment approval to the listings' price, and refuses it when the price is unknown", () => {
    const priced = planSwapTransactions([approval, buy], ACCOUNT, WETH, {
      chainIds: [BASE],
      paymentAmount: 1_300_000_000_000_000n,
    })
    expect(clampApprovals(priced)[0]).toMatchObject({
      data: approveCalldata(CONDUIT, 1_300_000_000_000_000n),
    })
    const unknown = planSwapTransactions([approval, buy], ACCOUNT, WETH)
    expect(excessiveApprovals(clampApprovals(unknown))).toEqual([
      expect.objectContaining({ step: 1, required: 0n }),
    ])
  })
})
