import type { SwapQuoteOptions, SwapQuoteParams } from "./types/api.js"

/** Shared wire mapping for direct, programmatic and saved quotes. */
export function swapQuoteParams(options: SwapQuoteOptions): SwapQuoteParams {
  return {
    from_chain: options.fromChain,
    from_address: options.fromAddress,
    to_chain: options.toChain,
    to_address: options.toAddress,
    quantity: options.quantity,
    address: options.address,
    slippage: options.slippage,
    recipient: options.recipient,
    single_transaction_only: options.singleTransactionOnly,
    transaction_format: options.transactionFormat,
  }
}
