/**
 * End-to-end live tests for the OpenSea CLI.
 *
 * These tests hit the real OpenSea API and require:
 *   LIVE_TEST=true
 *   OPENSEA_API_KEY=<valid key>
 *
 * Run with:
 *   LIVE_TEST=true OPENSEA_API_KEY=xxx npx vitest run test/e2e.test.ts
 */
import { execSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { OpenSeaAPIError } from "../src/client.js"
import { OpenSeaCLI } from "../src/sdk.js"

// ── Gate ────────────────────────────────────────────────────────────────
const LIVE = !!process.env.LIVE_TEST
const API_KEY = process.env.OPENSEA_API_KEY ?? ""

// ── Test fixtures (well-known entities) ─────────────────────────────────
const COLLECTION_SLUG = "boredapeyachtclub"
const NFT_CHAIN = "ethereum"
const NFT_CONTRACT = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" // BAYC
const NFT_TOKEN_ID = "1"
const ACCOUNT_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" // vitalik.eth
const TOKEN_CHAIN = "ethereum"
const TOKEN_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" // WETH

// ── Swap quote fixtures ─────────────────────────────────────────────────
const SWAP_FROM_CHAIN = "ethereum"
const SWAP_FROM_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" // WETH
const SWAP_TO_CHAIN = "ethereum"
const SWAP_TO_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" // USDC
const SWAP_QUANTITY = "1000000000000000" // 0.001 WETH in wei
const SWAP_WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"

// ── CLI binary path ─────────────────────────────────────────────────────
const CLI_BIN = resolve(import.meta.dirname, "..", "dist", "cli.js")

// ── Report accumulator ──────────────────────────────────────────────────
type TestResult = {
  domain: string
  command: string
  format?: string
  layer: "sdk" | "cli" | "parity" | "error"
  passed: boolean
  error?: string
}

const report: TestResult[] = []

function record(entry: Omit<TestResult, "passed">, fn: () => void) {
  try {
    fn()
    report.push({ ...entry, passed: true })
  } catch (err) {
    report.push({
      ...entry,
      passed: false,
      error: (err as Error).message,
    })
    throw err
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Run the CLI binary and return stdout. */
function cli(
  args: string,
  options?: { expectError?: boolean },
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_BIN} --api-key ${API_KEY} ${args}`, {
      encoding: "utf-8",
      timeout: 60_000,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    })
    return { stdout, stderr: "", exitCode: 0 }
  } catch (err) {
    const e = err as {
      stdout?: string
      stderr?: string
      status?: number
    }
    if (options?.expectError) {
      return {
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
        exitCode: e.status ?? 1,
      }
    }
    throw err
  }
}

/** Run the CLI and return stdout for a given format. */
function cliFormatted(args: string, format: string): string {
  return cli(`--format ${format} ${args}`).stdout
}

/** Direct API fetch for parity testing. */
async function directGet<T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const url = new URL(`https://api.opensea.io${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }
  }
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "x-api-key": API_KEY,
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`Direct API ${response.status}: ${await response.text()}`)
  }
  return response.json() as Promise<T>
}

/** Count whitespace-separated tokens (rough heuristic). */
function tokenCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

// ── Format validation helpers ───────────────────────────────────────────
function validateJsonFormat(output: string): void {
  const parsed = JSON.parse(output)
  expect(parsed).toBeDefined()
}

function validateTableFormat(output: string): void {
  const lines = output.trim().split("\n")
  // Table should have at least header + separator + 1 data row, OR key-value pairs
  expect(lines.length).toBeGreaterThanOrEqual(2)
  // Check for separator line (dashes) or key-value format
  const hasSeparator = lines.some(l => /^[-\s]+$/.test(l))
  const hasKeyValue = lines.some(l => l.includes("  "))
  expect(hasSeparator || hasKeyValue).toBe(true)
}

function validateToonFormat(output: string, jsonOutput: string): void {
  expect(output.trim().length).toBeGreaterThan(0)
  // Toon should use fewer tokens than JSON
  expect(tokenCount(output)).toBeLessThan(tokenCount(jsonOutput))
}

// ── Main test suite ─────────────────────────────────────────────────────
describe.runIf(LIVE)("e2e: live API tests", () => {
  let sdk: OpenSeaCLI

  // Ensure the build is fresh
  it("CLI binary exists", () => {
    const result = cli("--version")
    expect(result.stdout.trim()).toMatch(/\d+\.\d+\.\d+/)
  })

  // Instantiate SDK for all tests
  sdk = new OpenSeaCLI({ apiKey: API_KEY })

  // ────────────────────────────────────────────────────────────────────
  //  COLLECTIONS
  // ────────────────────────────────────────────────────────────────────
  describe("collections", () => {
    describe("get", () => {
      it("SDK returns collection data", async () => {
        const result = await sdk.collections.get(COLLECTION_SLUG)
        record({ domain: "collections", command: "get", layer: "sdk" }, () => {
          expect(result).toBeDefined()
          expect(result.name).toBeDefined()
          expect(result.collection).toBe(COLLECTION_SLUG)
        })
      })

      it("CLI json output is valid JSON", () => {
        const output = cliFormatted(
          `collections get ${COLLECTION_SLUG}`,
          "json",
        )
        record(
          {
            domain: "collections",
            command: "get",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })

      it("CLI table output has headers", () => {
        const output = cliFormatted(
          `collections get ${COLLECTION_SLUG}`,
          "table",
        )
        record(
          {
            domain: "collections",
            command: "get",
            format: "table",
            layer: "cli",
          },
          () => validateTableFormat(output),
        )
      })

      it("CLI toon output is compact", () => {
        const jsonOut = cliFormatted(
          `collections get ${COLLECTION_SLUG}`,
          "json",
        )
        const toonOut = cliFormatted(
          `collections get ${COLLECTION_SLUG}`,
          "toon",
        )
        record(
          {
            domain: "collections",
            command: "get",
            format: "toon",
            layer: "cli",
          },
          () => validateToonFormat(toonOut, jsonOut),
        )
      })

      it("parity: SDK vs direct API", async () => {
        const sdkResult = await sdk.collections.get(COLLECTION_SLUG)
        const apiResult = await directGet<typeof sdkResult>(
          `/api/v2/collections/${COLLECTION_SLUG}`,
        )
        record(
          { domain: "collections", command: "get", layer: "parity" },
          () => {
            expect(sdkResult.name).toBe(apiResult.name)
            expect(sdkResult.collection).toBe(apiResult.collection)
          },
        )
      })
    })

    describe("list", () => {
      it("SDK returns collection list", async () => {
        const result = await sdk.collections.list({ limit: 3 })
        record({ domain: "collections", command: "list", layer: "sdk" }, () => {
          expect(result.collections).toBeDefined()
          expect(Array.isArray(result.collections)).toBe(true)
          expect(result.collections.length).toBeGreaterThan(0)
        })
      })

      it("CLI json output is valid JSON", () => {
        const output = cliFormatted("collections list --limit 3", "json")
        record(
          {
            domain: "collections",
            command: "list",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })

      it("CLI table output has headers", () => {
        const output = cliFormatted("collections list --limit 3", "table")
        record(
          {
            domain: "collections",
            command: "list",
            format: "table",
            layer: "cli",
          },
          () => validateTableFormat(output),
        )
      })

      it("CLI toon output is compact", () => {
        const jsonOut = cliFormatted("collections list --limit 3", "json")
        const toonOut = cliFormatted("collections list --limit 3", "toon")
        record(
          {
            domain: "collections",
            command: "list",
            format: "toon",
            layer: "cli",
          },
          () => validateToonFormat(toonOut, jsonOut),
        )
      })
    })

    describe("stats", () => {
      it("SDK returns collection stats", async () => {
        const result = await sdk.collections.stats(COLLECTION_SLUG)
        record(
          { domain: "collections", command: "stats", layer: "sdk" },
          () => {
            expect(result).toBeDefined()
            expect(result.total).toBeDefined()
          },
        )
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `collections stats ${COLLECTION_SLUG}`,
          "json",
        )
        record(
          {
            domain: "collections",
            command: "stats",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })
    })

    describe("traits", () => {
      it("SDK returns collection traits", async () => {
        const result = await sdk.collections.traits(COLLECTION_SLUG)
        record(
          { domain: "collections", command: "traits", layer: "sdk" },
          () => {
            expect(result).toBeDefined()
            expect(result.categories).toBeDefined()
          },
        )
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `collections traits ${COLLECTION_SLUG}`,
          "json",
        )
        record(
          {
            domain: "collections",
            command: "traits",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })
    })
  })

  // ────────────────────────────────────────────────────────────────────
  //  NFTS
  // ────────────────────────────────────────────────────────────────────
  describe("nfts", () => {
    describe("get", () => {
      it("SDK returns NFT data", async () => {
        const result = await sdk.nfts.get(NFT_CHAIN, NFT_CONTRACT, NFT_TOKEN_ID)
        record({ domain: "nfts", command: "get", layer: "sdk" }, () => {
          expect(result).toBeDefined()
          expect(result.nft).toBeDefined()
          expect(result.nft.identifier).toBe(NFT_TOKEN_ID)
        })
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `nfts get ${NFT_CHAIN} ${NFT_CONTRACT} ${NFT_TOKEN_ID}`,
          "json",
        )
        record(
          {
            domain: "nfts",
            command: "get",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })

      it("CLI table output has headers", () => {
        const output = cliFormatted(
          `nfts get ${NFT_CHAIN} ${NFT_CONTRACT} ${NFT_TOKEN_ID}`,
          "table",
        )
        record(
          {
            domain: "nfts",
            command: "get",
            format: "table",
            layer: "cli",
          },
          () => validateTableFormat(output),
        )
      })

      it("CLI toon output is compact", () => {
        const jsonOut = cliFormatted(
          `nfts get ${NFT_CHAIN} ${NFT_CONTRACT} ${NFT_TOKEN_ID}`,
          "json",
        )
        const toonOut = cliFormatted(
          `nfts get ${NFT_CHAIN} ${NFT_CONTRACT} ${NFT_TOKEN_ID}`,
          "toon",
        )
        record(
          {
            domain: "nfts",
            command: "get",
            format: "toon",
            layer: "cli",
          },
          () => validateToonFormat(toonOut, jsonOut),
        )
      })

      it("parity: SDK vs direct API", async () => {
        const sdkResult = await sdk.nfts.get(
          NFT_CHAIN,
          NFT_CONTRACT,
          NFT_TOKEN_ID,
        )
        const apiResult = await directGet<typeof sdkResult>(
          `/api/v2/chain/${NFT_CHAIN}/contract/${NFT_CONTRACT}/nfts/${NFT_TOKEN_ID}`,
        )
        record({ domain: "nfts", command: "get", layer: "parity" }, () => {
          expect(sdkResult.nft.identifier).toBe(apiResult.nft.identifier)
          expect(sdkResult.nft.collection).toBe(apiResult.nft.collection)
        })
      })
    })

    describe("list-by-collection", () => {
      it("SDK returns NFT list", async () => {
        const result = await sdk.nfts.listByCollection(COLLECTION_SLUG, {
          limit: 3,
        })
        record(
          {
            domain: "nfts",
            command: "list-by-collection",
            layer: "sdk",
          },
          () => {
            expect(result.nfts).toBeDefined()
            expect(Array.isArray(result.nfts)).toBe(true)
          },
        )
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `nfts list-by-collection ${COLLECTION_SLUG} --limit 3`,
          "json",
        )
        record(
          {
            domain: "nfts",
            command: "list-by-collection",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })
    })

    describe("list-by-account", () => {
      it("SDK returns NFT list for account", async () => {
        const result = await sdk.nfts.listByAccount(
          NFT_CHAIN,
          ACCOUNT_ADDRESS,
          { limit: 3 },
        )
        record(
          {
            domain: "nfts",
            command: "list-by-account",
            layer: "sdk",
          },
          () => {
            expect(result.nfts).toBeDefined()
            expect(Array.isArray(result.nfts)).toBe(true)
          },
        )
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `nfts list-by-account ${NFT_CHAIN} ${ACCOUNT_ADDRESS} --limit 3`,
          "json",
        )
        record(
          {
            domain: "nfts",
            command: "list-by-account",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })
    })
  })

  // ────────────────────────────────────────────────────────────────────
  //  LISTINGS
  // ────────────────────────────────────────────────────────────────────
  describe("listings", () => {
    describe("all", () => {
      it("SDK returns listings", async () => {
        const result = await sdk.listings.all(COLLECTION_SLUG, {
          limit: 3,
        })
        record({ domain: "listings", command: "all", layer: "sdk" }, () => {
          expect(result.listings).toBeDefined()
          expect(Array.isArray(result.listings)).toBe(true)
        })
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `listings all ${COLLECTION_SLUG} --limit 3`,
          "json",
        )
        record(
          {
            domain: "listings",
            command: "all",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })

      it("CLI table output has headers", () => {
        const output = cliFormatted(
          `listings all ${COLLECTION_SLUG} --limit 3`,
          "table",
        )
        record(
          {
            domain: "listings",
            command: "all",
            format: "table",
            layer: "cli",
          },
          () => validateTableFormat(output),
        )
      })

      it("CLI toon output is compact", () => {
        const jsonOut = cliFormatted(
          `listings all ${COLLECTION_SLUG} --limit 3`,
          "json",
        )
        const toonOut = cliFormatted(
          `listings all ${COLLECTION_SLUG} --limit 3`,
          "toon",
        )
        record(
          {
            domain: "listings",
            command: "all",
            format: "toon",
            layer: "cli",
          },
          () => validateToonFormat(toonOut, jsonOut),
        )
      })

      it("parity: SDK vs direct API", async () => {
        const sdkResult = await sdk.listings.all(COLLECTION_SLUG, {
          limit: 2,
        })
        const apiResult = await directGet<typeof sdkResult>(
          `/api/v2/listings/collection/${COLLECTION_SLUG}/all`,
          { limit: 2 },
        )
        record({ domain: "listings", command: "all", layer: "parity" }, () => {
          expect(sdkResult.listings.length).toBe(apiResult.listings.length)
        })
      })
    })

    describe("best", () => {
      it("SDK returns best listings", async () => {
        const result = await sdk.listings.best(COLLECTION_SLUG, {
          limit: 3,
        })
        record({ domain: "listings", command: "best", layer: "sdk" }, () => {
          expect(result.listings).toBeDefined()
          expect(Array.isArray(result.listings)).toBe(true)
        })
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `listings best ${COLLECTION_SLUG} --limit 3`,
          "json",
        )
        record(
          {
            domain: "listings",
            command: "best",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })
    })

    describe("best-for-nft", () => {
      it("SDK returns best listing for NFT", async () => {
        // This may return empty/error if no listing exists; we just
        // verify the call goes through without a transport error.
        try {
          const result = await sdk.listings.bestForNFT(
            COLLECTION_SLUG,
            NFT_TOKEN_ID,
          )
          record(
            {
              domain: "listings",
              command: "best-for-nft",
              layer: "sdk",
            },
            () => {
              expect(result).toBeDefined()
            },
          )
        } catch (err) {
          // 404 is acceptable — no active listing for this NFT
          if (err instanceof OpenSeaAPIError && err.statusCode === 404) {
            report.push({
              domain: "listings",
              command: "best-for-nft",
              layer: "sdk",
              passed: true,
              error: "404 — no active listing (acceptable)",
            })
          } else {
            throw err
          }
        }
      })

      it("CLI json output is valid or returns expected error", () => {
        const result = cli(
          `--format json listings best-for-nft ${COLLECTION_SLUG} ${NFT_TOKEN_ID}`,
          { expectError: true },
        )
        record(
          {
            domain: "listings",
            command: "best-for-nft",
            format: "json",
            layer: "cli",
          },
          () => {
            if (result.exitCode === 0) {
              validateJsonFormat(result.stdout)
            } else {
              // 404 error for no listing is acceptable
              expect(result.stderr).toBeTruthy()
            }
          },
        )
      })
    })
  })

  // ────────────────────────────────────────────────────────────────────
  //  OFFERS
  // ────────────────────────────────────────────────────────────────────
  describe("offers", () => {
    describe("all", () => {
      it("SDK returns offers", async () => {
        const result = await sdk.offers.all(COLLECTION_SLUG, {
          limit: 3,
        })
        record({ domain: "offers", command: "all", layer: "sdk" }, () => {
          expect(result.offers).toBeDefined()
          expect(Array.isArray(result.offers)).toBe(true)
        })
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `offers all ${COLLECTION_SLUG} --limit 3`,
          "json",
        )
        record(
          {
            domain: "offers",
            command: "all",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })

      it("CLI table output has headers", () => {
        const output = cliFormatted(
          `offers all ${COLLECTION_SLUG} --limit 3`,
          "table",
        )
        record(
          {
            domain: "offers",
            command: "all",
            format: "table",
            layer: "cli",
          },
          () => validateTableFormat(output),
        )
      })

      it("CLI toon output is compact", () => {
        const jsonOut = cliFormatted(
          `offers all ${COLLECTION_SLUG} --limit 3`,
          "json",
        )
        const toonOut = cliFormatted(
          `offers all ${COLLECTION_SLUG} --limit 3`,
          "toon",
        )
        record(
          {
            domain: "offers",
            command: "all",
            format: "toon",
            layer: "cli",
          },
          () => validateToonFormat(toonOut, jsonOut),
        )
      })

      it("parity: SDK vs direct API", async () => {
        const sdkResult = await sdk.offers.all(COLLECTION_SLUG, {
          limit: 2,
        })
        const apiResult = await directGet<typeof sdkResult>(
          `/api/v2/offers/collection/${COLLECTION_SLUG}/all`,
          { limit: 2 },
        )
        record({ domain: "offers", command: "all", layer: "parity" }, () => {
          expect(sdkResult.offers.length).toBe(apiResult.offers.length)
        })
      })
    })

    describe("collection", () => {
      it("SDK returns collection offers", async () => {
        const result = await sdk.offers.collection(COLLECTION_SLUG, {
          limit: 3,
        })
        record(
          { domain: "offers", command: "collection", layer: "sdk" },
          () => {
            expect(result.offers).toBeDefined()
            expect(Array.isArray(result.offers)).toBe(true)
          },
        )
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `offers collection ${COLLECTION_SLUG} --limit 3`,
          "json",
        )
        record(
          {
            domain: "offers",
            command: "collection",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })
    })

    describe("best-for-nft", () => {
      it("SDK returns best offer for NFT", async () => {
        try {
          const result = await sdk.offers.bestForNFT(
            COLLECTION_SLUG,
            NFT_TOKEN_ID,
          )
          record(
            {
              domain: "offers",
              command: "best-for-nft",
              layer: "sdk",
            },
            () => {
              expect(result).toBeDefined()
            },
          )
        } catch (err) {
          if (err instanceof OpenSeaAPIError && err.statusCode === 404) {
            report.push({
              domain: "offers",
              command: "best-for-nft",
              layer: "sdk",
              passed: true,
              error: "404 — no active offer (acceptable)",
            })
          } else {
            throw err
          }
        }
      })
    })

    describe("traits", () => {
      it("SDK returns trait offers", async () => {
        const result = await sdk.offers.traits(COLLECTION_SLUG, {
          type: "Background",
          value: "New Punk Blue",
          limit: 3,
        })
        record({ domain: "offers", command: "traits", layer: "sdk" }, () => {
          expect(result.offers).toBeDefined()
          expect(Array.isArray(result.offers)).toBe(true)
        })
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `offers traits ${COLLECTION_SLUG} --type Background --value "New Punk Blue" --limit 3`,
          "json",
        )
        record(
          {
            domain: "offers",
            command: "traits",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })
    })
  })

  // ────────────────────────────────────────────────────────────────────
  //  EVENTS
  // ────────────────────────────────────────────────────────────────────
  describe("events", () => {
    describe("list", () => {
      it("SDK returns events", async () => {
        const result = await sdk.events.list({ limit: 3 })
        record({ domain: "events", command: "list", layer: "sdk" }, () => {
          expect(result.asset_events).toBeDefined()
          expect(Array.isArray(result.asset_events)).toBe(true)
        })
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted("events list --limit 3", "json")
        record(
          {
            domain: "events",
            command: "list",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })

      it("CLI table output has headers", () => {
        const output = cliFormatted("events list --limit 3", "table")
        record(
          {
            domain: "events",
            command: "list",
            format: "table",
            layer: "cli",
          },
          () => validateTableFormat(output),
        )
      })

      it("CLI toon output is compact", () => {
        const jsonOut = cliFormatted("events list --limit 3", "json")
        const toonOut = cliFormatted("events list --limit 3", "toon")
        record(
          {
            domain: "events",
            command: "list",
            format: "toon",
            layer: "cli",
          },
          () => validateToonFormat(toonOut, jsonOut),
        )
      })

      it("parity: SDK vs direct API", async () => {
        const sdkResult = await sdk.events.list({ limit: 2 })
        const apiResult = await directGet<typeof sdkResult>("/api/v2/events", {
          limit: 2,
        })
        record({ domain: "events", command: "list", layer: "parity" }, () => {
          expect(sdkResult.asset_events.length).toBe(
            apiResult.asset_events.length,
          )
        })
      })
    })

    describe("by-collection", () => {
      it("SDK returns collection events", async () => {
        const result = await sdk.events.byCollection(COLLECTION_SLUG, {
          limit: 3,
        })
        record(
          {
            domain: "events",
            command: "by-collection",
            layer: "sdk",
          },
          () => {
            expect(result.asset_events).toBeDefined()
            expect(Array.isArray(result.asset_events)).toBe(true)
          },
        )
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `events by-collection ${COLLECTION_SLUG} --limit 3`,
          "json",
        )
        record(
          {
            domain: "events",
            command: "by-collection",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })
    })

    describe("by-nft", () => {
      it("SDK returns NFT events", async () => {
        const result = await sdk.events.byNFT(
          NFT_CHAIN,
          NFT_CONTRACT,
          NFT_TOKEN_ID,
          { limit: 3 },
        )
        record({ domain: "events", command: "by-nft", layer: "sdk" }, () => {
          expect(result.asset_events).toBeDefined()
          expect(Array.isArray(result.asset_events)).toBe(true)
        })
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `events by-nft ${NFT_CHAIN} ${NFT_CONTRACT} ${NFT_TOKEN_ID} --limit 3`,
          "json",
        )
        record(
          {
            domain: "events",
            command: "by-nft",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })
    })

    describe("by-account", () => {
      it("SDK returns account events", async () => {
        const result = await sdk.events.byAccount(ACCOUNT_ADDRESS, {
          limit: 3,
        })
        record(
          {
            domain: "events",
            command: "by-account",
            layer: "sdk",
          },
          () => {
            expect(result.asset_events).toBeDefined()
            expect(Array.isArray(result.asset_events)).toBe(true)
          },
        )
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `events by-account ${ACCOUNT_ADDRESS} --limit 3`,
          "json",
        )
        record(
          {
            domain: "events",
            command: "by-account",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })
    })
  })

  // ────────────────────────────────────────────────────────────────────
  //  TOKENS
  // ────────────────────────────────────────────────────────────────────
  describe("tokens", () => {
    describe("trending", () => {
      it("SDK returns trending tokens", async () => {
        const result = await sdk.tokens.trending({ limit: 3 })
        record({ domain: "tokens", command: "trending", layer: "sdk" }, () => {
          expect(result.tokens).toBeDefined()
          expect(Array.isArray(result.tokens)).toBe(true)
        })
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted("tokens trending --limit 3", "json")
        record(
          {
            domain: "tokens",
            command: "trending",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })

      it("CLI table output has headers", () => {
        const output = cliFormatted("tokens trending --limit 3", "table")
        record(
          {
            domain: "tokens",
            command: "trending",
            format: "table",
            layer: "cli",
          },
          () => validateTableFormat(output),
        )
      })

      it("CLI toon output is compact", () => {
        const jsonOut = cliFormatted("tokens trending --limit 3", "json")
        const toonOut = cliFormatted("tokens trending --limit 3", "toon")
        record(
          {
            domain: "tokens",
            command: "trending",
            format: "toon",
            layer: "cli",
          },
          () => validateToonFormat(toonOut, jsonOut),
        )
      })

      it("parity: SDK vs direct API", async () => {
        const sdkResult = await sdk.tokens.trending({ limit: 2 })
        const apiResult = await directGet<typeof sdkResult>(
          "/api/v2/tokens/trending",
          { limit: 2 },
        )
        record(
          { domain: "tokens", command: "trending", layer: "parity" },
          () => {
            expect(sdkResult.tokens.length).toBe(apiResult.tokens.length)
          },
        )
      })
    })

    describe("top", () => {
      it("SDK returns top tokens", async () => {
        const result = await sdk.tokens.top({ limit: 3 })
        record({ domain: "tokens", command: "top", layer: "sdk" }, () => {
          expect(result.tokens).toBeDefined()
          expect(Array.isArray(result.tokens)).toBe(true)
        })
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted("tokens top --limit 3", "json")
        record(
          {
            domain: "tokens",
            command: "top",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })
    })

    describe("get", () => {
      it("SDK returns token details", async () => {
        const result = await sdk.tokens.get(TOKEN_CHAIN, TOKEN_ADDRESS)
        record({ domain: "tokens", command: "get", layer: "sdk" }, () => {
          expect(result).toBeDefined()
          expect(result.address).toBeDefined()
        })
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(
          `tokens get ${TOKEN_CHAIN} ${TOKEN_ADDRESS}`,
          "json",
        )
        record(
          {
            domain: "tokens",
            command: "get",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })

      it("parity: SDK vs direct API", async () => {
        const sdkResult = await sdk.tokens.get(TOKEN_CHAIN, TOKEN_ADDRESS)
        const apiResult = await directGet<typeof sdkResult>(
          `/api/v2/chain/${TOKEN_CHAIN}/token/${TOKEN_ADDRESS}`,
        )
        record({ domain: "tokens", command: "get", layer: "parity" }, () => {
          expect(sdkResult.symbol).toBe(apiResult.symbol)
          expect(sdkResult.name).toBe(apiResult.name)
        })
      })
    })
  })

  // ────────────────────────────────────────────────────────────────────
  //  SWAPS
  // ────────────────────────────────────────────────────────────────────
  describe("swaps", () => {
    describe("quote", () => {
      it("SDK returns swap quote", async () => {
        try {
          const result = await sdk.swaps.quote({
            fromChain: SWAP_FROM_CHAIN,
            fromAddress: SWAP_FROM_ADDRESS,
            toChain: SWAP_TO_CHAIN,
            toAddress: SWAP_TO_ADDRESS,
            quantity: SWAP_QUANTITY,
            address: SWAP_WALLET,
          })
          record({ domain: "swaps", command: "quote", layer: "sdk" }, () => {
            expect(result).toBeDefined()
            expect(result.quote).toBeDefined()
          })
        } catch (err) {
          // Swap quotes may fail for various reasons (liquidity, etc.)
          // A structured API error is still a valid response
          if (err instanceof OpenSeaAPIError) {
            report.push({
              domain: "swaps",
              command: "quote",
              layer: "sdk",
              passed: true,
              error: `API error ${err.statusCode} (acceptable for swap quote)`,
            })
          } else {
            throw err
          }
        }
      })

      it("CLI json output is valid or returns expected error", () => {
        const result = cli(
          `--format json swaps quote --from-chain ${SWAP_FROM_CHAIN} --from-address ${SWAP_FROM_ADDRESS} --to-chain ${SWAP_TO_CHAIN} --to-address ${SWAP_TO_ADDRESS} --quantity ${SWAP_QUANTITY} --address ${SWAP_WALLET}`,
          { expectError: true },
        )
        record(
          {
            domain: "swaps",
            command: "quote",
            format: "json",
            layer: "cli",
          },
          () => {
            if (result.exitCode === 0) {
              validateJsonFormat(result.stdout)
            } else {
              // Structured error on stderr is acceptable
              expect(result.stderr.length).toBeGreaterThan(0)
            }
          },
        )
      })
    })
  })

  // ────────────────────────────────────────────────────────────────────
  //  ACCOUNTS
  // ────────────────────────────────────────────────────────────────────
  describe("accounts", () => {
    describe("get", () => {
      it("SDK returns account data", async () => {
        const result = await sdk.accounts.get(ACCOUNT_ADDRESS)
        record({ domain: "accounts", command: "get", layer: "sdk" }, () => {
          expect(result).toBeDefined()
          expect(result.address).toBeDefined()
        })
      })

      it("CLI json output is valid", () => {
        const output = cliFormatted(`accounts get ${ACCOUNT_ADDRESS}`, "json")
        record(
          {
            domain: "accounts",
            command: "get",
            format: "json",
            layer: "cli",
          },
          () => validateJsonFormat(output),
        )
      })

      it("CLI table output has headers", () => {
        const output = cliFormatted(`accounts get ${ACCOUNT_ADDRESS}`, "table")
        record(
          {
            domain: "accounts",
            command: "get",
            format: "table",
            layer: "cli",
          },
          () => validateTableFormat(output),
        )
      })

      it("CLI toon output is compact", () => {
        const jsonOut = cliFormatted(`accounts get ${ACCOUNT_ADDRESS}`, "json")
        const toonOut = cliFormatted(`accounts get ${ACCOUNT_ADDRESS}`, "toon")
        record(
          {
            domain: "accounts",
            command: "get",
            format: "toon",
            layer: "cli",
          },
          () => validateToonFormat(toonOut, jsonOut),
        )
      })

      it("parity: SDK vs direct API", async () => {
        const sdkResult = await sdk.accounts.get(ACCOUNT_ADDRESS)
        const apiResult = await directGet<typeof sdkResult>(
          `/api/v2/accounts/${ACCOUNT_ADDRESS}`,
        )
        record({ domain: "accounts", command: "get", layer: "parity" }, () => {
          expect(sdkResult.address).toBe(apiResult.address)
          expect(sdkResult.username).toBe(apiResult.username)
        })
      })
    })
  })

  // ────────────────────────────────────────────────────────────────────
  //  ERROR HANDLING
  // ────────────────────────────────────────────────────────────────────
  describe("error handling", () => {
    it("invalid API key returns 401 via SDK", async () => {
      const badSdk = new OpenSeaCLI({ apiKey: "invalid-key-12345" })
      try {
        await badSdk.collections.get(COLLECTION_SLUG)
        expect.fail("Should have thrown")
      } catch (err) {
        record(
          {
            domain: "error",
            command: "invalid-api-key",
            layer: "error",
          },
          () => {
            expect(err).toBeInstanceOf(OpenSeaAPIError)
            const apiErr = err as OpenSeaAPIError
            expect(apiErr.statusCode).toBe(401)
          },
        )
      }
    })

    it("invalid API key returns error via CLI", () => {
      const result = execSync(
        `node ${CLI_BIN} --api-key invalid-key-12345 collections get ${COLLECTION_SLUG} 2>&1 || true`,
        {
          encoding: "utf-8",
          timeout: 30_000,
          env: { ...process.env, NODE_NO_WARNINGS: "1" },
        },
      )
      record(
        {
          domain: "error",
          command: "invalid-api-key-cli",
          layer: "error",
        },
        () => {
          // Should contain structured error output
          expect(result).toContain("error")
        },
      )
    })

    it("non-existent collection slug returns error via SDK", async () => {
      try {
        await sdk.collections.get(
          "this-collection-slug-definitely-does-not-exist-xyz-999",
        )
        expect.fail("Should have thrown")
      } catch (err) {
        record(
          {
            domain: "error",
            command: "non-existent-slug",
            layer: "error",
          },
          () => {
            expect(err).toBeInstanceOf(OpenSeaAPIError)
            const apiErr = err as OpenSeaAPIError
            expect(apiErr.statusCode).toBeGreaterThanOrEqual(400)
          },
        )
      }
    })

    it("non-existent slug returns error via CLI", () => {
      const result = cli(
        "collections get this-collection-slug-definitely-does-not-exist-xyz-999",
        { expectError: true },
      )
      record(
        {
          domain: "error",
          command: "non-existent-slug-cli",
          layer: "error",
        },
        () => {
          expect(result.exitCode).toBe(1)
          expect(result.stderr).toContain("error")
        },
      )
    })

    it("missing API key exits with code 2", () => {
      try {
        execSync(`node ${CLI_BIN} collections get ${COLLECTION_SLUG}`, {
          encoding: "utf-8",
          timeout: 10_000,
          env: {
            ...process.env,
            NODE_NO_WARNINGS: "1",
            OPENSEA_API_KEY: "",
          },
        })
        expect.fail("Should have exited with error")
      } catch (err) {
        record(
          {
            domain: "error",
            command: "missing-api-key",
            layer: "error",
          },
          () => {
            const e = err as { status?: number; stderr?: string }
            expect(e.status).toBe(2)
          },
        )
      }
    })
  })

  // ── Write JSON report ─────────────────────────────────────────────
  afterAll(() => {
    const reportPath = resolve(import.meta.dirname, "e2e-report.json")
    const summary = {
      timestamp: new Date().toISOString(),
      total: report.length,
      passed: report.filter(r => r.passed).length,
      failed: report.filter(r => !r.passed).length,
      results: report,
    }
    writeFileSync(reportPath, JSON.stringify(summary, null, 2))
    console.log(`\nE2E report written to ${reportPath}`)
    console.log(
      `  Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`,
    )
  })
})
