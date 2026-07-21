import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ordersCommand } from "../../src/commands/orders.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

function writeTempJson(data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "cli-test-"))
  const file = join(dir, "body.json")
  writeFileSync(file, JSON.stringify(data))
  return file
}

describe("ordersCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with cancel subcommand", () => {
    const cmd = ordersCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("orders")
    expect(cmd.commands.map(c => c.name())).toContain("cancel")
  })

  it("cancel posts to the cancel endpoint without a body by default", async () => {
    ctx.mockClient.post.mockResolvedValue({ success: true })

    const cmd = ordersCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["cancel", "ethereum", "0xproto", "0xhash"], {
      from: "user",
    })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/orders/chain/ethereum/protocol/0xproto/0xhash/cancel",
      undefined,
    )
  })

  it("cancel forwards an optional body", async () => {
    ctx.mockClient.post.mockResolvedValue({ success: true })
    const body = { offererSignature: "0xsig" }
    const file = writeTempJson(body)

    const cmd = ordersCommand(ctx.getClient, ctx.getFormat)
    try {
      await cmd.parseAsync(
        ["cancel", "ethereum", "0xproto", "0xhash", "--body", file],
        { from: "user" },
      )
    } finally {
      rmSync(file, { force: true })
    }

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/orders/chain/ethereum/protocol/0xproto/0xhash/cancel",
      body,
    )
  })
})
