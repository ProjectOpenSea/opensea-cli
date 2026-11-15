import { Command } from "commander"
import { afterAll, describe, expect, it, vi } from "vitest"
import { describeApiError } from "../src/api-error.js"
import { OpenSeaAPIError } from "../src/client.js"

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
  expect(parsed.message).toBe("Not Found")
  expect(parsed).not.toHaveProperty("response_body")
  expect(parsed).not.toHaveProperty("hint")
})

describe("describeApiError", () => {
  const apiError = (status: number, body: string) =>
    new OpenSeaAPIError(status, body, "/api/v2/drops/cool-cats/publish")

  it("joins a structured errors body into message and keeps the raw body", () => {
    const body = JSON.stringify({
      errors: ["Drop is not published", { message: "Stage is missing" }],
    })
    const { exitCode, payload } = describeApiError(apiError(400, body))

    expect(exitCode).toBe(1)
    expect(payload).toEqual({
      error: "API Error",
      status: 400,
      path: "/api/v2/drops/cool-cats/publish",
      message: "Drop is not published; Stage is missing",
      response_body: body,
    })
  })

  it("leaves a body that is not an errors array as the message", () => {
    for (const body of ["Bad Gateway", '{"detail":"nope"}', '{"errors":[]}']) {
      const { payload } = describeApiError(apiError(502, body))
      expect(payload.message).toBe(body)
      expect(payload).not.toHaveProperty("response_body")
    }
  })

  it("maps 401 to the auth exit code with a log-in hint", () => {
    const { exitCode, payload } = describeApiError(
      apiError(401, '{"errors":["Invalid token"]}'),
    )

    expect(exitCode).toBe(2)
    expect(payload.error).toBe("Authentication Error")
    expect(payload.message).toBe("Invalid token")
    expect(payload.hint).toContain("opensea auth login")
    expect(payload.hint).toContain("opensea auth refresh")
  })

  it("keeps 403 an API error, with an ownership and scope hint", () => {
    const { exitCode, payload } = describeApiError(apiError(403, "Forbidden"))

    expect(exitCode).toBe(1)
    expect(payload.error).toBe("API Error")
    expect(payload.hint).toContain("own the collection")
    expect(payload.hint).toContain("scope")
  })

  it("surfaces the error code, with a hint for a stage fee below the floor", () => {
    const body = JSON.stringify({
      errors: [
        "The active stage is paid and its OpenSea fee is below the drop's minimum",
      ],
      code: "STAGE_FEE_BELOW_FLOOR",
    })
    const { exitCode, payload } = describeApiError(apiError(422, body))

    expect(exitCode).toBe(1)
    expect(payload.code).toBe("STAGE_FEE_BELOW_FLOOR")
    expect(payload.hint).toContain("Only the drop's creator can fix it")
  })

  it("surfaces a code without a hint of its own and keeps the status hint", () => {
    const { payload } = describeApiError(
      apiError(403, JSON.stringify({ errors: ["nope"], code: "SOME_CODE" })),
    )

    expect(payload.code).toBe("SOME_CODE")
    expect(payload.hint).toContain("own the collection")
  })

  it("leaves code out when the body carries none", () => {
    const { payload } = describeApiError(apiError(400, '{"errors":["bad"]}'))
    expect(payload).not.toHaveProperty("code")
  })

  it("keeps 429 on the rate-limit exit code without a hint", () => {
    const { exitCode, payload } = describeApiError(
      apiError(429, "Rate limit exceeded"),
    )

    expect(exitCode).toBe(3)
    expect(payload.error).toBe("Rate Limited")
    expect(payload).not.toHaveProperty("hint")
  })
})
