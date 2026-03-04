import { Command } from "commander"
import { afterAll, expect, it, vi } from "vitest"
import { OpenSeaAPIError } from "../src/client.js"

vi.mock("../src/commands/index.js", () => ({
  accountsCommand: () => new Command("accounts"),
  collectionsCommand: () => new Command("collections"),
  eventsCommand: () => new Command("events"),
  listingsCommand: () => new Command("listings"),
  nftsCommand: () => new Command("nfts"),
  offersCommand: () => new Command("offers"),
  searchCommand: () => new Command("search"),
  swapsCommand: () => new Command("swaps"),
  tokensCommand: () => new Command("tokens"),
}))

const exitSpy = vi
  .spyOn(process, "exit")
  .mockImplementation(() => undefined as never)
const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})

vi.spyOn(Command.prototype, "parseAsync").mockRejectedValue(
  new OpenSeaAPIError(429, "Rate limit exceeded", "/api/v2/test"),
)

afterAll(() => {
  vi.restoreAllMocks()
})

it("exits with code 3 and 'Rate Limited' label on 429 error", async () => {
  await import("../src/cli.js")
  await vi.waitFor(() => {
    expect(exitSpy).toHaveBeenCalled()
  })

  expect(exitSpy).toHaveBeenCalledWith(3)
  const output = stderrSpy.mock.calls[0][0] as string
  const parsed = JSON.parse(output)
  expect(parsed.error).toBe("Rate Limited")
  expect(parsed.status).toBe(429)
  expect(parsed.path).toBe("/api/v2/test")
  expect(parsed.message).toBe("Rate limit exceeded")
})
