import type { SignedOrderRequest } from "../types/index.js"
import type { EvmWalletAdapter, WalletAdapter } from "../wallet/index.js"
import { requireEvmAdapter } from "../wallet/index.js"
import {
  MarketplaceGuardError,
  type PlannedSignature,
  type PlannedStep,
  type PlannedTransaction,
} from "./guard.js"

export interface ExecutedStep {
  step: number
  action: string
  /** Transaction hash, for a transaction step. */
  hash?: string
  /** False when the transaction was sent but did not confirm, or reverted. */
  confirmed?: false
  /** The API's response to the posted order, for a signature step. */
  order?: unknown
}

/** A step failed after earlier steps ran. `completed` lists what already happened. */
export class MarketplaceExecutionError extends Error {
  constructor(
    message: string,
    readonly completed: ExecutedStep[],
  ) {
    super(message)
    this.name = "MarketplaceExecutionError"
  }
}

export interface ExecutePlanOptions {
  wallet: WalletAdapter
  /** The address the steps were built for. The wallet must be this address. */
  account: string
  postOrder: (
    step: PlannedSignature,
    body: SignedOrderRequest,
  ) => Promise<unknown>
  /**
   * Resolves once a sent transaction is confirmed and rejects when it
   * reverted. Called after every transaction, before the next step.
   */
  waitForReceipt?: (hash: string, chainId: number) => Promise<void>
  onStep?: (step: PlannedStep, index: number) => void
  onDone?: (result: ExecutedStep) => void
}

function signedOrderBody(
  step: PlannedSignature,
  signature: string,
): SignedOrderRequest {
  return {
    protocol_address: step.protocolAddress,
    parameters: {
      ...step.order,
      totalOriginalConsiderationItems: step.order.consideration.length,
    },
    signature,
  }
}

async function sendStep(
  wallet: EvmWalletAdapter,
  step: PlannedTransaction,
): Promise<string> {
  const { hash } = await wallet.sendTransaction({
    to: step.to,
    data: step.data,
    value: step.value,
    chainId: step.chainId,
    ...(step.gas !== undefined ? { gas: step.gas } : {}),
  })
  return hash
}

/**
 * Run checked steps in order with `wallet`: send each transaction, and sign
 * and post each order. Refuses before anything runs when the wallet is not
 * `account` or cannot sign typed data the plan needs.
 */
export async function executePlan(
  steps: readonly PlannedStep[],
  options: ExecutePlanOptions,
): Promise<ExecutedStep[]> {
  const wallet = requireEvmAdapter(options.wallet, "marketplace steps")
  const address = await wallet.getAddress()
  if (address.toLowerCase() !== options.account.toLowerCase()) {
    throw new MarketplaceGuardError(
      `Wallet ${address} is not ${options.account}, the address the steps were built for. Request the steps for the wallet's address.`,
    )
  }
  const needsSignature = steps.some(step => step.type === "signature")
  if (
    needsSignature &&
    (!wallet.capabilities.signTypedData || !wallet.signTypedData)
  ) {
    throw new MarketplaceGuardError(
      `Wallet "${wallet.name}" cannot sign EIP-712 typed data, which this order needs.`,
    )
  }

  const completed: ExecutedStep[] = []
  for (const [index, step] of steps.entries()) {
    options.onStep?.(step, index)
    const result: ExecutedStep = { step: index + 1, action: step.action }
    try {
      if (step.type === "transaction") {
        result.hash = await sendStep(wallet, step)
        await options.waitForReceipt?.(result.hash, step.chainId)
      } else {
        const signature = await (
          wallet.signTypedData as NonNullable<EvmWalletAdapter["signTypedData"]>
        ).call(wallet, step.typedData)
        result.order = await options.postOrder(
          step,
          signedOrderBody(step, signature),
        )
      }
    } catch (err) {
      const message = (err as Error).message
      if (result.hash !== undefined) {
        throw new MarketplaceExecutionError(
          `Step ${index + 1} (${step.action}) was sent as ${result.hash} but did not confirm: ${message}`,
          [...completed, { ...result, confirmed: false }],
        )
      }
      throw new MarketplaceExecutionError(
        `Step ${index + 1} (${step.action}) failed: ${message}`,
        completed,
      )
    }
    completed.push(result)
    options.onDone?.(result)
  }
  return completed
}

/**
 * A `waitForReceipt` that polls `eth_getTransactionReceipt` on `rpcUrl`.
 * When the endpoint serves another chain it calls `onSkip` and returns
 * without waiting, since that chain's receipts will never appear there.
 */
export function createRpcReceiptWaiter(
  rpcUrl: string,
  options?: {
    intervalMs?: number
    timeoutMs?: number
    onSkip?: (message: string) => void
    fetchImpl?: typeof fetch
  },
): (hash: string, chainId: number) => Promise<void> {
  const intervalMs = options?.intervalMs ?? 3_000
  const timeoutMs = options?.timeoutMs ?? 300_000
  const doFetch = options?.fetchImpl ?? fetch
  let rpcChainId: Promise<number> | undefined

  const call = async (method: string, params: unknown[]): Promise<unknown> => {
    const response = await doFetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
    const body = (await response.json()) as {
      result?: unknown
      error?: { message?: string }
    }
    if (body.error) {
      throw new Error(`RPC ${method} failed: ${body.error.message ?? "error"}`)
    }
    return body.result
  }

  return async (hash, chainId) => {
    rpcChainId ??= call("eth_chainId", []).then(id => {
      const served = typeof id === "string" ? Number(id) : Number.NaN
      if (!Number.isSafeInteger(served) || served <= 0) {
        rpcChainId = undefined
        throw new Error(
          `RPC eth_chainId returned no valid chain id (${String(id)}), so ${hash} cannot be confirmed`,
        )
      }
      return served
    })
    const served = await rpcChainId
    if (served !== chainId) {
      options?.onSkip?.(
        `RPC URL serves chain ${served}, not ${chainId}; not waiting for ${hash} to confirm`,
      )
      return
    }
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const receipt = (await call("eth_getTransactionReceipt", [hash])) as {
        status?: string
      } | null
      if (receipt) {
        if (receipt.status === "0x0") {
          throw new Error(`Transaction ${hash} reverted`)
        }
        return
      }
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new Error(
          `Timed out after ${timeoutMs}ms waiting for ${hash} to confirm`,
        )
      }
      await new Promise(resolve =>
        setTimeout(resolve, Math.min(intervalMs, remaining)),
      )
    }
  }
}
