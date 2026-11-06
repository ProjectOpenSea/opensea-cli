import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import type { EvmWalletAdapter } from "@opensea/wallet-adapters"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dropsCommand } from "../../src/commands/drops.js"
import {
  type CommandTestContext,
  createCommandTestContext,
  requestedPaths,
  resolveAllRequests,
} from "../mocks.js"

const walletMock = vi.hoisted(() => ({ createWalletFromEnv: vi.fn() }))

vi.mock("../../src/wallet/index.js", async importOriginal => ({
  ...(await importOriginal<object>()),
  createWalletFromEnv: walletMock.createWalletFromEnv,
}))

const OWNER = "0xAbCdEf0000000000000000000000000000000001"

const publishTx = {
  to: "0x2222222222222222222222222222222222222222",
  from: OWNER,
  data: "0xdeadbeef",
  value: "0",
  chain: "base",
}

function evmWallet(address: string): EvmWalletAdapter {
  return {
    name: "mock",
    chainType: "evm",
    capabilities: {
      signMessage: true,
      signTypedData: false,
      managedGas: false,
      managedNonce: false,
    },
    getAddress: vi.fn(async () => address),
    sendTransaction: vi.fn(async () => ({ hash: "0xhash" })),
  } as EvmWalletAdapter
}

function writeTempFile(name: string, contents: string | Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "cli-test-"))
  const file = join(dir, name)
  writeFileSync(file, contents)
  return file
}

const uploadContext = {
  url: "https://uploads.example.com/",
  method: "POST",
  fields: {
    key: "uploads/manifest.csv",
    "Content-Type": "text/csv",
    success_action_status: "201",
  },
  token: "upload-token",
}

function writeTempJson(data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "cli-test-"))
  const file = join(dir, "body.json")
  writeFileSync(file, JSON.stringify(data))
  return file
}

describe("dropsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
    walletMock.createWalletFromEnv.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct name and subcommands", () => {
    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("drops")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("list")
    expect(subcommands).toContain("get")
    expect(subcommands).toContain("eligibility")
    expect(subcommands).toContain("mint")
    expect(subcommands).toContain("cross-chain-mint")
  })

  it("items lists a drop's saved items with pagination", async () => {
    const page = { items: [], next: "cursor-2" }
    ctx.mockClient.get.mockResolvedValue(page)

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["items", "cool-cats", "--limit", "5", "--next", "cursor-1"],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/drops/cool-cats/items",
      { limit: 5, next: "cursor-1" },
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(JSON.stringify(page, null, 2))
  })

  it("list subcommand passes options", async () => {
    ctx.mockClient.get.mockResolvedValue({ drops: [] })

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "list",
        "--type",
        "upcoming",
        "--chains",
        "ethereum,base",
        "--limit",
        "10",
        "--next",
        "abc",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/drops",
      expect.objectContaining({
        type: "upcoming",
        chains: "ethereum,base",
        limit: 10,
        cursor: "abc",
      }),
    )
  })

  it("get subcommand fetches drop by slug", async () => {
    ctx.mockClient.get.mockResolvedValue({ collection_slug: "cool-cats" })

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/drops/cool-cats")
  })

  it("eligibility subcommand fetches eligibility by slug", async () => {
    const response = {
      stages: [
        {
          stage_uuid: "12345678-1234-1234-1234-123456789abc",
          is_eligible: true,
        },
      ],
    }
    ctx.mockClient.get.mockResolvedValue(response)

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["eligibility", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/drops/cool-cats/eligibility",
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      JSON.stringify(response, null, 2),
    )
  })

  it("eligibility subcommand propagates API errors", async () => {
    const error = new Error("Wallet is not eligible")
    ctx.mockClient.get.mockRejectedValue(error)

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)

    await expect(
      cmd.parseAsync(["eligibility", "cool-cats"], { from: "user" }),
    ).rejects.toBe(error)
  })

  it("mint subcommand posts mint request", async () => {
    ctx.mockClient.post.mockResolvedValue({
      to: "0x123",
      data: "0x",
      value: "0x0",
      chain: "ethereum",
    })

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "mint",
        "cool-cats",
        "--minter",
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        "--quantity",
        "2",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/drops/cool-cats/mint",
      { minter: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", quantity: 2 },
    )
  })

  describe("mint --send", () => {
    const MINTER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    const mintTx = {
      to: "0x4444444444444444444444444444444444444444",
      data: "0xfeed",
      value: "0x2386f26fc10000",
      chain: "base",
    }

    it("mint without --send never opens a wallet", async () => {
      ctx.mockClient.post.mockResolvedValue(mintTx)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["mint", "cool-cats", "--minter", MINTER], {
        from: "user",
      })

      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify(mintTx, null, 2),
      )
      expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
    })

    it("sends from a wallet other than the minter and prints both", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.post.mockResolvedValue(mintTx)
      const payer = "0x9999999999999999999999999999999999999999"
      const wallet = evmWallet(payer)
      walletMock.createWalletFromEnv.mockReturnValue(wallet)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        ["mint", "cool-cats", "--minter", MINTER, "--quantity", "2", "--send"],
        { from: "user" },
      )

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/drops/cool-cats/mint",
        { minter: MINTER, quantity: 2 },
      )
      expect(wallet.sendTransaction).toHaveBeenCalledWith({
        to: mintTx.to,
        data: mintTx.data,
        value: "10000000000000000",
        chainId: 8453,
      })
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify(
          { hash: "0xhash", chain: "base", from: payer, minter: MINTER },
          null,
          2,
        ),
      )
      expect(stderr.mock.calls.flat().join("\n")).toContain(
        `Minting 2 from ${payer} to minter ${MINTER}`,
      )
    })

    it("rejects a Solana wallet before building the transaction", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit")
      })
      walletMock.createWalletFromEnv.mockReturnValue({
        name: "svm-mock",
        chainType: "svm",
        capabilities: {},
        getAddress: async () => "So11111111111111111111111111111111111111112",
        signTransaction: async () => ({ signedTransaction: "" }),
      })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(["mint", "cool-cats", "--minter", MINTER, "--send"], {
          from: "user",
        }),
      ).rejects.toThrow("process.exit")

      expect(ctx.mockClient.post).not.toHaveBeenCalled()
      expect(stderr.mock.calls.flat().join("\n")).toContain(
        "drop mint requires an EVM wallet",
      )
    })

    it("rejects a bad --quantity before opening a wallet", async () => {
      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(
          [
            "mint",
            "cool-cats",
            "--minter",
            MINTER,
            "--quantity",
            "x",
            "--send",
          ],
          { from: "user" },
        ),
      ).rejects.toThrow("--quantity")

      expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
    })
  })

  it("cross-chain-mint posts payer, minter, quantity, and payment asset", async () => {
    ctx.mockClient.post.mockResolvedValue({
      transactions: [],
      receipt_request: {
        swap_quote: { from_assets: [] },
        relay_request_id: "0xrequest",
      },
    })

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "cross-chain-mint",
        "pyro-on-ape",
        "--payer",
        "0x1111111111111111111111111111111111111111",
        "--minter",
        "0x2222222222222222222222222222222222222222",
        "--payment-chain",
        "base",
        "--payment-token",
        "0x0000000000000000000000000000000000000000",
        "--quantity",
        "2",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/drops/pyro-on-ape/cross_chain_mint",
      {
        payer: "0x1111111111111111111111111111111111111111",
        minter: "0x2222222222222222222222222222222222222222",
        quantity: 2,
        payment: {
          chain: "base",
          token_address: "0x0000000000000000000000000000000000000000",
        },
      },
    )
  })

  it("save-edits posts the request body", async () => {
    ctx.mockClient.post.mockResolvedValue({ success: true })
    const body = { stages: [] }
    const file = writeTempJson(body)

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["save-edits", "cool-cats", "--body", file], {
        from: "user",
      })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/drops/cool-cats",
      body,
    )
  })

  it("create-allowlist-upload posts to the allowlist endpoint", async () => {
    ctx.mockClient.post.mockResolvedValue({ upload_url: "https://x" })

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["create-allowlist-upload", "cool-cats"], {
      from: "user",
    })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/drops/cool-cats/allowlist",
    )
  })

  it("update-item PATCHes a drop item by token id", async () => {
    ctx.mockClient.patch.mockResolvedValue({ success: true })
    const body = { media_token: "t", name: "Item" }
    const file = writeTempJson(body)

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["update-item", "cool-cats", "7", "--body", file], {
        from: "user",
      })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.patch).toHaveBeenCalledWith(
      "/api/v2/drops/cool-cats/items/7",
      body,
    )
  })

  it("update-self-mint-item PUTs a self-mint item by token id", async () => {
    ctx.mockClient.put.mockResolvedValue({ success: true })
    const body = { media_token: "t", name: "Item" }
    const file = writeTempJson(body)

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(
        ["update-self-mint-item", "cool-cats", "7", "--body", file],
        { from: "user" },
      )
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.put).toHaveBeenCalledWith(
      "/api/v2/drops/cool-cats/items/7",
      body,
    )
  })

  describe("publish and unpublish", () => {
    it("publish without --send prints the transaction and never opens a wallet", async () => {
      ctx.mockClient.post.mockResolvedValue(publishTx)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["publish", "cool-cats"], { from: "user" })

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/drops/cool-cats/publish",
      )
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify(publishTx, null, 2),
      )
      expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
    })

    it("unpublish posts to the unpublish endpoint", async () => {
      ctx.mockClient.post.mockResolvedValue(publishTx)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["unpublish", "cool-cats"], { from: "user" })

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/drops/cool-cats/unpublish",
      )
    })

    it("publish --send refuses a wallet that is not the transaction's from", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.post.mockResolvedValue(publishTx)
      const wallet = evmWallet("0x9999999999999999999999999999999999999999")
      walletMock.createWalletFromEnv.mockReturnValue(wallet)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(["publish", "cool-cats", "--send"], { from: "user" }),
      ).rejects.toThrow(`is not the contract owner ${OWNER}`)

      expect(wallet.sendTransaction).not.toHaveBeenCalled()
      expect(ctx.consoleSpy).not.toHaveBeenCalled()
    })

    it("publish --send rejects a Solana wallet before building the transaction", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit")
      })
      walletMock.createWalletFromEnv.mockReturnValue({
        name: "svm-mock",
        chainType: "svm",
        capabilities: {},
        getAddress: async () => "So11111111111111111111111111111111111111112",
        signTransaction: async () => ({ signedTransaction: "" }),
      })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(["publish", "cool-cats", "--send"], { from: "user" }),
      ).rejects.toThrow("process.exit")

      expect(ctx.mockClient.post).not.toHaveBeenCalled()
      expect(stderr.mock.calls.flat().join("\n")).toContain(
        "drop publish requires an EVM wallet",
      )
    })

    it("publish --send signs from the owner, matching its address case-insensitively", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.post.mockResolvedValue(publishTx)
      const wallet = evmWallet(OWNER.toLowerCase())
      walletMock.createWalletFromEnv.mockReturnValue(wallet)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["publish", "cool-cats", "--send"], {
        from: "user",
      })

      expect(wallet.sendTransaction).toHaveBeenCalledWith({
        to: publishTx.to,
        data: publishTx.data,
        value: publishTx.value,
        chainId: 8453,
      })
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ hash: "0xhash" }, null, 2),
      )
      expect(stderr.mock.calls.flat().join("\n")).toContain(
        "Sending publish transaction",
      )
    })
  })

  describe("deploy and deploy-receipt", () => {
    const deployTx = {
      to: "0x2222222222222222222222222222222222222222",
      data: "0xdeadbeef",
      value: "0x0",
      chain: "base",
    }
    const deployArgs = [
      "deploy",
      "--chain",
      "base",
      "--name",
      "A",
      "--symbol",
      "A",
      "--drop-type",
      "seadrop_v2_erc1155_self_mint",
      "--token-type",
      "erc1155_clone",
      "--sender",
      OWNER,
    ]

    afterEach(() => {
      vi.useRealTimers()
    })

    it("deploy without --send prints the transaction and never opens a wallet", async () => {
      ctx.mockClient.post.mockResolvedValue(deployTx)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(deployArgs, { from: "user" })

      expect(ctx.mockClient.post).toHaveBeenCalledWith("/api/v2/drops/deploy", {
        chain: "base",
        contract_name: "A",
        contract_symbol: "A",
        drop_type: "seadrop_v2_erc1155_self_mint",
        token_type: "erc1155_clone",
        sender: OWNER,
      })
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify(deployTx, null, 2),
      )
      expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
    })

    it("deploy --send signs from --sender, passes value as decimal wei, and names the receipt step", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.post.mockResolvedValue({ ...deployTx, value: "0x10" })
      const wallet = evmWallet(OWNER.toLowerCase())
      walletMock.createWalletFromEnv.mockReturnValue(wallet)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync([...deployArgs, "--send"], { from: "user" })

      expect(wallet.sendTransaction).toHaveBeenCalledWith({
        to: deployTx.to,
        data: deployTx.data,
        value: "16",
        chainId: 8453,
      })
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ hash: "0xhash", chain: "base" }, null, 2),
      )
      expect(stderr.mock.calls.flat().join("\n")).toContain(
        "Next: opensea drops deploy-receipt base 0xhash --wait",
      )
    })

    it("deploy --send refuses a wallet that is not --sender", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.post.mockResolvedValue(deployTx)
      const wallet = evmWallet("0x9999999999999999999999999999999999999999")
      walletMock.createWalletFromEnv.mockReturnValue(wallet)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync([...deployArgs, "--send"], { from: "user" }),
      ).rejects.toThrow(`is not the deploy sender ${OWNER}`)

      expect(wallet.sendTransaction).not.toHaveBeenCalled()
      expect(ctx.consoleSpy).not.toHaveBeenCalled()
    })

    it("deploy --send refuses a value that is not a number", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.post.mockResolvedValue({ ...deployTx, value: "lots" })
      const wallet = evmWallet(OWNER)
      walletMock.createWalletFromEnv.mockReturnValue(wallet)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync([...deployArgs, "--send"], { from: "user" }),
      ).rejects.toThrow("Drop transaction has an invalid value: lots")

      expect(wallet.sendTransaction).not.toHaveBeenCalled()
    })

    it("deploy --send refuses a contract-creation transaction with no to", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.post.mockResolvedValue({ ...deployTx, to: null })
      const wallet = evmWallet(OWNER)
      walletMock.createWalletFromEnv.mockReturnValue(wallet)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync([...deployArgs, "--send"], { from: "user" }),
      ).rejects.toThrow("contract-creation transaction with no `to` address")

      expect(wallet.sendTransaction).not.toHaveBeenCalled()
    })

    it("deploy rejects an unknown --drop-type before any request", async () => {
      const args = [...deployArgs]
      args[args.indexOf("--drop-type") + 1] = "seadrop_v9"

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(cmd.parseAsync(args, { from: "user" })).rejects.toThrow(
        'Invalid value for --drop-type: "seadrop_v9"',
      )

      expect(ctx.mockClient.post).not.toHaveBeenCalled()
    })

    it("deploy --send rejects a Solana wallet before building the transaction", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit")
      })
      walletMock.createWalletFromEnv.mockReturnValue({
        name: "svm-mock",
        chainType: "svm",
        capabilities: {},
        getAddress: async () => "So11111111111111111111111111111111111111112",
        signTransaction: async () => ({ signedTransaction: "" }),
      })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync([...deployArgs, "--send"], { from: "user" }),
      ).rejects.toThrow("process.exit")

      expect(ctx.mockClient.post).not.toHaveBeenCalled()
      expect(stderr.mock.calls.flat().join("\n")).toContain(
        "drop deploy requires an EVM wallet",
      )
    })

    it("deploy-receipt without --wait fetches the receipt once", async () => {
      ctx.mockClient.get.mockResolvedValue({ status: "pending" })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["deploy-receipt", "base", "0xabc"], {
        from: "user",
      })

      expect(ctx.mockClient.get).toHaveBeenCalledTimes(1)
      expect(ctx.mockClient.get).toHaveBeenCalledWith(
        "/api/v2/drops/deploy/base/0xabc/receipt",
      )
    })

    it("deploy-receipt --wait polls past a slugless success until the slug appears", async () => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockImplementation(() => {})
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never)
      const done = {
        status: "success",
        contract_address: "0x3333333333333333333333333333333333333333",
        chain: "base",
        collection_slug: "my-drop",
      }
      ctx.mockClient.get
        .mockResolvedValueOnce({ status: "pending" })
        .mockResolvedValueOnce({ ...done, collection_slug: null })
        .mockResolvedValueOnce(done)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      const run = cmd.parseAsync(
        ["deploy-receipt", "base", "0xabc", "--wait"],
        { from: "user" },
      )
      await vi.advanceTimersByTimeAsync(10_000)
      await run

      expect(ctx.mockClient.get).toHaveBeenCalledTimes(3)
      expect(ctx.consoleSpy).toHaveBeenCalledWith(JSON.stringify(done, null, 2))
      expect(exitSpy).not.toHaveBeenCalled()
    })

    it("deploy-receipt --wait exits non-zero on a failed deploy", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never)
      ctx.mockClient.get.mockResolvedValue({ status: "failed" })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["deploy-receipt", "base", "0xabc", "--wait"], {
        from: "user",
      })

      expect(ctx.mockClient.get).toHaveBeenCalledTimes(1)
      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(stderr.mock.calls.flat().join("\n")).toContain(
        "Error: deploy 0xabc failed",
      )
    })

    it("deploy-receipt --wait gives up after --wait-timeout and names the contract", async () => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.get.mockResolvedValue({
        status: "success",
        contract_address: "0x3333333333333333333333333333333333333333",
        collection_slug: null,
      })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      const run = cmd.parseAsync(
        [
          "deploy-receipt",
          "base",
          "0xabc",
          "--wait",
          "--interval",
          "5",
          "--wait-timeout",
          "12",
        ],
        { from: "user" },
      )
      const outcome = expect(run).rejects.toThrow(
        "Timed out after 12000ms waiting for deploy 0xabc; the contract is at 0x3333333333333333333333333333333333333333",
      )
      await vi.advanceTimersByTimeAsync(12_000)
      await outcome

      // Polls at 0s, 5s, 10s and a last time at the 12s deadline.
      expect(ctx.mockClient.get).toHaveBeenCalledTimes(4)
    })

    it("deploy-receipt --wait reports a still-pending status on timeout", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.get.mockResolvedValue({ status: "pending" })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(
          ["deploy-receipt", "base", "0xabc", "--wait", "--wait-timeout", "0"],
          { from: "user" },
        ),
      ).rejects.toThrow("its status is still pending")
    })

    it("deploy-receipt rejects bad wait options before polling", async () => {
      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(
          ["deploy-receipt", "base", "0xabc", "--wait", "--interval", "0"],
          { from: "user" },
        ),
      ).rejects.toThrow("--interval must be at least 1 second")

      expect(ctx.mockClient.get).not.toHaveBeenCalled()
    })
  })

  describe("upload-metadata-ipfs", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it("prints the started upload without --wait", async () => {
      ctx.mockClient.post.mockResolvedValue({ workflow_execution_id: "run-1" })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["upload-metadata-ipfs", "cool-cats"], {
        from: "user",
      })

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/drops/cool-cats/metadata/ipfs",
      )
      expect(ctx.mockClient.get).not.toHaveBeenCalled()
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ workflow_execution_id: "run-1" }, null, 2),
      )
    })

    it("--wait polls until completed and prints the final status", async () => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockImplementation(() => {})
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never)
      ctx.mockClient.post.mockResolvedValue({ workflow_execution_id: "run-1" })
      ctx.mockClient.get
        .mockResolvedValueOnce({ status: "running", media_upload_progress: 50 })
        .mockResolvedValueOnce({ status: "completed" })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      const run = cmd.parseAsync(
        ["upload-metadata-ipfs", "cool-cats", "--wait"],
        { from: "user" },
      )
      await vi.advanceTimersByTimeAsync(5_000)
      await run

      expect(ctx.mockClient.get).toHaveBeenCalledTimes(2)
      expect(ctx.mockClient.get).toHaveBeenLastCalledWith(
        "/api/v2/drops/cool-cats/metadata/ipfs/run-1",
      )
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify(
          { workflow_execution_id: "run-1", status: "completed" },
          null,
          2,
        ),
      )
      expect(exitSpy).not.toHaveBeenCalled()
    })

    it("--wait exits non-zero with the failure reason on failed", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never)
      ctx.mockClient.post.mockResolvedValue({ workflow_execution_id: "run-1" })
      ctx.mockClient.get.mockResolvedValue({
        status: "failed",
        failure_reason: "pin failed",
      })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["upload-metadata-ipfs", "cool-cats", "--wait"], {
        from: "user",
      })

      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(stderr.mock.calls.flat().join("\n")).toContain(
        "IPFS upload failed: pin failed",
      )
    })

    it("rejects bad wait options before starting the upload", async () => {
      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(
          ["upload-metadata-ipfs", "cool-cats", "--wait", "--interval", "0"],
          { from: "user" },
        ),
      ).rejects.toThrow("--interval must be at least 1 second")
      await expect(
        dropsCommand(ctx.getClient, ctx.getFormat).parseAsync(
          [
            "upload-metadata-ipfs",
            "cool-cats",
            "--wait",
            "--wait-timeout",
            "x",
          ],
          { from: "user" },
        ),
      ).rejects.toThrow("--wait-timeout")

      expect(ctx.mockClient.post).not.toHaveBeenCalled()
    })

    it("--wait exits non-zero when the upload is not found", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never)
      ctx.mockClient.post.mockResolvedValue({ workflow_execution_id: "run-1" })
      ctx.mockClient.get.mockResolvedValue({ status: "not_found" })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["upload-metadata-ipfs", "cool-cats", "--wait"], {
        from: "user",
      })

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it("--wait gives up after --wait-timeout while still running", async () => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.post.mockResolvedValue({ workflow_execution_id: "run-1" })
      ctx.mockClient.get.mockResolvedValue({ status: "running" })

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      const run = cmd.parseAsync(
        [
          "upload-metadata-ipfs",
          "cool-cats",
          "--wait",
          "--interval",
          "5",
          "--wait-timeout",
          "12",
        ],
        { from: "user" },
      )
      const outcome = expect(run).rejects.toThrow("Timed out after 12000ms")
      await vi.advanceTimersByTimeAsync(12_000)
      await outcome

      // Polls at 0s, 5s, 10s and a last time at the 12s deadline.
      expect(ctx.mockClient.get).toHaveBeenCalledTimes(4)
    })
  })

  it("metadata-ipfs-status fetches progress for the execution id", async () => {
    ctx.mockClient.get.mockResolvedValue({ status: "running" })

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["metadata-ipfs-status", "cool-cats", "run-1"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/drops/cool-cats/metadata/ipfs/run-1",
    )
  })

  it("create-manifest-upload posts to the manifest endpoint without a body", async () => {
    ctx.mockClient.post.mockResolvedValue(uploadContext)

    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["create-manifest-upload", "cool-cats"], {
      from: "user",
    })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/drops/cool-cats/items/manifest",
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      JSON.stringify(uploadContext, null, 2),
    )
  })

  describe("upload-file", () => {
    const files: string[] = []

    afterEach(() => {
      for (const file of files.splice(0)) rmSync(file, { force: true })
    })

    function tempFile(name: string, contents: string | Uint8Array): string {
      const file = writeTempFile(name, contents)
      files.push(file)
      return file
    }

    it("sends every field unchanged, then the file last, and prints the token", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }))
      const contextFile = tempFile(
        "context.json",
        JSON.stringify(uploadContext),
      )
      const csv = "tokenID,name,description,file_name\n1,One,First,1.png\n"
      const csvFile = tempFile("manifest.csv", csv)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        ["upload-file", "--context", contextFile, "--file", csvFile],
        { from: "user" },
      )

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(uploadContext.url)
      expect(init.method).toBe("POST")
      expect(init.redirect).toBe("error")
      expect(init.headers).toBeUndefined()
      const form = init.body as FormData
      const entries = [...form.entries()]
      expect(entries.map(([name]) => name)).toEqual([
        "key",
        "Content-Type",
        "success_action_status",
        "file",
      ])
      expect(Object.fromEntries(entries.slice(0, 3))).toEqual(
        uploadContext.fields,
      )
      const file = form.get("file") as File
      expect(file.name).toBe("manifest.csv")
      expect(await file.text()).toBe(csv)
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ token: "upload-token" }, null, 2),
      )
    })

    it("reads the context from stdin with --context -", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }))
      vi.spyOn(process, "stdin", "get").mockReturnValue(
        Readable.from([
          Buffer.from(JSON.stringify(uploadContext)),
        ]) as unknown as typeof process.stdin,
      )
      const file = tempFile("image.png", new Uint8Array([1, 2, 3]))

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["upload-file", "--context", "-", "--file", file], {
        from: "user",
      })

      expect(fetchSpy.mock.calls[0]?.[0]).toBe(uploadContext.url)
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ token: "upload-token" }, null, 2),
      )
    })

    it("uses --index to pick one context from an array", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }))
      const second = {
        ...uploadContext,
        url: "https://uploads.example.com/second",
        token: "second-token",
      }
      const contextFile = tempFile(
        "contexts.json",
        JSON.stringify([uploadContext, second]),
      )
      const file = tempFile("2.png", new Uint8Array([2]))

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(
          ["upload-file", "--context", contextFile, "--file", file],
          { from: "user" },
        ),
      ).rejects.toThrow("pass --index <n>")
      expect(fetchSpy).not.toHaveBeenCalled()

      await dropsCommand(ctx.getClient, ctx.getFormat).parseAsync(
        [
          "upload-file",
          "--context",
          contextFile,
          "--file",
          file,
          "--index",
          "1",
        ],
        { from: "user" },
      )
      expect(fetchSpy.mock.calls[0]?.[0]).toBe(second.url)
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ token: "second-token" }, null, 2),
      )
    })

    it("sends the raw bytes for a PUT context", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }))
      const putContext = {
        url: "https://uploads.example.com/put",
        method: "PUT",
        fields: {},
        token: "put-token",
      }
      const contextFile = tempFile("context.json", JSON.stringify(putContext))
      const file = tempFile("image.png", new Uint8Array([7, 8, 9]))

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        ["upload-file", "--context", contextFile, "--file", file],
        { from: "user" },
      )

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(putContext.url)
      expect(init.method).toBe("PUT")
      expect(init.redirect).toBe("error")
      expect(init.headers).toBeUndefined()
      const body = init.body as Blob
      expect(body).toBeInstanceOf(Blob)
      expect([...new Uint8Array(await body.arrayBuffer())]).toEqual([7, 8, 9])
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ token: "put-token" }, null, 2),
      )
    })

    it("refuses a context url that is not https", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
      const file = tempFile("manifest.csv", "tokenID\n")
      for (const url of ["http://uploads.example.com/", "file:///etc/passwd"]) {
        const contextFile = tempFile(
          "context.json",
          JSON.stringify({ ...uploadContext, url }),
        )
        await expect(
          dropsCommand(ctx.getClient, ctx.getFormat).parseAsync(
            ["upload-file", "--context", contextFile, "--file", file],
            { from: "user" },
          ),
        ).rejects.toThrow("must use https")
      }
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it("fails with only the status on a non-2xx upload, never the body", async () => {
      const body = `<Error><Code>AccessDenied</Code>${"x".repeat(1_000)}</Error>`
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(body, { status: 403 }),
      )
      const contextFile = tempFile(
        "context.json",
        JSON.stringify(uploadContext),
      )
      const file = tempFile("manifest.csv", "tokenID\n")

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      const run = cmd.parseAsync(
        ["upload-file", "--context", contextFile, "--file", file],
        { from: "user" },
      )

      await expect(run).rejects.toThrow(/^Storage upload failed with HTTP 403$/)
      await expect(run).rejects.toSatisfy(
        (error: Error) =>
          !error.message.includes("AccessDenied") &&
          !error.message.includes("x".repeat(10)),
      )
      expect(ctx.consoleSpy).not.toHaveBeenCalled()
    })
  })
  describe("item media upload batches", () => {
    const UUID_PATTERN =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    const dirs: string[] = []
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    })

    afterEach(() => {
      for (const dir of dirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    function mediaDir(names: string[]): string {
      const dir = mkdtempSync(join(tmpdir(), "cli-media-"))
      dirs.push(dir)
      for (const name of names) writeFileSync(join(dir, name), name)
      return dir
    }

    function contextsFor(filenames: string[]) {
      return filenames.map(name => ({
        ...uploadContext,
        fields: { ...uploadContext.fields, key: `uploads/${name}` },
        token: `token-${name}`,
      }))
    }

    function mockDropMediaApi() {
      ctx.mockClient.post.mockImplementation(
        async (path: string, body?: { filenames: string[] }) => {
          if (path.endsWith("/items/media")) {
            return contextsFor(body?.filenames ?? [])
          }
          if (path.endsWith("/items/manifest")) return uploadContext
          return { success: true }
        },
      )
    }

    function postsTo(suffix: string) {
      return ctx.mockClient.post.mock.calls.filter(([path]) =>
        (path as string).endsWith(suffix),
      )
    }

    it("upload-items uploads a folder in one batch and saves it by filename", async () => {
      mockDropMediaApi()
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () => new Response(null, { status: 204 }))
      const dir = mediaDir(["10.png", "2.png", "1.png", ".DS_Store", "m.csv"])
      mkdirSync(join(dir, "nested"))

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(["upload-items", "cool-cats", dir], {
        from: "user",
      })

      const uploads = postsTo("/items/media")
      expect(uploads).toHaveLength(1)
      const [path, body] = uploads[0] as [
        string,
        { filenames: string[]; upload_batch_id: string },
      ]
      expect(path).toBe("/api/v2/drops/cool-cats/items/media")
      expect(body.filenames).toEqual(["1.png", "2.png", "10.png"])
      expect(body.upload_batch_id).toMatch(UUID_PATTERN)

      expect(fetchSpy).toHaveBeenCalledTimes(3)
      const uploadedKeys = fetchSpy.mock.calls.map(call => {
        const form = (call[1] as RequestInit).body as FormData
        return [form.get("key"), (form.get("file") as File).name]
      })
      expect(uploadedKeys).toEqual(
        expect.arrayContaining([
          ["uploads/1.png", "1.png"],
          ["uploads/2.png", "2.png"],
          ["uploads/10.png", "10.png"],
        ]),
      )

      expect(postsTo("/items/manifest")).toHaveLength(0)
      expect(postsTo("/items/media/save-batch")).toEqual([
        [
          "/api/v2/drops/cool-cats/items/media/save-batch",
          {
            upload_batch_id: body.upload_batch_id,
            filenames: ["1.png", "2.png", "10.png"],
          },
        ],
      ])
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify(
          {
            upload_batch_id: body.upload_batch_id,
            item_count: 3,
            success: true,
          },
          null,
          2,
        ),
      )
    })

    it("upload-items reuses one batch id across 50-file chunks", async () => {
      mockDropMediaApi()
      vi.spyOn(globalThis, "fetch").mockImplementation(
        async () => new Response(null, { status: 204 }),
      )
      const names = Array.from({ length: 120 }, (_, i) => `${i + 1}.png`)
      const dir = mediaDir(names)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        ["upload-items", "cool-cats", dir, "--concurrency", "8"],
        { from: "user" },
      )

      const bodies = postsTo("/items/media").map(
        ([, body]) => body as { filenames: string[]; upload_batch_id: string },
      )
      expect(bodies.map(body => body.filenames.length)).toEqual([50, 50, 20])
      expect(bodies.flatMap(body => body.filenames)).toEqual(names)
      const batchIds = new Set(bodies.map(body => body.upload_batch_id))
      expect(batchIds.size).toBe(1)
      const [batchId] = [...batchIds]
      expect(batchId).toMatch(UUID_PATTERN)
      expect(postsTo("/items/media/save-batch")[0]?.[1]).toEqual({
        upload_batch_id: batchId,
        filenames: names,
      })
    })

    it("upload-items --manifest uploads the manifest before the media and the save", async () => {
      mockDropMediaApi()
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () => new Response(null, { status: 204 }))
      const dir = mediaDir(["1.png"])
      const csv = "tokenID,name,description,file_name\n7,Seven,Lucky,1.png\n"
      const manifest = join(dir, "manifest.csv")
      writeFileSync(manifest, csv)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        ["upload-items", "cool-cats", dir, "--manifest", manifest],
        { from: "user" },
      )

      expect(ctx.mockClient.post.mock.calls.map(([path]) => path)).toEqual([
        "/api/v2/drops/cool-cats/items/manifest",
        "/api/v2/drops/cool-cats/items/media",
        "/api/v2/drops/cool-cats/items/media/save-batch",
      ])
      const firstUpload = (fetchSpy.mock.calls[0]?.[1] as RequestInit)
        .body as FormData
      const manifestFile = firstUpload.get("file") as File
      expect(manifestFile.name).toBe("manifest.csv")
      expect(await manifestFile.text()).toBe(csv)
      expect(postsTo("/items/media")[0]?.[1]).toMatchObject({
        filenames: ["1.png"],
      })
    })

    it("upload-items refuses a symlink rather than uploading its target", async () => {
      const outside = mediaDir(["secret.png"])
      const dir = mediaDir(["1.png"])
      symlinkSync(join(outside, "secret.png"), join(dir, "2.png"))
      const fetchSpy = vi.spyOn(globalThis, "fetch")

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(["upload-items", "cool-cats", dir], { from: "user" }),
      ).rejects.toThrow(`Refusing to upload symlinks in '${dir}': 2.png`)
      expect(ctx.mockClient.post).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it("upload-items does not follow a file swapped for a symlink after listing", async () => {
      mockDropMediaApi()
      const outside = mediaDir(["secret.png"])
      const dir = mediaDir(["1.png"])
      const fetchSpy = vi.spyOn(globalThis, "fetch")
      ctx.mockClient.post.mockImplementationOnce(
        async (_path: string, body?: { filenames: string[] }) => {
          // Swap the listed file for a link once the listing has run.
          rmSync(join(dir, "1.png"))
          symlinkSync(join(outside, "secret.png"), join(dir, "1.png"))
          return contextsFor(body?.filenames ?? [])
        },
      )

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(["upload-items", "cool-cats", dir], { from: "user" }),
      ).rejects.toThrow("Uploading 1.png failed")
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(postsTo("/items/media/save-batch")).toHaveLength(0)
    })

    it("upload-items refuses a file replaced after listing, even without O_NOFOLLOW", async () => {
      mockDropMediaApi()
      const dir = mediaDir(["1.png"])
      const fetchSpy = vi.spyOn(globalThis, "fetch")
      ctx.mockClient.post.mockImplementationOnce(
        async (_path: string, body?: { filenames: string[] }) => {
          // A new file under the listed name has a different inode, which is
          // what a followed link looks like where O_NOFOLLOW is unavailable.
          const replacement = join(dir, "replacement.tmp")
          writeFileSync(replacement, "other")
          rmSync(join(dir, "1.png"))
          renameSync(replacement, join(dir, "1.png"))
          return contextsFor(body?.filenames ?? [])
        },
      )

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(["upload-items", "cool-cats", dir], { from: "user" }),
      ).rejects.toThrow("changed after it was listed")
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(postsTo("/items/media/save-batch")).toHaveLength(0)
    })

    it("upload-items rejects bad input before any request", async () => {
      const cmd = () => dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd().parseAsync(["upload-items", "cool-cats", mediaDir([".hidden"])], {
          from: "user",
        }),
      ).rejects.toThrow("No item media files in")
      await expect(
        cmd().parseAsync(
          [
            "upload-items",
            "cool-cats",
            mediaDir(["1.png"]),
            "--concurrency",
            "0",
          ],
          { from: "user" },
        ),
      ).rejects.toThrow("--concurrency must be at least 1")
      await expect(
        cmd().parseAsync(
          [
            "upload-items",
            "cool-cats",
            mediaDir(["1.png"]),
            "--manifest",
            join(tmpdir(), "missing-manifest.csv"),
          ],
          { from: "user" },
        ),
      ).rejects.toThrow("Could not read --manifest")
      expect(ctx.mockClient.post).not.toHaveBeenCalled()
    })

    it("upload-items names the recovery command when the save fails after every upload", async () => {
      ctx.mockClient.post.mockImplementation(
        async (path: string, body?: { filenames: string[] }) => {
          if (path.endsWith("/items/media")) {
            return contextsFor(body?.filenames ?? [])
          }
          throw new Error("1 of 1 file(s) were not found in this upload")
        },
      )
      vi.spyOn(globalThis, "fetch").mockImplementation(
        async () => new Response(null, { status: 204 }),
      )
      const dir = join(mediaDir([]), "my media")
      mkdirSync(dir)
      writeFileSync(join(dir, "1.png"), "1")

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(["upload-items", "cool-cats", dir], { from: "user" }),
      ).rejects.toThrow("were not found in this upload")

      const batchId = (
        postsTo("/items/media")[0]?.[1] as { upload_batch_id: string }
      ).upload_batch_id
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `opensea drops save-item-media-batch cool-cats --upload-batch-id ${batchId} --dir '${dir}'`,
        ),
      )
    })

    it("create-item-media-upload --upload-batch-id adds the batch id to the body", async () => {
      ctx.mockClient.post.mockResolvedValue([uploadContext])
      const file = writeTempJson({ filenames: ["1.png"] })
      const batchId = "5f0c2b1e-7a4d-4e8b-9c3f-2d6a1b0e9f47"

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      try {
        await cmd.parseAsync(
          [
            "create-item-media-upload",
            "cool-cats",
            "--body",
            file,
            "--upload-batch-id",
            batchId,
          ],
          { from: "user" },
        )
      } finally {
        rmSync(file, { force: true })
      }

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/drops/cool-cats/items/media",
        { filenames: ["1.png"], upload_batch_id: batchId },
      )
    })

    it("save-item-media-batch posts the --body request", async () => {
      ctx.mockClient.post.mockResolvedValue({ success: true })
      const body = {
        upload_batch_id: "5f0c2b1e-7a4d-4e8b-9c3f-2d6a1b0e9f47",
        filenames: ["2.png", "1.png"],
      }
      const file = writeTempJson(body)

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      try {
        await cmd.parseAsync(
          ["save-item-media-batch", "cool-cats", "--body", file],
          { from: "user" },
        )
      } finally {
        rmSync(file, { force: true })
      }

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/drops/cool-cats/items/media/save-batch",
        body,
      )
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ success: true }, null, 2),
      )
    })

    it("save-item-media-batch --dir saves a folder's files in upload-items order", async () => {
      ctx.mockClient.post.mockResolvedValue({ success: true })
      const batchId = "5f0c2b1e-7a4d-4e8b-9c3f-2d6a1b0e9f47"
      const dir = mediaDir(["10.png", "9.png", "manifest.csv"])

      const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        [
          "save-item-media-batch",
          "cool-cats",
          "--upload-batch-id",
          batchId,
          "--dir",
          dir,
        ],
        { from: "user" },
      )

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/drops/cool-cats/items/media/save-batch",
        { upload_batch_id: batchId, filenames: ["9.png", "10.png"] },
      )
    })

    it("save-item-media-batch refuses an incomplete or ambiguous request", async () => {
      const dir = mediaDir(["1.png"])
      const file = writeTempJson({ upload_batch_id: "x", filenames: ["1.png"] })
      const run = (args: string[]) =>
        dropsCommand(ctx.getClient, ctx.getFormat).parseAsync(
          ["save-item-media-batch", "cool-cats", ...args],
          { from: "user" },
        )
      try {
        await expect(run([])).rejects.toThrow(
          "Pass --body, or --upload-batch-id with --dir",
        )
        await expect(run(["--dir", dir])).rejects.toThrow(
          "--dir needs --upload-batch-id",
        )
        await expect(run(["--body", file, "--dir", dir])).rejects.toThrow(
          "Pass either --body or --dir, not both",
        )
      } finally {
        rmSync(file, { force: true })
      }
      expect(ctx.mockClient.post).not.toHaveBeenCalled()
    })
  })
})

describe("dropsCommand path arguments", () => {
  const BODY = "<body>"
  let ctx: CommandTestContext
  let body: string

  beforeEach(() => {
    ctx = createCommandTestContext()
    resolveAllRequests(ctx.mockClient)
    body = writeTempJson({})
  })

  afterEach(() => {
    rmSync(body, { force: true })
    vi.restoreAllMocks()
  })

  it.each<[string[], string]>([
    [["items", "d/1"], "GET /api/v2/drops/d%2F1/items"],
    [["get", "d/1"], "GET /api/v2/drops/d%2F1"],
    [["eligibility", "d/1"], "GET /api/v2/drops/d%2F1/eligibility"],
    [["mint", "d/1", "--minter", "0xm"], "POST /api/v2/drops/d%2F1/mint"],
    [
      [
        "cross-chain-mint",
        "d/1",
        "--payer",
        "0xp",
        "--minter",
        "0xm",
        "--payment-chain",
        "base",
        "--payment-token",
        "0xt",
      ],
      "POST /api/v2/drops/d%2F1/cross_chain_mint",
    ],
    [
      ["deploy-receipt", "base/1", "0xh/2"],
      "GET /api/v2/drops/deploy/base%2F1/0xh%2F2/receipt",
    ],
    [["save-edits", "d/1", "--body", BODY], "POST /api/v2/drops/d%2F1"],
    [["create-allowlist-upload", "d/1"], "POST /api/v2/drops/d%2F1/allowlist"],
    [
      ["validate-allowlist", "d/1", "--body", BODY],
      "POST /api/v2/drops/d%2F1/allowlist/validate",
    ],
    [
      ["save-prereveal-item", "d/1", "--body", BODY],
      "POST /api/v2/drops/d%2F1/prereveal-item",
    ],
    [["save-item", "d/1", "--body", BODY], "POST /api/v2/drops/d%2F1/items"],
    [
      ["update-self-mint-item", "d/1", "7/2", "--body", BODY],
      "PUT /api/v2/drops/d%2F1/items/7%2F2",
    ],
    [
      ["update-item", "d/1", "7/2", "--body", BODY],
      "PATCH /api/v2/drops/d%2F1/items/7%2F2",
    ],
    [
      ["create-item-media-upload", "d/1", "--body", BODY],
      "POST /api/v2/drops/d%2F1/items/media",
    ],
    [
      ["save-item-media-batch", "d/1", "--body", BODY],
      "POST /api/v2/drops/d%2F1/items/media/save-batch",
    ],
    [["publish", "d/1"], "POST /api/v2/drops/d%2F1/publish"],
    [["unpublish", "d/1"], "POST /api/v2/drops/d%2F1/unpublish"],
    [["upload-metadata-ipfs", "d/1"], "POST /api/v2/drops/d%2F1/metadata/ipfs"],
    [
      ["metadata-ipfs-status", "d/1", "wf/2"],
      "GET /api/v2/drops/d%2F1/metadata/ipfs/wf%2F2",
    ],
    [
      ["create-manifest-upload", "d/1"],
      "POST /api/v2/drops/d%2F1/items/manifest",
    ],
  ])("%j encodes every path argument", async (argv, request) => {
    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      argv.map(arg => (arg === BODY ? body : arg)),
      { from: "user" },
    )
    expect(requestedPaths(ctx.mockClient)).toEqual([request])
  })

  it.each([".", ".."])("rejects %j before any request", async segment => {
    const cmd = dropsCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["update-item", "d", segment, "--body", body], {
        from: "user",
      }),
    ).rejects.toThrow(`Invalid path segment: "${segment}"`)
    expect(requestedPaths(ctx.mockClient)).toEqual([])
  })
})
