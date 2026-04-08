import { Command } from "commander"
import { afterAll, expect, it, vi } from "vitest"
import { OpenSeaAPIError } from "../src/client.js"

vi.mock("../src/commands/index.js", () => ({
  accountsCommand: () => new Command("accounts"),
  chainsCommand: () => new Command("chains"),
  collectionsCommand: () => new Command("collections"),
  eventsCommand: () => new Command("events"),
  listingsCommand: () => new Command("listings"),
  nftsCommand: () => new Command("nfts"),
  offersCommand: () => new Command("offers"),
  searchCommand: () => new Command("search"),
  swapsCommand: () => new Command("swaps"),
  tokensCommand: () => new Command("tokens"),
  healthCommand: () => new Command("health"),
}))

const exitSpy = vi
  .spyOn(process, "exit")
  .mockImplementation(() => undefined as never)
const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})

vi.spyOn(Command.prototype, "parseAsync").mockRejectedValue(
  new OpenSeaAPIError(404, "Not Found", "/api/v2/missing"),
)

afterAll(() => {
  vi.restoreAllMocks()
})

it("exits with code 1 and 'API Error' label on non-429 API error", async () => {
  await import("../src/cli.js")
  await vi.waitFor(() => {
    expect(exitSpy).toHaveBeenCalled()
  })

  expect(exitSpy).toHaveBeenCalledWith(1)
  const output = stderrSpy.mock.calls[0][0] as string
  const parsed = JSON.parse(output)
  expect(parsed.error).toBe("API Error")
  expect(parsed.status).toBe(404)
})
