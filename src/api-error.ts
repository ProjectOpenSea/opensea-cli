import type { OpenSeaAPIError } from "./client.js"

export const EXIT_API_ERROR = 1
export const EXIT_AUTH_ERROR = 2
export const EXIT_RATE_LIMITED = 3

const HINTS: Record<number, string> = {
  401: "The auth token is missing, expired or revoked. Log in again with `opensea auth login`, or run `opensea auth refresh`.",
  403: "The token was accepted but not allowed here: its wallet may not own the collection, or it may lack the required scope.",
}

function errorText(entry: unknown): string {
  if (typeof entry === "string") return entry
  if (
    entry &&
    typeof entry === "object" &&
    typeof (entry as { message?: unknown }).message === "string"
  ) {
    return (entry as { message: string }).message
  }
  return JSON.stringify(entry)
}

// Hints for error `code` values whose fix the message alone does not make obvious.
const CODE_HINTS: Record<string, string> = {
  STAGE_FEE_BELOW_FLOOR:
    "The active stage is paid and its OpenSea fee is below the drop's minimum, so no paid mint can be built. Only the drop's creator can fix it, by publishing the stage again; retrying will not help.",
}

/** The `code` of a JSON error body, or undefined. */
function errorCode(body: string): string | undefined {
  try {
    const code = (JSON.parse(body) as { code?: unknown } | null)?.code
    return typeof code === "string" ? code : undefined
  } catch {
    return undefined
  }
}

/** The joined `errors` of a `{"errors": [...]}` body, or undefined. */
function structuredMessage(body: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }
  const errors = (parsed as { errors?: unknown } | null)?.errors
  if (!Array.isArray(errors) || errors.length === 0) return undefined
  return errors.map(errorText).join("; ")
}

/**
 * The stderr payload and exit code for an API error. A `{"errors": [...]}`
 * body becomes a readable `message`, with the unmodified body kept under
 * `response_body`; any other body is the `message` as before.
 */
export function describeApiError(error: OpenSeaAPIError): {
  exitCode: number
  payload: Record<string, unknown>
} {
  const status = error.statusCode
  const exitCode =
    status === 429
      ? EXIT_RATE_LIMITED
      : status === 401
        ? EXIT_AUTH_ERROR
        : EXIT_API_ERROR
  const label =
    status === 429
      ? "Rate Limited"
      : status === 401
        ? "Authentication Error"
        : "API Error"

  const structured = structuredMessage(error.responseBody)
  const payload: Record<string, unknown> = {
    error: label,
    status,
    path: error.path,
    message: structured ?? error.responseBody,
  }
  if (structured !== undefined) payload.response_body = error.responseBody
  const code = errorCode(error.responseBody)
  if (code !== undefined) payload.code = code
  const hint =
    (code !== undefined ? CODE_HINTS[code] : undefined) ?? HINTS[status]
  if (hint) payload.hint = hint
  return { exitCode, payload }
}
