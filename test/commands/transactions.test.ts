import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { transactionsCommand } from "../../src/commands/transactions.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

function writeTempJson(data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "opensea-cli-transactions-"))
  const file = join(dir, "request.json")
  writeFileSync(file, JSON.stringify(data))
  return file
}

describe("transactionsCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with the receipt subcommand", () => {
    const cmd = transactionsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("transactions")
    expect(cmd.commands.map(c => c.name())).toContain("receipt")
  })

  it("receipt posts the parsed request body to the receipt endpoint", async () => {
    ctx.mockClient.post.mockResolvedValue({ status: "confirmed" })
    const body = { swap_quote: { id: "quote-1" } }
    const file = writeTempJson(body)

    const cmd = transactionsCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(["receipt", "--request", file], { from: "user" })
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/transactions/receipt",
      body,
    )
    expect(ctx.consoleSpy).toHaveBeenCalledWith(
      JSON.stringify({ status: "confirmed" }, null, 2),
    )
  })

  it("names the option and the path when the request file does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "opensea-cli-transactions-"))
    const missing = join(dir, "absent.json")

    const cmd = transactionsCommand(ctx.getClient, ctx.getFormat)
    try {
      await expect(
        cmd.parseAsync(["receipt", "--request", missing], { from: "user" }),
      ).rejects.toThrow(`--request: could not read or parse '${missing}': `)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    expect(ctx.mockClient.post).not.toHaveBeenCalled()
  })

  it("names the option and the path when the request file is not valid JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "opensea-cli-transactions-"))
    const invalid = join(dir, "invalid.json")
    writeFileSync(invalid, "{ not json }")

    const cmd = transactionsCommand(ctx.getClient, ctx.getFormat)
    try {
      await expect(
        cmd.parseAsync(["receipt", "--request", invalid], { from: "user" }),
      ).rejects.toThrow(`--request: could not read or parse '${invalid}': `)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    expect(ctx.mockClient.post).not.toHaveBeenCalled()
  })

  it("requires --request", async () => {
    const cmd = transactionsCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["receipt"], { from: "user" }),
    ).rejects.toThrow()
    expect(ctx.mockClient.post).not.toHaveBeenCalled()
  })
})