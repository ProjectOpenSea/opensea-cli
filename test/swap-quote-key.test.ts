import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const race = vi.hoisted(() => ({
  winner: undefined as Buffer | undefined,
  failWith: undefined as string | undefined,
}))

vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return {
    ...actual,
    linkSync: (existing: string, target: string) => {
      // Another process creates the key between our read and our link.
      if (race.winner) actual.writeFileSync(target, race.winner)
      if (race.failWith) {
        throw Object.assign(new Error(race.failWith), { code: race.failWith })
      }
      return actual.linkSync(existing, target)
    },
  }
})

const { getQuoteKeyFile, loadOrCreateQuoteKey, readQuoteKey } = await import(
  "../src/swap-quote-key.js"
)

describe("quote key", () => {
  let dir: string
  let previousConfigDir: string | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "quote-key-"))
    previousConfigDir = process.env.OPENSEA_CONFIG_DIR
    process.env.OPENSEA_CONFIG_DIR = join(dir, "config")
    race.winner = undefined
    race.failWith = undefined
  })

  afterEach(() => {
    process.env.OPENSEA_CONFIG_DIR = previousConfigDir
    rmSync(dir, { recursive: true, force: true })
  })

  it("reads nothing before the key exists", () => {
    expect(readQuoteKey()).toBeUndefined()
  })

  it("keeps the key another process created first and cleans up its temp file", () => {
    race.winner = Buffer.alloc(32, 9)

    const key = loadOrCreateQuoteKey()

    expect(Buffer.from(key)).toEqual(race.winner)
    expect(readFileSync(getQuoteKeyFile())).toEqual(race.winner)
    expect(readdirSync(join(dir, "config"))).toEqual(["quote-key"])
  })

  it("surfaces a link failure other than EEXIST and still removes the temp file", () => {
    race.failWith = "EPERM"

    expect(() => loadOrCreateQuoteKey()).toThrow("EPERM")
    expect(readdirSync(join(dir, "config"))).toEqual([])
  })

  it("refuses a key file that is not 32 bytes", () => {
    mkdirSync(join(dir, "config"))
    writeFileSync(getQuoteKeyFile(), Buffer.alloc(31))

    expect(() => readQuoteKey()).toThrow("is not a 32-byte quote key")
  })

  it("refuses a key path that is not a regular file", () => {
    mkdirSync(getQuoteKeyFile(), { recursive: true })

    expect(() => readQuoteKey()).toThrow("is not a regular file")
  })
})
