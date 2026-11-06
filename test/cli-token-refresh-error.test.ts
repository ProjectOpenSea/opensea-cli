import { Command } from "commander"
import { afterAll, expect, it, vi } from "vitest"
import { TokenRefreshError } from "../src/auth/refresh.js"

vi.mock("../src/commands/index.js", () => ({
  accountsCommand: () => new Command("accounts"),
  agentCommand: () => new Command("agent"),
  apiCommand: () => new Command("api"),
  assetsCommand: () => new Command("assets"),
  authCommand: () => new Command("auth"),
  chainsCommand: () => new Command("chains"),
  collectionsCommand: () => new Command("collections"),
  dropsCommand: () => new Command("drops"),
  eventsCommand: () => new Command("events"),
  listingsCommand: () => new Command("listings"),
  nftsCommand: () => new Command("nfts"),
  offersCommand: () => new Command("offers"),
  ordersCommand: () => new Command("orders"),
  profileCommand: () => new Command("profile"),
  searchCommand: () => new Command("search"),
  signalsCommand: () => new Command("signals"),
  swapsCommand: () => new Command("swaps"),
  tokenGroupsCommand: () => new Command("token-groups"),
  tokensCommand: () => new Command("tokens"),
  toolsCommand: () => new Command("tools"),
  transactionsCommand: () => new Command("transactions"),
  healthCommand: () => new Command("health"),
  walletCommand: () => new Command("wallet"),
  whoamiCommand: () => new Command("whoami"),
  loginCommand: () => new Command("login"),
}))

const exitSpy = vi
  .spyOn(process, "exit")
  .mockImplementation(() => undefined as never)
const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})

vi.spyOn(Command.prototype, "parseAsync").mockRejectedValue(
  new TokenRefreshError("Run `opensea auth login` to sign in again.", 403),
)

afterAll(() => {
  vi.restoreAllMocks()
})

it("exits with the auth error code and the login instruction", async () => {
  await import("../src/cli.js")
  await vi.waitFor(() => {
    expect(exitSpy).toHaveBeenCalled()
  })

  expect(exitSpy).toHaveBeenCalledWith(2)
  expect(JSON.parse(stderrSpy.mock.calls[0][0] as string)).toEqual({
    error: "TokenRefreshError",
    status: 403,
    message: "Run `opensea auth login` to sign in again.",
  })
})
