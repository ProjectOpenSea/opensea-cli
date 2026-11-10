import { describe, expect, it, vi } from "vitest"
import {
  createRpcReceiptWaiter,
  executePlan,
  MarketplaceExecutionError,
} from "../../src/marketplace/execute.js"
import {
  MarketplaceGuardError,
  planActionSteps,
} from "../../src/marketplace/guard.js"
import type { SvmWalletAdapter } from "../../src/wallet/index.js"
import { WrongChainTypeError } from "../../src/wallet/index.js"
import {
  ACCOUNT,
  BASE,
  BIG_COUNTER,
  buyStep,
  CONDUIT,
  createMockWallet,
  itemApprovalStep,
  LISTING_REQUESTED,
  NFT,
  OTHER,
  SEAPORT,
  setApprovalForAllCalldata,
  signatureStep,
} from "./fixtures.js"

const listingPlan = () =>
  planActionSteps([itemApprovalStep(), signatureStep()], ACCOUNT, {
    requestedOrder: LISTING_REQUESTED,
  })

describe("executePlan", () => {
  it("sends, confirms, signs and posts each step in order", async () => {
    const calls: string[] = []
    const wallet = createMockWallet()
    wallet.sendTransaction.mockImplementation(async () => {
      calls.push("send")
      return { hash: "0xapproval" }
    })
    wallet.signTypedData.mockImplementation(async () => {
      calls.push("sign")
      return "0xsig"
    })
    const waitForReceipt = vi.fn(async () => {
      calls.push("confirm")
    })
    const postOrder = vi.fn(async () => {
      calls.push("post")
      return { order_hash: "0xorder" }
    })

    const results = await executePlan(listingPlan(), {
      wallet,
      account: ACCOUNT,
      waitForReceipt,
      postOrder,
    })

    expect(calls).toEqual(["send", "confirm", "sign", "post"])
    expect(wallet.sendTransaction).toHaveBeenCalledWith({
      to: NFT,
      data: setApprovalForAllCalldata(CONDUIT, true),
      value: "0",
      chainId: BASE,
      gas: "60000",
    })
    expect(waitForReceipt).toHaveBeenCalledWith("0xapproval", BASE)
    const signed = wallet.signTypedData.mock.calls[0][0]
    expect(signed.domain.verifyingContract).toBe(SEAPORT)
    expect(signed.message.counter).toBe(BIG_COUNTER)
    const [step, body] = postOrder.mock.calls[0] as unknown as [
      { side: string },
      {
        protocol_address: string
        signature: string
        parameters: { counter: string; totalOriginalConsiderationItems: number }
      },
    ]
    expect(step.side).toBe("listing")
    expect(body.protocol_address).toBe(SEAPORT)
    expect(body.signature).toBe("0xsig")
    expect(body.parameters.counter).toBe(BIG_COUNTER)
    expect(body.parameters.totalOriginalConsiderationItems).toBe(2)
    expect(results).toEqual([
      { step: 1, action: "itemApprovalAction", hash: "0xapproval" },
      {
        step: 2,
        action: "createListingsAction",
        order: { order_hash: "0xorder" },
      },
    ])
  })

  it("omits gas when the API gave none", async () => {
    const wallet = createMockWallet()
    await executePlan(planActionSteps([buyStep()], ACCOUNT), {
      wallet,
      account: ACCOUNT,
      postOrder: vi.fn(),
    })
    expect(wallet.sendTransaction.mock.calls[0][0]).not.toHaveProperty("gas")
  })

  it("refuses a wallet that is not the account before running anything", async () => {
    const wallet = createMockWallet({ address: OTHER })
    await expect(
      executePlan(listingPlan(), {
        wallet,
        account: ACCOUNT,
        postOrder: vi.fn(),
      }),
    ).rejects.toThrow(MarketplaceGuardError)
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("refuses a wallet that cannot sign typed data before sending the approval", async () => {
    const wallet = createMockWallet({ signTypedData: false })
    await expect(
      executePlan(listingPlan(), {
        wallet,
        account: ACCOUNT,
        postOrder: vi.fn(),
      }),
    ).rejects.toThrow("cannot sign EIP-712 typed data")
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("runs a transaction-only plan on a wallet without typed-data signing", async () => {
    const wallet = createMockWallet({ signTypedData: false })
    const results = await executePlan(planActionSteps([buyStep()], ACCOUNT), {
      wallet,
      account: ACCOUNT,
      postOrder: vi.fn(),
    })
    expect(results).toEqual([
      { step: 1, action: "buyItemAction", hash: "0xhash1" },
    ])
  })

  it("rejects a Solana wallet", async () => {
    const svm = {
      name: "svm",
      chainType: "svm",
      capabilities: {
        signMessage: false,
        signTypedData: false,
        managedGas: true,
        managedNonce: true,
      },
      getAddress: vi.fn(),
      signTransaction: vi.fn(),
    } as unknown as SvmWalletAdapter
    await expect(
      executePlan(listingPlan(), {
        wallet: svm,
        account: ACCOUNT,
        postOrder: vi.fn(),
      }),
    ).rejects.toThrow(WrongChainTypeError)
  })

  it("stops at a failed step and reports the steps that already ran", async () => {
    const wallet = createMockWallet()
    const postOrder = vi.fn()
    const error = await executePlan(listingPlan(), {
      wallet,
      account: ACCOUNT,
      waitForReceipt: vi.fn().mockResolvedValue(undefined),
      postOrder: postOrder.mockRejectedValue(new Error("API 400")),
    }).catch(err => err)
    expect(error).toBeInstanceOf(MarketplaceExecutionError)
    expect(error.message).toBe("Step 2 (createListingsAction) failed: API 400")
    expect(error.completed).toEqual([
      { step: 1, action: "itemApprovalAction", hash: "0xhash1" },
    ])
  })

  it("keeps the hash of a sent approval that did not confirm, and does not sign the order", async () => {
    const wallet = createMockWallet()
    const error = await executePlan(listingPlan(), {
      wallet,
      account: ACCOUNT,
      waitForReceipt: vi.fn().mockRejectedValue(new Error("reverted")),
      postOrder: vi.fn(),
    }).catch(err => err)
    expect(error).toBeInstanceOf(MarketplaceExecutionError)
    expect(error.message).toBe(
      "Step 1 (itemApprovalAction) was sent as 0xhash1 but did not confirm: reverted",
    )
    expect(error.completed).toEqual([
      {
        step: 1,
        action: "itemApprovalAction",
        hash: "0xhash1",
        confirmed: false,
      },
    ])
    expect(wallet.signTypedData).not.toHaveBeenCalled()
  })

  it("reports no completed step when the send itself fails", async () => {
    const wallet = createMockWallet()
    wallet.sendTransaction.mockRejectedValue(new Error("rejected"))
    const error = await executePlan(listingPlan(), {
      wallet,
      account: ACCOUNT,
      postOrder: vi.fn(),
    }).catch(err => err)
    expect(error.message).toBe("Step 1 (itemApprovalAction) failed: rejected")
    expect(error.completed).toEqual([])
  })
})

describe("createRpcReceiptWaiter", () => {
  function rpc(responses: Record<string, unknown[]>) {
    return vi.fn(async (_url: unknown, init?: RequestInit) => {
      const { method } = JSON.parse(String(init?.body))
      const queue = responses[method]
      return new Response(JSON.stringify(queue.shift()))
    }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
  }

  it("polls again after the interval until the receipt appears", async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = rpc({
        eth_chainId: [{ result: "0x2105" }],
        eth_getTransactionReceipt: [
          { result: null },
          { result: { status: "0x1" } },
        ],
      })
      const wait = createRpcReceiptWaiter("https://rpc", {
        intervalMs: 3_000,
        fetchImpl,
      })
      let settled = false
      const pending = wait("0xabc", BASE).then(() => {
        settled = true
      })
      await vi.advanceTimersByTimeAsync(2_999)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await pending
      expect(fetchImpl).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it("rejects a reverted transaction", async () => {
    const wait = createRpcReceiptWaiter("https://rpc", {
      fetchImpl: rpc({
        eth_chainId: [{ result: "0x2105" }],
        eth_getTransactionReceipt: [{ result: { status: "0x0" } }],
      }),
    })
    await expect(wait("0xabc", BASE)).rejects.toThrow("0xabc reverted")
  })

  it("skips waiting when the RPC serves another chain", async () => {
    const onSkip = vi.fn()
    const fetchImpl = rpc({ eth_chainId: [{ result: "0x1" }] })
    const wait = createRpcReceiptWaiter("https://rpc", { onSkip, fetchImpl })
    await wait("0xabc", BASE)
    expect(onSkip).toHaveBeenCalledWith(
      "RPC URL serves chain 1, not 8453; not waiting for 0xabc to confirm",
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("fails closed when eth_chainId returns no valid chain id", async () => {
    const fetchImpl = rpc({ eth_chainId: [{}] })
    const onSkip = vi.fn()
    const wait = createRpcReceiptWaiter("https://rpc", { onSkip, fetchImpl })
    await expect(wait("0xabc", BASE)).rejects.toThrow(
      "RPC eth_chainId returned no valid chain id (undefined), so 0xabc cannot be confirmed",
    )
    expect(onSkip).not.toHaveBeenCalled()
  })

  it("times out, and surfaces RPC errors", async () => {
    const timeout = createRpcReceiptWaiter("https://rpc", {
      timeoutMs: 0,
      fetchImpl: rpc({
        eth_chainId: [{ result: "0x2105" }],
        eth_getTransactionReceipt: [{ result: null }],
      }),
    })
    await expect(timeout("0xabc", BASE)).rejects.toThrow("Timed out after 0ms")

    const failing = createRpcReceiptWaiter("https://rpc", {
      fetchImpl: rpc({ eth_chainId: [{ error: { message: "bad key" } }] }),
    })
    await expect(failing("0xabc", BASE)).rejects.toThrow(
      "RPC eth_chainId failed: bad key",
    )
  })
})
