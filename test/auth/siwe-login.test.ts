import { describe, expect, it } from "vitest"
import { sessionCookie } from "../../src/auth/siwe-login.js"

describe("sessionCookie", () => {
  it("extracts access_token and refresh_token from getSetCookie entries", () => {
    const headers = new Headers()
    headers.append(
      "set-cookie",
      "access_token=session-access; Path=/; HttpOnly",
    )
    headers.append(
      "set-cookie",
      "refresh_token=session-refresh; Path=/; HttpOnly",
    )

    expect(sessionCookie(headers)).toBe(
      "access_token=session-access; refresh_token=session-refresh",
    )
  })

  it("parses a comma-joined set-cookie header as a fallback", () => {
    const headers = new Headers({
      "set-cookie":
        "access_token=session-access; Path=/, refresh_token=session-refresh; Path=/",
    })

    expect(sessionCookie(headers)).toBe(
      "access_token=session-access; refresh_token=session-refresh",
    )
  })

  it("throws when a required cookie is missing", () => {
    const headers = new Headers({
      "set-cookie": "access_token=session-access; Path=/",
    })

    expect(() => sessionCookie(headers)).toThrow(
      "SIWE verification did not create a session",
    )
  })
})
