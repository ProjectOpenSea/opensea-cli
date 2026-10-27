import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { EvmWalletAdapter } from "@opensea/wallet-adapters"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { collectionsCommand } from "../../src/commands/collections.js"
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

const enforcementTx = {
  to: "0x2222222222222222222222222222222222222222",
  from: OWNER,
  data: "0xa9fcfb33",
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

function writeTempJson(data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "cli-test-"))
  const file = join(dir, "body.json")
  writeFileSync(file, JSON.stringify(data))
  return file
}

describe("collectionsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
    walletMock.createWalletFromEnv.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct name and subcommands", () => {
    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("collections")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("get")
    expect(subcommands).toContain("list")
    expect(subcommands).toContain("stats")
    expect(subcommands).toContain("traits")
  })

  it("get subcommand fetches collection by slug", async () => {
    const mockData = { name: "CoolCats" }
    ctx.mockClient.get.mockResolvedValue(mockData)

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats",
    )
    expect(ctx.consoleSpy).toHaveBeenCalled()
  })

  it("list subcommand passes options correctly", async () => {
    ctx.mockClient.get.mockResolvedValue({ collections: [] })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "list",
        "--chain",
        "ethereum",
        "--limit",
        "5",
        "--order-by",
        "market_cap",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collections",
      expect.objectContaining({
        chain: "ethereum",
        limit: 5,
        order_by: "market_cap",
      }),
    )
  })

  it("stats subcommand fetches collection stats", async () => {
    ctx.mockClient.get.mockResolvedValue({ total: {} })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["stats", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats/stats",
    )
  })

  it("traits subcommand fetches collection traits", async () => {
    ctx.mockClient.get.mockResolvedValue({ categories: {} })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["traits", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith("/api/v2/traits/cool-cats")
  })

  it("trait-floors reads the floors of an encoded slug and prints them", async () => {
    const floors = { chain: "ethereum", floors: [] }
    ctx.mockClient.get.mockResolvedValue(floors)

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["trait-floors", "a/b"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/traits/a%2Fb/floors",
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(JSON.stringify(floors, null, 2))
  })

  it("pfp-profiles sends --next as the cursor and prints the page", async () => {
    const page = { profiles: [{ address: "0xabc" }], next: "page-3" }
    ctx.mockClient.get.mockResolvedValue(page)

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["pfp-profiles", "a/b", "--limit", "5", "--next", "page-2"],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collections/a%2Fb/pfp-profiles",
      { limit: 5, cursor: "page-2" },
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(JSON.stringify(page, null, 2))
  })

  it("top-pfp sends the limit, and the chain as chains", async () => {
    const ranked = { collections: [{ rank: 1, pfp_wearer_count: 9 }] }
    ctx.mockClient.get.mockResolvedValue(ranked)

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["top-pfp", "--limit", "50", "--chain", "base"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/pfp/top-collections",
      { limit: 50, chains: "base" },
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(JSON.stringify(ranked, null, 2))
  })

  it("top-pfp sends the default limit, which the endpoint requires", async () => {
    ctx.mockClient.get.mockResolvedValue({ collections: [] })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["top-pfp"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/pfp/top-collections",
      { limit: 20, chains: undefined },
    )
  })

  it("outputs in table format when getFormat returns table", async () => {
    ctx.mockClient.get.mockResolvedValue({ name: "Test" })
    ctx.getFormat = () => "table"

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get", "test"], { from: "user" })

    expect(ctx.consoleSpy).toHaveBeenCalled()
    const output = ctx.consoleSpy.mock.calls[0][0] as string
    expect(output).toContain("name")
  })

  it("modify PATCHes the collection with the request body", async () => {
    ctx.mockClient.patch.mockResolvedValue({ success: true })
    const body = { description: "gm" }
    const file = writeTempJson(body)

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["modify", "cool-cats", "--body", file], {
        from: "user",
      })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.patch).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats",
      body,
    )
  })

  it("set-visibility PATCHes a boolean hidden flag", async () => {
    ctx.mockClient.patch.mockResolvedValue({ success: true })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["set-visibility", "cool-cats", "--hidden", "true"], {
      from: "user",
    })

    expect(ctx.mockClient.patch).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats/visibility",
      { hidden: true },
    )
  })

  it("set-visibility rejects a non-boolean --hidden value", async () => {
    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["set-visibility", "cool-cats", "--hidden", "maybe"], {
        from: "user",
      }),
    ).rejects.toThrow("--hidden must be 'true' or 'false'")
  })

  it("upload-image posts the required encoded MIME type to the image endpoint", async () => {
    ctx.mockClient.post.mockResolvedValue({ upload_url: "https://x" })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["upload-image", "cool-cats", "logo", "--content-type", "image/png"],
      { from: "user" },
    )

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats/images/logo?content_type=image%2Fpng",
    )
  })

  it("get-metadata reads the saved page", async () => {
    const page = { hero: null, about: null, overview: null }
    ctx.mockClient.get.mockResolvedValue(page)

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["get-metadata", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats/metadata",
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(JSON.stringify(page, null, 2))
  })

  describe("upload-page-media", () => {
    const context = {
      url: "https://uploads.example.com/",
      method: "POST",
      fields: { key: "collection/cool-cats/hero.mp4" },
      token: "page-token",
    }

    it("without --file prints the upload context for the placement", async () => {
      ctx.mockClient.post.mockResolvedValue(context)
      const fetchSpy = vi.spyOn(globalThis, "fetch")

      const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        [
          "upload-page-media",
          "cool-cats",
          "hero_desktop",
          "--content-type",
          "video/mp4",
        ],
        { from: "user" },
      )

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/collections/cool-cats/media/hero_desktop?content_type=video%2Fmp4",
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify(context, null, 2),
      )
    })

    it("with --file uploads the file and prints only the token", async () => {
      ctx.mockClient.post.mockResolvedValue(context)
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }))
      const dir = mkdtempSync(join(tmpdir(), "cli-test-"))
      const file = join(dir, "hero.mp4")
      writeFileSync(file, new Uint8Array([1, 2, 3]))

      const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
      try {
        await cmd.parseAsync(
          [
            "upload-page-media",
            "cool-cats",
            "hero_desktop",
            "--content-type",
            "video/mp4",
            "--file",
            file,
          ],
          { from: "user" },
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(context.url)
      const form = init.body as FormData
      expect([...form.keys()]).toEqual(["key", "file"])
      expect((form.get("file") as File).name).toBe("hero.mp4")
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ token: "page-token" }, null, 2),
      )
    })

    it("reads --file before requesting an upload", async () => {
      const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(
          [
            "upload-page-media",
            "cool-cats",
            "hero_desktop",
            "--content-type",
            "video/mp4",
            "--file",
            join(tmpdir(), "does-not-exist-page-media.mp4"),
          ],
          { from: "user" },
        ),
      ).rejects.toThrow("Could not read --file")
      expect(ctx.mockClient.post).not.toHaveBeenCalled()
    })
  })

  it("set-pricing-currency posts use_stablecoin", async () => {
    ctx.mockClient.post.mockResolvedValue({ success: true, workflow_id: null })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      ["set-pricing-currency", "cool-cats", "--stablecoin", "false"],
      { from: "user" },
    )

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats/pricing_currency",
      { use_stablecoin: false },
    )
  })

  it("set-pricing-currency rejects a non-boolean --stablecoin value", async () => {
    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(
        ["set-pricing-currency", "cool-cats", "--stablecoin", "usdg"],
        { from: "user" },
      ),
    ).rejects.toThrow("--stablecoin must be 'true' or 'false'")
    expect(ctx.mockClient.post).not.toHaveBeenCalled()
  })

  it("creator-fee-enforcement reads the enforcement state", async () => {
    const state = { enabled: false, eligible: true }
    ctx.mockClient.get.mockResolvedValue(state)

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["creator-fee-enforcement", "cool-cats"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats/creator_fee_enforcement",
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(JSON.stringify(state, null, 2))
  })

  describe("set-creator-fee-enforcement", () => {
    it("without --send prints the transactions and never opens a wallet", async () => {
      const built = { transactions: [enforcementTx] }
      ctx.mockClient.post.mockResolvedValue(built)

      const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        ["set-creator-fee-enforcement", "cool-cats", "--enabled", "true"],
        { from: "user" },
      )

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/collections/cool-cats/creator_fee_enforcement",
        { enabled: true },
      )
      expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify(built, null, 2),
      )
    })

    it("--send signs every transaction in order from the owner", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      const second = { ...enforcementTx, data: "0x0badf00d" }
      ctx.mockClient.post.mockResolvedValue({
        transactions: [enforcementTx, second],
      })
      const wallet = evmWallet(OWNER.toLowerCase())
      walletMock.createWalletFromEnv.mockReturnValue(wallet)

      const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        [
          "set-creator-fee-enforcement",
          "cool-cats",
          "--enabled",
          "false",
          "--send",
        ],
        { from: "user" },
      )

      expect(ctx.mockClient.post).toHaveBeenCalledWith(
        "/api/v2/collections/cool-cats/creator_fee_enforcement",
        { enabled: false },
      )
      expect(
        vi.mocked(wallet.sendTransaction).mock.calls.map(([tx]) => tx.data),
      ).toEqual(["0xa9fcfb33", "0x0badf00d"])
      expect(wallet.sendTransaction).toHaveBeenCalledWith({
        to: enforcementTx.to,
        data: enforcementTx.data,
        value: "0",
        chainId: 8453,
      })
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ hashes: ["0xhash", "0xhash"] }, null, 2),
      )
    })

    it("--send reports each sent hash, so a later failure does not hide earlier ones", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.post.mockResolvedValue({
        transactions: [enforcementTx, { ...enforcementTx, data: "0x0badf00d" }],
      })
      const wallet = evmWallet(OWNER)
      vi.mocked(wallet.sendTransaction)
        .mockResolvedValueOnce({ hash: "0xfirst" })
        .mockRejectedValueOnce(new Error("nonce too low"))
      walletMock.createWalletFromEnv.mockReturnValue(wallet)

      const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(
          [
            "set-creator-fee-enforcement",
            "cool-cats",
            "--enabled",
            "true",
            "--send",
          ],
          { from: "user" },
        ),
      ).rejects.toThrow("nonce too low")

      expect(stderr.mock.calls.flat().join("\n")).toContain("Sent 0xfirst")
      expect(ctx.consoleSpy).not.toHaveBeenCalled()
    })

    it("--send refuses before sending anything when any transaction is from another address", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      const other = "0x9999999999999999999999999999999999999999"
      ctx.mockClient.post.mockResolvedValue({
        transactions: [enforcementTx, { ...enforcementTx, from: other }],
      })
      const wallet = evmWallet(OWNER)
      walletMock.createWalletFromEnv.mockReturnValue(wallet)

      const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(
          [
            "set-creator-fee-enforcement",
            "cool-cats",
            "--enabled",
            "true",
            "--send",
          ],
          { from: "user" },
        ),
      ).rejects.toThrow(`is not the contract owner ${other}`)
      expect(wallet.sendTransaction).not.toHaveBeenCalled()
    })

    it("--send with nothing to change says so without opening a wallet", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      ctx.mockClient.post.mockResolvedValue({ transactions: [] })

      const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
      await cmd.parseAsync(
        [
          "set-creator-fee-enforcement",
          "cool-cats",
          "--enabled",
          "false",
          "--send",
        ],
        { from: "user" },
      )

      expect(walletMock.createWalletFromEnv).not.toHaveBeenCalled()
      expect(stderr.mock.calls.flat().join("\n")).toContain(
        "already off; nothing to send",
      )
      expect(ctx.consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ hashes: [] }, null, 2),
      )
    })

    it("rejects a non-boolean --enabled value before any request", async () => {
      const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
      await expect(
        cmd.parseAsync(
          ["set-creator-fee-enforcement", "cool-cats", "--enabled", "yes"],
          { from: "user" },
        ),
      ).rejects.toThrow("--enabled must be 'true' or 'false'")
      expect(ctx.mockClient.post).not.toHaveBeenCalled()
    })
  })

  it("refresh posts to the refresh endpoint", async () => {
    ctx.mockClient.post.mockResolvedValue({ success: true })

    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["refresh", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/collections/cool-cats/refresh",
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      JSON.stringify({ success: true }, null, 2),
    )
  })
})

describe("collectionsCommand path arguments", () => {
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
    [["get", "cats/1"], "GET /api/v2/collections/cats%2F1"],
    [["stats", "cats/1"], "GET /api/v2/collections/cats%2F1/stats"],
    [["traits", "cats/1"], "GET /api/v2/traits/cats%2F1"],
    [["trait-floors", "cats/1"], "GET /api/v2/traits/cats%2F1/floors"],
    [
      ["pfp-profiles", "cats/1"],
      "GET /api/v2/collections/cats%2F1/pfp-profiles",
    ],
    [
      ["offer-aggregates", "cats/1"],
      "GET /api/v2/collections/cats%2F1/offer_aggregates",
    ],
    [["holders", "cats/1"], "GET /api/v2/collections/cats%2F1/holders"],
    [
      ["floor-prices", "cats/1"],
      "GET /api/v2/collections/cats%2F1/floor_prices",
    ],
    [
      ["modify", "cats/1", "--body", BODY],
      "PATCH /api/v2/collections/cats%2F1",
    ],
    [
      ["update-metadata", "cats/1", "--body", BODY],
      "PATCH /api/v2/collections/cats%2F1/metadata",
    ],
    [["get-metadata", "cats/1"], "GET /api/v2/collections/cats%2F1/metadata"],
    [
      ["set-visibility", "cats/1", "--hidden", "true"],
      "PATCH /api/v2/collections/cats%2F1/visibility",
    ],
    [
      ["upload-image", "cats/1", "logo/2", "--content-type", "image/png"],
      "POST /api/v2/collections/cats%2F1/images/logo%2F2?content_type=image%2Fpng",
    ],
    [
      ["upload-page-media", "cats/1", "hero/2", "--content-type", "image/png"],
      "POST /api/v2/collections/cats%2F1/media/hero%2F2?content_type=image%2Fpng",
    ],
    [
      ["set-pricing-currency", "cats/1", "--stablecoin", "true"],
      "POST /api/v2/collections/cats%2F1/pricing_currency",
    ],
    [
      ["creator-fee-enforcement", "cats/1"],
      "GET /api/v2/collections/cats%2F1/creator_fee_enforcement",
    ],
    [
      ["set-creator-fee-enforcement", "cats/1", "--enabled", "true"],
      "POST /api/v2/collections/cats%2F1/creator_fee_enforcement",
    ],
    [["refresh", "cats/1"], "POST /api/v2/collections/cats%2F1/refresh"],
  ])("%j encodes every path argument", async (argv, request) => {
    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      argv.map(arg => (arg === BODY ? body : arg)),
      { from: "user" },
    )
    expect(requestedPaths(ctx.mockClient)).toEqual([request])
  })

  it.each([".", ".."])("rejects %j before any request", async segment => {
    const cmd = collectionsCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["modify", segment, "--body", body], { from: "user" }),
    ).rejects.toThrow(`Invalid path segment: "${segment}"`)
    expect(requestedPaths(ctx.mockClient)).toEqual([])
  })
})
