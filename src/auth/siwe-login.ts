import { createSiwxMessage, parseSiwxMessage } from "@opensea/sdk"
import { PrivateKeyAdapter } from "@opensea/wallet-adapters"

export const DEFAULT_TOKEN_TTL_SECONDS = 3600
const SIWE_STATEMENT =
  "Click to sign in and accept the OpenSea Terms of Service (https://opensea.io/tos) and Privacy Policy (https://opensea.io/privacy)."

/**
 * Supported API origins for SIWE login. The signed SIWE message binds to
 * opensea.io, so the nonce/verify endpoints must be served by a trusted
 * OpenSea API host to prevent signature replay against an attacker-controlled
 * server.
 */
const TRUSTED_SIWE_ORIGINS = [
  "https://api.opensea.io",
  "https://testnets-api.opensea.io",
]

function isTrustedSiweOrigin(baseUrl: string): boolean {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return false
  }
  return TRUSTED_SIWE_ORIGINS.includes(url.origin)
}

interface ScopedTokenCreatedResponse {
  id: string
  token: string
  scopes: string[]
}

interface ScopedTokenExchangeResponse {
  accessToken: string
  expiresIn?: number
  tokenScopes?: string[]
}

export interface SiweLoginResult {
  accessToken: string
  refreshToken: string
  scopedTokenId: string
  expiresAt: Date
  requestedScopes: string[]
  scopes: string[]
  scopeSource: "token_exchange" | "token_creation"
  address: string
}

const SESSION_COOKIE_NAMES = ["access_token", "refresh_token"]

/**
 * Split a (possibly comma-joined) Set-Cookie header value into individual
 * cookies. Comma-space separators inside cookie attribute values (e.g.
 * `Expires=Mon, 01-Jan-2024`) are re-attached to the cookie they belong to by
 * treating only segments that start with a known session cookie name as new
 * cookies.
 */
function splitSetCookieHeader(header: string): string[] {
  const segments = header.split(", ")
  const cookies: string[] = []
  let current = ""
  for (const segment of segments) {
    const trimmed = segment.trim()
    const eq = trimmed.indexOf("=")
    const name = eq > 0 ? trimmed.slice(0, eq).trim() : ""
    if (SESSION_COOKIE_NAMES.includes(name) && current) {
      cookies.push(current)
      current = trimmed
    } else if (SESSION_COOKIE_NAMES.includes(name)) {
      current = trimmed
    } else {
      current = current ? `${current}, ${trimmed}` : trimmed
    }
  }
  if (current) cookies.push(current)
  return cookies
}

/**
 * Extract the session cookies from a `set-cookie` header. The SIWE verify
 * endpoint returns `access_token` and `refresh_token` as HTTP-only cookies.
 */
export function sessionCookie(headers: Headers): string {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie

  const raw = getSetCookie?.call(headers) ?? [headers.get("set-cookie") ?? ""]
  const cookies = new Map<string, string>()
  for (const value of raw) {
    for (const cookie of splitSetCookieHeader(value)) {
      const pair = cookie.split(";")[0]
      const eq = pair.indexOf("=")
      if (eq < 0) continue
      const name = pair.slice(0, eq).trim()
      const cookieValue = pair.slice(eq + 1).trim()
      if (SESSION_COOKIE_NAMES.includes(name)) {
        cookies.set(name, cookieValue)
      }
    }
  }

  if (!cookies.has("access_token") || !cookies.has("refresh_token")) {
    throw new Error("SIWE verification did not create a session")
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ")
}

/**
 * Exchange a scoped token (PAT) for a short-lived JWT access token.
 */
export async function exchangeScopedToken(
  baseUrl: string,
  scopedToken: string,
): Promise<ScopedTokenExchangeResponse> {
  const response = await fetch(`${baseUrl}/api/v2/auth/tokens/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subjectToken: scopedToken,
      subjectTokenType: "ACCESS_TOKEN",
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Token exchange failed (${response.status}): ${body}`)
  }
  return response.json() as Promise<ScopedTokenExchangeResponse>
}

/**
 * Authenticate with SIWE using a private key and exchange the resulting
 * scoped token for a wallet-bound access token.
 */
export async function loginWithSiwe({
  baseUrl,
  privateKey,
  scopes,
}: {
  baseUrl: string
  privateKey: string
  scopes: string[]
}): Promise<SiweLoginResult> {
  if (!isTrustedSiweOrigin(baseUrl)) {
    throw new Error(
      `Untrusted SIWE API origin: ${baseUrl}. Use one of: ${TRUSTED_SIWE_ORIGINS.join(", ")}.`,
    )
  }

  const adapter = new PrivateKeyAdapter({
    privateKey,
    rpcUrl: process.env.OPENSEA_RPC_URL ?? "https://eth.merkle.io",
  })
  const address = await adapter.getAddress()

  // 1. Request nonce
  const nonceRes = await fetch(`${baseUrl}/api/v2/auth/siwe/nonce`, {
    method: "POST",
    headers: { Accept: "application/json" },
  })
  if (!nonceRes.ok) {
    throw new Error(`Failed to request nonce (${nonceRes.status})`)
  }
  const { nonce } = (await nonceRes.json()) as { nonce: string }

  // 2. Build & sign SIWE message
  const message = createSiwxMessage({
    address,
    chainArch: "EVM",
    chainId: 1,
    nonce,
    statement: SIWE_STATEMENT,
  })
  if (!adapter.signMessage) {
    throw new Error("Wallet adapter does not support message signing")
  }
  const signature = await adapter.signMessage({ message })

  // 3. Verify wallet ownership and establish the short-lived session used to mint a PAT.
  const verifyRes = await fetch(`${baseUrl}/api/v2/auth/siwe/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: parseSiwxMessage(message),
      signature,
      chainArch: "EVM",
    }),
  })
  if (!verifyRes.ok) {
    const body = await verifyRes.text().catch(() => "")
    throw new Error(`SIWE verification failed (${verifyRes.status}): ${body}`)
  }
  const cookie = sessionCookie(verifyRes.headers)

  // 4. Mint a one-day PAT with only the requested scopes.
  const createRes = await fetch(`${baseUrl}/api/v2/auth/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      label: `opensea-cli-${Date.now()}`,
      scopes,
      expiresInDays: 1,
    }),
  })
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => "")
    throw new Error(
      `Scoped token creation failed (${createRes.status}): ${body}`,
    )
  }
  const scopedToken = (await createRes.json()) as ScopedTokenCreatedResponse

  // 5. Exchange the PAT for the short-lived wallet identity JWT used by REST and MCP.
  let tokenData: ScopedTokenExchangeResponse
  try {
    tokenData = await exchangeScopedToken(baseUrl, scopedToken.token)
  } catch (error) {
    await fetch(`${baseUrl}/api/v2/auth/tokens/${scopedToken.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    }).catch(() => undefined)
    throw error
  }

  const expiresAt = new Date(
    Date.now() + (tokenData.expiresIn ?? DEFAULT_TOKEN_TTL_SECONDS) * 1000,
  )
  const grantedScopes = tokenData.tokenScopes ?? scopedToken.scopes
  const scopeSource = tokenData.tokenScopes
    ? "token_exchange"
    : "token_creation"

  return {
    accessToken: tokenData.accessToken,
    refreshToken: scopedToken.token,
    scopedTokenId: scopedToken.id,
    expiresAt,
    requestedScopes: scopes,
    scopes: grantedScopes,
    scopeSource,
    address,
  }
}
