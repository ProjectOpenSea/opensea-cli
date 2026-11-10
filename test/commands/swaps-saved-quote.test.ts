import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { swapsCommand } from "../../src/commands/swaps.js"
import {
  type SavedSwapQuote,
  signSavedSwapQuote,
  verifySavedSwapQuoteMac,
} from "../../src/saved-swap-quote.js"
import {
  getQuoteKeyFile,
  loadOrCreateQuoteKey,
} from "../../src/swap-quote-key.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

const WALLET = "0x1234567890abcdef1234567890abcdef12345678"
const ROUTER = `0x${"b".repeat(40)}`
const NOW = new Date("2026-11-09T12:00:00.000Z")

const wallet = vi.hoisted(() => ({
  name: "mock",
  chainType: "evm" as const,
  capabilities: {
    signMessage: false,
    signTypedData: false,
    managedGas: false,
    managedNonce: false,
  },
  getAddress: vi.fn(),
  sendTransaction: vi.fn(),
}))

vi.mock("../../src/wallet/index.js", async importOriginal => ({
  ...(await importOriginal<object>()),
  createWalletFromEnv: () => wallet,
}))

const QUOTE_RESPONSE = {
  quote: {
    costs: [],
    estimated_duration_ms: 0,
    marketplace_fee_bps: 45,
    route_errors: [],
    slippage_tolerance: 0.01,
    // As the API returns them: total_price_usd is the tokens sent,
    // total_cost_usd the tokens received.
    total_cost_usd: 0.2,
    total_price_usd: 0.21,
  },
  transactions: [
    { chain: "base", to: ROUTER, data: "0x12345678abcd", value: "1000" },
  ],
}

const QUOTE_ARGS = [
  "--from-chain",
  "base",
  "--from-address",
  "0x0000000000000000000000000000000000000000",
  "--to-chain",
  "base",
  "--to-address",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "--quantity",
  "1000",
]

describe("swaps saved quotes", () => {
  let ctx: CommandTestContext
  let dir: string
  let errorSpy: ReturnType<typeof vi.spyOn>
  let previousConfigDir: string | undefined

  const run = (args: string[]) =>
    swapsCommand(ctx.getClient, ctx.getFormat).parseAsync(args, {
      from: "user",
    })

  function writeRaw(saved: unknown): string {
    const file = join(dir, "quote.json")
    writeFileSync(file, JSON.stringify(saved))
    return file
  }

  const writeSaved = (saved: SavedSwapQuote) =>
    writeRaw(signSavedSwapQuote(saved, loadOrCreateQuoteKey()))

  const stderr = () => errorSpy.mock.calls.map(c => c.join(" ")).join("\n")

  function freshSaved(): SavedSwapQuote {
    return {
      type: "opensea_swap_quote",
      version: 1,
      saved_at: NOW.toISOString(),
      request: {
        from_chain: "base",
        from_address: "0x0000000000000000000000000000000000000000",
        to_chain: "base",
        to_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        quantity: "1000",
        address: WALLET,
      },
      response: structuredClone(QUOTE_RESPONSE) as SavedSwapQuote["response"],
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] })
    ctx = createCommandTestContext()
    dir = mkdtempSync(join(tmpdir(), "swaps-saved-quote-"))
    previousConfigDir = process.env.OPENSEA_CONFIG_DIR
    process.env.OPENSEA_CONFIG_DIR = join(dir, "config")
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    wallet.getAddress.mockResolvedValue(WALLET)
    wallet.sendTransaction.mockResolvedValue({ hash: "0xhash" })
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.OPENSEA_CONFIG_DIR = previousConfigDir
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
    wallet.getAddress.mockReset()
    wallet.sendTransaction.mockReset()
  })

  it("quote --out saves the request, response and time, and prints the response", async () => {
    ctx.mockClient.get.mockResolvedValue(QUOTE_RESPONSE)
    const file = join(dir, "out.json")

    await run(["quote", ...QUOTE_ARGS, "--address", WALLET, "--out", file])

    const saved = JSON.parse(readFileSync(file, "utf8"))
    expect(saved).toMatchObject({
      type: "opensea_swap_quote",
      version: 1,
      request: {
        from_chain: "base",
        to_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        quantity: "1000",
        address: WALLET,
      },
      response: QUOTE_RESPONSE,
    })
    expect(saved.saved_at).toBe(NOW.toISOString())
    expect(JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string)).toEqual(
      QUOTE_RESPONSE,
    )
  })

  it("quote --out creates a 0600 quote key once, signs with it, and reuses it", async () => {
    ctx.mockClient.get.mockResolvedValue(QUOTE_RESPONSE)
    const keyFile = getQuoteKeyFile()
    expect(existsSync(keyFile)).toBe(false)

    await run([
      "quote",
      ...QUOTE_ARGS,
      "--address",
      WALLET,
      "--out",
      join(dir, "a.json"),
    ])

    expect(statSync(keyFile).mode & 0o777).toBe(0o600)
    expect(statSync(join(dir, "config")).mode & 0o777).toBe(0o700)
    const key = readFileSync(keyFile)
    expect(key).toHaveLength(32)
    const first = JSON.parse(readFileSync(join(dir, "a.json"), "utf8"))
    expect(first.mac).toMatch(/^[0-9a-f]{64}$/)
    expect(() => verifySavedSwapQuoteMac(first, key)).not.toThrow()

    await run([
      "quote",
      ...QUOTE_ARGS,
      "--address",
      WALLET,
      "--out",
      join(dir, "b.json"),
    ])

    expect(readFileSync(keyFile)).toEqual(key)
    const second = JSON.parse(readFileSync(join(dir, "b.json"), "utf8"))
    expect(() => verifySavedSwapQuoteMac(second, key)).not.toThrow()
  })

  it("a file saved by quote --out executes with --quote", async () => {
    ctx.mockClient.get.mockResolvedValue(QUOTE_RESPONSE)
    const file = join(dir, "saved.json")
    await run(["quote", ...QUOTE_ARGS, "--address", WALLET, "--out", file])
    ctx.mockClient.get.mockClear()

    await run(["execute", "--quote", file])

    expect(wallet.sendTransaction).toHaveBeenCalledOnce()
    expect(ctx.mockClient.get).not.toHaveBeenCalled()
  })

  it("execute --quote refuses a file with no mac before creating the wallet", async () => {
    loadOrCreateQuoteKey()
    const file = writeRaw(freshSaved())

    await expect(run(["execute", "--quote", file])).rejects.toThrow(
      "only quote files saved by `opensea swaps quote --out` on this machine can be executed",
    )
    expect(wallet.getAddress).not.toHaveBeenCalled()
  })

  it("execute --quote refuses a saved file whose calldata was edited", async () => {
    const signed = signSavedSwapQuote(freshSaved(), loadOrCreateQuoteKey())
    signed.response.transactions[0].data = "0xdeadbeef"
    const file = writeRaw(signed)

    await expect(run(["execute", "--quote", file])).rejects.toThrow(
      "Saved swap quote not verified",
    )
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("execute --quote refuses any file on a machine with no quote key", async () => {
    const file = writeRaw(
      signSavedSwapQuote(freshSaved(), new Uint8Array(32).fill(7)),
    )

    await expect(run(["execute", "--quote", file])).rejects.toThrow(
      "this machine has no quote key yet",
    )
    expect(existsSync(getQuoteKeyFile())).toBe(false)
  })

  it("execute --quote signs the saved transactions without requesting a quote", async () => {
    const saved = freshSaved()
    saved.request.recipient = "0x5555555555555555555555555555555555555555"
    const file = writeSaved(saved)

    await run(["execute", "--quote", file])

    expect(wallet.sendTransaction).toHaveBeenCalledExactlyOnceWith({
      to: ROUTER,
      data: "0x12345678abcd",
      value: "1000",
      chainId: 8453,
    })
    expect(ctx.mockClient.get).not.toHaveBeenCalled()
    expect(ctx.mockClient.post).not.toHaveBeenCalled()
    expect(JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string)).toEqual({
      hash: "0xhash",
    })
    expect(stderr()).toContain(
      "1000 smallest units of 0x0000000000000000000000000000000000000000 on base -> 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 on base",
    )
    expect(stderr()).toContain(
      "Sends about $0.21, receives about $0.2 (USD estimates), slippage 0.01",
    )
    expect(stderr()).toContain(
      "Recipient: 0x5555555555555555555555555555555555555555",
    )
    expect(stderr()).toContain(
      `1. to ${ROUTER} on base, value 1000\n     data 0x12345678abcd`,
    )
  })

  it("execute --quote prints each hash as it is sent, before a later send fails", async () => {
    const saved = freshSaved()
    saved.response.transactions = [
      { chain: "base", to: ROUTER, data: "0x095ea7b3", value: "0" },
      { chain: "base", to: ROUTER, data: "0x12345678abcd", value: "1000" },
    ]
    const file = writeSaved(saved)
    wallet.sendTransaction
      .mockResolvedValueOnce({ hash: "0xfirst" })
      .mockRejectedValueOnce(new Error("nonce too low"))

    await expect(run(["execute", "--quote", file])).rejects.toThrow(
      "nonce too low",
    )
    expect(ctx.consoleSpy.mock.calls).toHaveLength(1)
    expect(JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string)).toEqual({
      hash: "0xfirst",
    })
  })

  it("execute --quote --dry-run validates and prints without signing", async () => {
    const file = writeSaved(freshSaved())

    await run(["execute", "--quote", file, "--dry-run"])

    expect(stderr()).toContain(`Recipient: ${WALLET} (the wallet)`)

    expect(wallet.sendTransaction).not.toHaveBeenCalled()
    expect(JSON.parse(ctx.consoleSpy.mock.calls[0][0] as string)).toEqual(
      QUOTE_RESPONSE,
    )
  })

  it("execute --quote --dry-run still refuses a quote for another wallet", async () => {
    wallet.getAddress.mockResolvedValue(
      "0x9999999999999999999999999999999999999999",
    )
    const file = writeSaved(freshSaved())

    await expect(
      run(["execute", "--quote", file, "--dry-run"]),
    ).rejects.toThrow(
      "but the wallet is 0x9999999999999999999999999999999999999999",
    )
    expect(ctx.consoleSpy).not.toHaveBeenCalled()
    expect(stderr()).not.toContain("Saved quote from")
    expect(stderr()).not.toContain("data 0x12345678abcd")
  })

  it("execute --quote refuses an expired quote, and --max-age extends the limit", async () => {
    const saved = freshSaved()
    saved.saved_at = new Date(NOW.getTime() - 200_000).toISOString()
    const file = writeSaved(saved)

    await expect(run(["execute", "--quote", file])).rejects.toThrow(
      "Saved swap quote expired",
    )
    expect(wallet.sendTransaction).not.toHaveBeenCalled()

    await run(["execute", "--quote", file, "--max-age", "300"])
    expect(wallet.sendTransaction).toHaveBeenCalledOnce()
  })

  it("execute --quote refused by --max-age prints the error without the summary or calldata", async () => {
    const saved = freshSaved()
    saved.saved_at = new Date(NOW.getTime() - 200_000).toISOString()
    const file = writeSaved(saved)

    for (const mode of [[], ["--dry-run"]]) {
      await expect(
        run(["execute", "--quote", file, "--max-age", "60", ...mode]),
      ).rejects.toThrow("Saved swap quote expired: saved 200s ago, limit 60s")
    }
    expect(stderr()).not.toContain("Saved quote from")
    expect(stderr()).not.toContain("data 0x12345678abcd")
    expect(ctx.consoleSpy).not.toHaveBeenCalled()
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it("execute --quote refuses a malformed file before creating the wallet", async () => {
    const file = writeRaw(QUOTE_RESPONSE)

    await expect(run(["execute", "--quote", file])).rejects.toThrow(
      'Malformed saved swap quote: type must be "opensea_swap_quote"',
    )
    expect(wallet.getAddress).not.toHaveBeenCalled()
  })

  it("execute --quote reports a file that is not JSON", async () => {
    const file = join(dir, "bad.json")
    writeFileSync(file, "{not json")

    await expect(run(["execute", "--quote", file])).rejects.toThrow(
      `Could not parse --quote '${file}' as JSON`,
    )
  })

  it("execute --quote cannot be combined with quote-shaping flags", async () => {
    const file = writeSaved(freshSaved())

    await expect(
      run([
        "execute",
        "--quote",
        file,
        "--quantity",
        "5",
        "--slippage",
        "0.2",
        "--recipient",
        "0xother",
      ]),
    ).rejects.toThrow(
      "--quote cannot be combined with --quantity, --slippage, --recipient",
    )
    expect(wallet.getAddress).not.toHaveBeenCalled()
  })

  it("execute without --quote still requires the quote flags", async () => {
    await expect(
      run(["execute", "--from-chain", "base", "--quantity", "1"]),
    ).rejects.toThrow(
      "required option(s) not specified: --from-address <address>, --to-chain <chain>, --to-address <address> (or pass --quote <file>)",
    )
    expect(wallet.getAddress).not.toHaveBeenCalled()
  })

  it("execute rejects --max-age without --quote", async () => {
    await expect(
      run(["execute", ...QUOTE_ARGS, "--max-age", "60"]),
    ).rejects.toThrow("--max-age applies only with --quote")
  })

  it("execute without --quote still fetches a fresh quote and signs it", async () => {
    ctx.mockClient.get.mockResolvedValue(QUOTE_RESPONSE)

    await run(["execute", ...QUOTE_ARGS])

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/swap/quote",
      expect.objectContaining({ address: WALLET, quantity: "1000" }),
    )
    expect(wallet.sendTransaction).toHaveBeenCalledOnce()
  })
})
