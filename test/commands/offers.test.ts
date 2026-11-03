import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { offersCommand } from "../../src/commands/offers.js"
import {
  type CommandTestContext,
  createCommandTestContext,
  requestedPaths,
  resolveAllRequests,
} from "../mocks.js"

function writeTempJson(data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "cli-test-"))
  const file = join(dir, "body.json")
  writeFileSync(file, JSON.stringify(data))
  return file
}

describe("offersCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with correct subcommands", () => {
    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("offers")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("all")
    expect(subcommands).toContain("collection")
    expect(subcommands).toContain("best-for-nft")
    expect(subcommands).toContain("traits")
    expect(subcommands).toContain("actions")
    expect(subcommands).toContain("fulfillment-actions")
  })

  it("all subcommand fetches all offers", async () => {
    ctx.mockClient.get.mockResolvedValue({ offers: [] })

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["all", "cool-cats", "--limit", "10"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats/all",
      expect.objectContaining({ limit: 10 }),
    )
  })

  it("collection subcommand fetches collection offers", async () => {
    ctx.mockClient.get.mockResolvedValue({ offers: [] })

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["collection", "cool-cats"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats",
      expect.objectContaining({ limit: 20 }),
    )
  })

  it("best-for-nft subcommand fetches best offer", async () => {
    ctx.mockClient.get.mockResolvedValue({})

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["best-for-nft", "cool-cats", "123"], {
      from: "user",
    })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats/nfts/123/best",
    )
  })

  it("traits subcommand sends a numeric range", async () => {
    ctx.mockClient.get.mockResolvedValue({ offers: [] })
    const cmd = offersCommand(ctx.getClient, ctx.getFormat)

    await cmd.parseAsync(
      [
        "traits",
        "cool-cats",
        "--type",
        "Level",
        "--mode",
        "NUMERIC",
        "--min-value",
        "1",
        "--max-value",
        "5.5",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats/traits",
      expect.objectContaining({
        type: "Level",
        mode: "NUMERIC",
        min_value: 1,
        max_value: 5.5,
      }),
    )
  })

  it("traits subcommand sends multi-trait filters and numeric values", async () => {
    ctx.mockClient.get.mockResolvedValue({ offers: [] })
    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    const traits = '[{"traitType":"Background","value":"Red"}]'

    await cmd.parseAsync(["traits", "cool-cats", "--traits", traits], {
      from: "user",
    })
    await cmd.parseAsync(
      ["traits", "cool-cats", "--type", "Level", "--int-value", "3"],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenNthCalledWith(
      1,
      "/api/v2/offers/collection/cool-cats/traits",
      expect.objectContaining({ traits }),
    )
    expect(ctx.mockClient.get).toHaveBeenNthCalledWith(
      2,
      "/api/v2/offers/collection/cool-cats/traits",
      expect.objectContaining({ type: "Level", int_value: 3 }),
    )
  })

  it("traits subcommand requires --type or --traits", async () => {
    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["traits", "cool-cats"], { from: "user" }),
    ).rejects.toThrow("Provide --type or --traits")
  })

  it("traits subcommand rejects a non-numeric --min-value", async () => {
    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(
        ["traits", "cool-cats", "--type", "Level", "--min-value", "abc"],
        { from: "user" },
      ),
    ).rejects.toThrow("--min-value")
  })

  it("traits subcommand passes required options", async () => {
    ctx.mockClient.get.mockResolvedValue({ offers: [] })

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      [
        "traits",
        "cool-cats",
        "--type",
        "Background",
        "--value",
        "Blue",
        "--limit",
        "5",
      ],
      { from: "user" },
    )

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/offers/collection/cool-cats/traits",
      expect.objectContaining({
        type: "Background",
        value: "Blue",
        limit: 5,
      }),
    )
  })

  it("actions posts the request body without normalizing Solana values", async () => {
    ctx.mockClient.post.mockResolvedValue({ steps: [] })
    const body = {
      item: {
        chain: "solana",
        contract: "MintBase58Address",
        token_id: "TokenBase58Address",
      },
      address: "MakerBase58Address",
      quantity: 1,
      price: {
        amount: "1.5",
        currency: "So11111111111111111111111111111111111111112",
      },
    }
    const file = writeTempJson(body)

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["actions", "--body", file], { from: "user" })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/offers/actions",
      body,
    )
  })

  it("fulfillment-actions posts the request body", async () => {
    ctx.mockClient.post.mockResolvedValue({ steps: [] })
    const body = {
      offer: {
        hash: "solana-offer-id",
        chain: "solana",
        protocol_address: "AuctionHouseBase58Address",
      },
      fulfiller: { address: "SellerBase58Address" },
      include_optional_creator_fees: false,
    }
    const file = writeTempJson(body)

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["fulfillment-actions", "--body", file], {
        from: "user",
      })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/offers/fulfillment/actions",
      body,
    )
  })

  it("post submits the signed order unchanged to the chain and protocol offer endpoint", async () => {
    const response = { order_hash: "0xhash", chain: "ethereum" }
    ctx.mockClient.post.mockResolvedValue(response)
    const body = {
      parameters: { offerer: "0xbidder", salt: "2", counter: "0" },
      signature: "0xsig",
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395",
    }
    const file = writeTempJson(body)

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(
        ["post", "ethereum", "--protocol", "seaport", "--body", file],
        { from: "user" },
      )
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.get).not.toHaveBeenCalled()
    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/orders/ethereum/seaport/offers",
      body,
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      JSON.stringify(response, null, 2),
    )
  })

  it("post encodes a chain containing a slash", async () => {
    ctx.mockClient.post.mockResolvedValue({})
    const file = writeTempJson({ signature: "0xsig" })

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["post", "ethereum/../../offers", "--body", file], {
        from: "user",
      })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/orders/ethereum%2F..%2F..%2Foffers/seaport/offers",
      { signature: "0xsig" },
    )
  })

  it("build posts the request body unchanged and prints the response", async () => {
    const response = {
      partialParameters: { consideration: [] },
      criteria: { collection: { slug: "cool-cats" } },
    }
    ctx.mockClient.post.mockResolvedValue(response)
    const body = {
      offerer: "0xbidder",
      quantity: 1,
      criteria: { collection: { slug: "cool-cats" } },
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395",
      offer_protection_enabled: true,
    }
    const file = writeTempJson(body)

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["build", "--body", file], { from: "user" })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.get).not.toHaveBeenCalled()
    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/offers/build",
      body,
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      JSON.stringify(response, null, 2),
    )
  })

  it("post-criteria posts the signed criteria offer unchanged and prints the response", async () => {
    const response = { order_hash: "0xcriteria", chain: "ethereum" }
    ctx.mockClient.post.mockResolvedValue(response)
    const body = {
      protocol_data: { parameters: { offerer: "0xbidder" }, signature: "0xs" },
      criteria: { collection: { slug: "cool-cats" } },
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395",
    }
    const file = writeTempJson(body)

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["post-criteria", "--body", file], {
        from: "user",
      })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.get).not.toHaveBeenCalled()
    expect(ctx.mockClient.post).toHaveBeenCalledWith("/api/v2/offers", body)
    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      JSON.stringify(response, null, 2),
    )
  })

  it("fulfillment-data posts the request body unchanged and prints the response", async () => {
    const response = { protocol: "seaport1.6", fulfillment_data: {} }
    ctx.mockClient.post.mockResolvedValue(response)
    const body = {
      offer: {
        hash: "0xoffer",
        chain: "ethereum",
        protocol_address: "0x0000000000000068f116a894984e2db1123eb395",
      },
      fulfiller: { address: "0xseller" },
      consideration: {
        asset_contract_address: "0xnft",
        token_id: "1",
      },
    }
    const file = writeTempJson(body)

    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["fulfillment-data", "--body", file], {
        from: "user",
      })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.get).not.toHaveBeenCalled()
    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/offers/fulfillment_data",
      body,
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      JSON.stringify(response, null, 2),
    )
  })
})

describe("offersCommand path arguments", () => {
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
    [["all", "cats/1"], "GET /api/v2/offers/collection/cats%2F1/all"],
    [
      ["by-nft", "cats/1", "7/2"],
      "GET /api/v2/offers/collection/cats%2F1/nfts/7%2F2",
    ],
    [["collection", "cats/1"], "GET /api/v2/offers/collection/cats%2F1"],
    [
      ["best-for-nft", "cats/1", "7/2"],
      "GET /api/v2/offers/collection/cats%2F1/nfts/7%2F2/best",
    ],
    [
      ["traits", "cats/1", "--type", "Hat", "--value", "Cap"],
      "GET /api/v2/offers/collection/cats%2F1/traits",
    ],
    [
      ["post", "base/1", "--protocol", "seaport/2", "--body", BODY],
      "POST /api/v2/orders/base%2F1/seaport%2F2/offers",
    ],
  ])("%j encodes every path argument", async (argv, request) => {
    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(
      argv.map(arg => (arg === BODY ? body : arg)),
      { from: "user" },
    )
    expect(requestedPaths(ctx.mockClient)).toEqual([request])
  })

  it.each([".", ".."])("rejects %j before any request", async segment => {
    const cmd = offersCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["by-nft", "cats", segment], { from: "user" }),
    ).rejects.toThrow(`Invalid path segment: "${segment}"`)
    expect(requestedPaths(ctx.mockClient)).toEqual([])
  })
})
