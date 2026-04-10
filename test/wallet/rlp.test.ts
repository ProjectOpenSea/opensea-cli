import { describe, expect, it } from "vitest"
import { rlpEncodeEip1559Tx } from "../../src/wallet/turnkey.js"

/**
 * Test vectors generated using ethers.js v6 Transaction.from().unsignedSerialized
 * to ensure our hand-rolled RLP encoder produces identical output.
 *
 * To regenerate these vectors:
 *
 *   npm install ethers@6
 *   node -e "
 *     const { Transaction } = require('ethers');
 *     const tx = Transaction.from({
 *       type: 2,
 *       chainId: 1,
 *       nonce: 0,
 *       maxPriorityFeePerGas: 1500000000n,
 *       maxFeePerGas: 30000000000n,
 *       gasLimit: 21000,
 *       to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
 *       value: 1000000000000000000n,
 *       data: '0x',
 *     });
 *     console.log(tx.unsignedSerialized.slice(2));
 *   "
 *
 * Repeat for each test case, adjusting the transaction fields accordingly.
 */
describe("rlpEncodeEip1559Tx", () => {
  it("encodes a simple ETH transfer on mainnet", () => {
    const result = rlpEncodeEip1559Tx({
      chainId: 1,
      nonce: 0n,
      maxPriorityFeePerGas: 1_500_000_000n, // 1.5 gwei
      maxFeePerGas: 30_000_000_000n, // 30 gwei
      gasLimit: 21_000n,
      to: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      value: "1000000000000000000", // 1 ETH
      data: "0x",
    })

    // ethers.js reference: Transaction.from({...}).unsignedSerialized (without 0x prefix)
    expect(result).toBe(
      "02f001808459682f008506fc23ac0082520894d8da6bf26964af9d7eed9e03e53415d37aa96045880de0b6b3a764000080c0",
    )
  })

  it("encodes a contract call on Base (chain 8453)", () => {
    const result = rlpEncodeEip1559Tx({
      chainId: 8453,
      nonce: 42n,
      maxPriorityFeePerGas: 100_000_000n, // 0.1 gwei
      maxFeePerGas: 1_000_000_000n, // 1 gwei
      gasLimit: 200_000n,
      to: "0x1234567890abcdef1234567890abcdef12345678",
      value: "0",
      data: "0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000de0b6b3a7640000",
    })

    expect(result).toBe(
      "02f86f8221052a8405f5e100843b9aca0083030d40941234567890abcdef1234567890abcdef1234567880b844a9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000de0b6b3a7640000c0",
    )
  })

  it("encodes zero value with zero fees on Sepolia", () => {
    const result = rlpEncodeEip1559Tx({
      chainId: 11155111,
      nonce: 0n,
      maxPriorityFeePerGas: 0n,
      maxFeePerGas: 0n,
      gasLimit: 21_000n,
      to: "0x0000000000000000000000000000000000000001",
      value: "0",
      data: "0x",
    })

    expect(result).toBe(
      "02e283aa36a78080808252089400000000000000000000000000000000000000018080c0",
    )
  })

  it("encodes large nonce and value", () => {
    const result = rlpEncodeEip1559Tx({
      chainId: 1,
      nonce: 255n,
      maxPriorityFeePerGas: 2_000_000_000n,
      maxFeePerGas: 100_000_000_000n,
      gasLimit: 500_000n,
      to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      value: "50000000000000000000", // 50 ETH
      data: "0x",
    })

    expect(result).toBe(
      "02f30181ff847735940085174876e8008307a12094a0b86991c6218b36c1d19d4a2e9eb0ce3606eb488902b5e3af16b188000080c0",
    )
  })

  it("handles empty data field (no 0x prefix)", () => {
    const result = rlpEncodeEip1559Tx({
      chainId: 1,
      nonce: 0n,
      maxPriorityFeePerGas: 1_500_000_000n,
      maxFeePerGas: 30_000_000_000n,
      gasLimit: 21_000n,
      to: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      value: "1000000000000000000",
      data: "",
    })

    // Empty data should produce the same result as "0x"
    expect(result).toBe(
      "02f001808459682f008506fc23ac0082520894d8da6bf26964af9d7eed9e03e53415d37aa96045880de0b6b3a764000080c0",
    )
  })

  it("starts with 02 prefix (EIP-1559 type byte)", () => {
    const result = rlpEncodeEip1559Tx({
      chainId: 1,
      nonce: 0n,
      maxPriorityFeePerGas: 0n,
      maxFeePerGas: 0n,
      gasLimit: 21_000n,
      to: "0x0000000000000000000000000000000000000001",
      value: "0",
      data: "",
    })

    expect(result.startsWith("02")).toBe(true)
  })
})
