import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { walletCommand } from "../../src/commands/wallet.js"

const PRIVY_ENV = {
  PRIVY_APP_ID: "test-app",
  PRIVY_APP_SECRET: "test-secret",
  PRIVY_WALLET_ID: "wallet-123",
}

describe("walletCommand", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    fetchSpy = vi.spyOn(globalThis, "fetch")
    for (const [k, v] of Object.entries(PRIVY_ENV)) process.env[k] = v
  })

  afterEach(() => {
    for (const k of Object.keys(PRIVY_ENV)) delete process.env[k]
    vi.restoreAllMocks()
  })

  it("creates command with correct name", () => {
    const cmd = walletCommand(() => "json")
    expect(cmd.name()).toBe("wallet")
  })

  it("warns and prints info when Privy wallet is unhardened", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "wallet-123",
          address: "0xabc",
          chain_type: "ethereum",
          policy_ids: [],
          additional_signers: [],
          owner_id: null,
        }),
        { status: 200 },
      ),
    )

    const cmd = walletCommand(() => "json")
    await cmd.parseAsync(["info"], { from: "user" })

    const warnings = consoleErrorSpy.mock.calls.map(c => c[0] as string)
    expect(warnings.some(w => w.includes("no owner_id"))).toBe(true)
    expect(warnings.some(w => w.includes("no policy_ids"))).toBe(true)

    const out = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(out.provider).toBe("privy")
    expect(out.ownerEnforcesAuthKey).toBe(false)
    expect(out.policyIds).toEqual([])
  })

  it("does not warn when Privy wallet has owner and policy", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "wallet-123",
          address: "0xabc",
          chain_type: "ethereum",
          policy_ids: ["p-1"],
          additional_signers: [{ signer_id: "s-1" }],
          owner_id: "kq-1",
        }),
        { status: 200 },
      ),
    )

    const cmd = walletCommand(() => "json")
    await cmd.parseAsync(["info"], { from: "user" })

    expect(consoleErrorSpy).not.toHaveBeenCalled()
    const out = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(out.ownerEnforcesAuthKey).toBe(true)
  })

  it("exits 1 on auth failure", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("Invalid app ID or app secret", { status: 401 }),
    )
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)

    const cmd = walletCommand(() => "json")
    await cmd.parseAsync(["info"], { from: "user" })

    expect(exitSpy).toHaveBeenCalledWith(1)
    const errOut = consoleErrorSpy.mock.calls[0][0] as string
    expect(errOut).toContain("Wallet error")
  })

  it("generate-auth-key prints a P-256 keypair and never makes a network call", async () => {
    const cmd = walletCommand(() => "json")
    await cmd.parseAsync(["generate-auth-key"], { from: "user" })

    expect(fetchSpy).not.toHaveBeenCalled()
    const out = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(out.privateKey).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(out.publicKey).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(out.privateKey.length).toBeGreaterThan(100)
    expect(out.publicKey.length).toBeGreaterThan(80)
  })

  it("create POSTs to /v1/wallets, warns when no owner key passed", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "wallet-new",
          address: "0xnew",
          chain_type: "ethereum",
          owner_id: null,
        }),
        { status: 200 },
      ),
    )

    const cmd = walletCommand(() => "json")
    await cmd.parseAsync(["create"], { from: "user" })

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.privy.io/v1/wallets",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"chain_type":"ethereum"'),
      }),
    )
    const warnings = consoleErrorSpy.mock.calls.map(c => c[0] as string)
    expect(warnings.some(w => w.includes("no owner_id"))).toBe(true)
    const out = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(out.id).toBe("wallet-new")
    expect(out.ownerId).toBeNull()
  })

  it("create with --owner-public-key passes owner in request and skips warning", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "wallet-2",
          address: "0xsec",
          chain_type: "ethereum",
          owner_id: "kq-new",
        }),
        { status: 200 },
      ),
    )

    const cmd = walletCommand(() => "json")
    await cmd.parseAsync(["create", "--owner-public-key", "BASE64PUBLIC=="], {
      from: "user",
    })

    const reqInit = fetchSpy.mock.calls[0][1] as RequestInit
    const body = JSON.parse(reqInit.body as string)
    expect(body.owner).toEqual({ public_key: "BASE64PUBLIC==" })
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    const out = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(out.ownerId).toBe("kq-new")
  })

  it("create exits 1 when PRIVY_APP_ID is not set", async () => {
    delete process.env.PRIVY_APP_ID
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)

    const cmd = walletCommand(() => "json")
    await cmd.parseAsync(["create"], { from: "user" })

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
