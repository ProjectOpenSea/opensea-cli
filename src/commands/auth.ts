import { AUTH_SCOPES } from "@opensea/api-types"
import {
  createSiwxMessage,
  linkWalletWithSiwx,
  OPENSEA_SCOPES,
  OpenSeaOAuth,
  parseSiwxMessage,
} from "@opensea/sdk"
import {
  createWalletFromEnv,
  PrivateKeyAdapter,
} from "@opensea/wallet-adapters"
import { Command } from "commander"
import {
  DEFAULT_AUTH_BASE_URL,
  resolveOAuthClientId,
} from "../auth/oauth-config.js"
import {
  clearTokens,
  listTokens,
  loadCurrentToken,
  removeToken,
  saveToken,
} from "../auth/store.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"

const DEFAULT_BASE_URL = "https://api.opensea.io"
const DEFAULT_TOKEN_TTL_SECONDS = 3600
const SIWE_STATEMENT =
  "Click to sign in and accept the OpenSea Terms of Service (https://opensea.io/tos) and Privacy Policy (https://opensea.io/privacy)."

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

function sessionCookie(headers: Headers): string {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie
  const values = getSetCookie?.call(headers) ?? [
    headers.get("set-cookie") ?? "",
  ]
  const cookies = new Map<string, string>()
  for (const value of values) {
    for (const name of ["access_token", "refresh_token"]) {
      const match = value.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`))
      if (match?.[1]) cookies.set(name, match[1])
    }
  }
  if (!cookies.has("access_token") || !cookies.has("refresh_token")) {
    throw new Error("SIWE verification did not create a session")
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ")
}

async function exchangeScopedToken(
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

/** Available scopes for OpenSea auth tokens, derived from the OpenAPI spec. */
const SCOPES = AUTH_SCOPES.map(({ name, description }) => ({
  name,
  description,
}))

export function authCommand(
  getBaseUrl: () => string | undefined,
  getFormat: () => OutputFormat,
  getAuthBaseUrl?: () => string | undefined,
): Command {
  const cmd = new Command("auth").description(
    "Authentication and token management",
  )

  // --- request-key (existing) ---
  cmd
    .command("request-key")
    .description(
      "Request a free-tier API key (rate limited to 3/hour per IP, keys expire after 30 days)",
    )
    .action(async () => {
      const baseUrl = getBaseUrl() ?? DEFAULT_BASE_URL
      const response = await fetch(`${baseUrl}/api/v2/auth/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      if (!response.ok) {
        const body = await response.text().catch(() => "")
        console.error(
          JSON.stringify(
            { error: "API Error", status: response.status, body },
            null,
            2,
          ),
        )
        process.exit(1)
      }
      const result = (await response.json()) as Record<string, unknown>
      console.log(formatOutput(result, getFormat()))
    })

  // --- login ---
  cmd
    .command("login")
    .description(
      "Authenticate with SIWE using a private key to get a scoped auth token",
    )
    .option(
      "--private-key <key>",
      "Wallet private key (or set OPENSEA_PRIVATE_KEY env var)",
    )
    .option(
      "--scopes <scopes>",
      "Comma-separated scopes to request",
      OPENSEA_SCOPES.READ_ELIGIBILITY,
    )
    .action(async (opts: { privateKey?: string; scopes: string }) => {
      const baseUrl = getBaseUrl() ?? DEFAULT_BASE_URL
      const scopes = opts.scopes.split(",").map(s => s.trim())
      const privateKey = opts.privateKey ?? process.env.OPENSEA_PRIVATE_KEY
      if (!privateKey) {
        console.error(
          "Private key required. Use --private-key or set OPENSEA_PRIVATE_KEY env var.",
        )
        process.exit(1)
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
        console.error(
          JSON.stringify({
            error: "Auth Error",
            status: nonceRes.status,
            message: "Failed to request nonce",
          }),
        )
        process.exit(1)
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
        console.error(
          JSON.stringify({
            error: "Auth Error",
            status: verifyRes.status,
            body,
          }),
        )
        process.exit(1)
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
        console.error(
          JSON.stringify({
            error: "Auth Error",
            status: createRes.status,
            body,
          }),
        )
        process.exit(1)
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

      // The PAT acts as the refresh credential. The store is mode 0600.
      saveToken({
        accessToken: tokenData.accessToken,
        refreshToken: scopedToken.token,
        scopedTokenId: scopedToken.id,
        expiresAt: expiresAt.toISOString(),
        scopes: grantedScopes,
        address,
        authMethod: "siwe",
      })

      console.log(
        formatOutput(
          {
            status: "authenticated",
            address,
            scopes: grantedScopes,
            expires_at: expiresAt.toISOString(),
          },
          getFormat(),
        ),
      )
    })

  cmd
    .command("link-wallet")
    .description(
      "Link the active wallet to the authenticated account using SIWX",
    )
    .option(
      "--auth-token <token>",
      "Scoped bearer token with write:wallets (or set OPENSEA_AUTH_TOKEN env var)",
    )
    .option(
      "--chain-arch <arch>",
      "Chain architecture for the wallet (EVM, SVM, or BITCOIN)",
      "EVM",
    )
    .option("--chain-id <id>", "Chain ID to include in the SIWX message", "1")
    .option(
      "--domain <domain>",
      "Override the SIWX domain (defaults to opensea.io)",
    )
    .option(
      "--uri <uri>",
      "Override the SIWX URI (defaults to https://opensea.io)",
    )
    .option(
      "--statement <statement>",
      "Override the SIWX statement",
      "Click to sign in and accept the OpenSea Terms of Service (https://opensea.io/tos) and Privacy Policy (https://opensea.io/privacy).",
    )
    .option(
      "--auth-base-url <url>",
      "Deprecated; SIWX nonces now use --api-base-url",
    )
    .option(
      "--api-key <key>",
      "OpenSea API key (or set OPENSEA_API_KEY env var)",
    )
    .option(
      "--api-base-url <url>",
      "API base URL (defaults to https://api.opensea.io)",
    )
    .action(
      async (opts: {
        authToken?: string
        chainArch: "EVM" | "SVM" | "BITCOIN"
        chainId: string
        domain?: string
        uri?: string
        statement?: string
        authBaseUrl?: string
        apiBaseUrl?: string
        apiKey?: string
      }) => {
        const authToken = opts.authToken ?? process.env.OPENSEA_AUTH_TOKEN
        if (!authToken) {
          console.error(
            "Scoped auth token required. Use --auth-token or set OPENSEA_AUTH_TOKEN env var.",
          )
          process.exit(1)
        }

        const adapter = createWalletFromEnv()
        const signMessage = adapter.signMessage
        if (!signMessage) {
          console.error("Wallet adapter does not support message signing")
          process.exit(1)
        }

        try {
          const result = await linkWalletWithSiwx(
            {
              getAddress: () => adapter.getAddress(),
              signMessage: async message => signMessage({ message }),
            },
            {
              authToken,
              apiKey: opts.apiKey ?? process.env.OPENSEA_API_KEY,
              chainArch: opts.chainArch,
              chainId: Number(opts.chainId),
              authBaseUrl: opts.authBaseUrl ?? DEFAULT_AUTH_BASE_URL,
              apiBaseUrl: opts.apiBaseUrl ?? DEFAULT_BASE_URL,
              domain: opts.domain,
              uri: opts.uri,
              statement: opts.statement,
            },
          )

          console.log(
            formatOutput(
              {
                status: "linked",
                linkedWalletAddress: result.linkedWalletAddress,
                chainArch: opts.chainArch,
              },
              getFormat(),
            ),
          )
        } catch (error) {
          console.error(
            JSON.stringify(
              {
                error: "Wallet Error",
                message: (error as Error).message,
              },
              null,
              2,
            ),
          )
          process.exit(1)
        }
      },
    )

  // --- status ---
  cmd
    .command("status")
    .description("Show current auth token status")
    .action(() => {
      const token = loadCurrentToken()
      if (!token) {
        console.log(
          formatOutput(
            { status: "not_authenticated", message: "No stored token" },
            getFormat(),
          ),
        )
        return
      }
      const expired = new Date(token.expiresAt) < new Date()
      console.log(
        formatOutput(
          {
            status: expired ? "expired" : "authenticated",
            address: token.address,
            scopes: token.scopes,
            expires_at: token.expiresAt,
            expired,
          },
          getFormat(),
        ),
      )
    })

  // --- refresh ---
  cmd
    .command("refresh")
    .description("Force refresh the current auth token")
    .option(
      "--client-id <id>",
      "Public OAuth client id (or set OPENSEA_OAUTH_CLIENT_ID)",
    )
    .action(async (opts: { clientId?: string }) => {
      const token = loadCurrentToken()
      if (!token) {
        console.error("No stored token to refresh")
        process.exit(1)
      }
      const authBase = getAuthBaseUrl?.() ?? DEFAULT_AUTH_BASE_URL

      if (token.authMethod === "oauth") {
        const oauth = new OpenSeaOAuth({
          clientId: resolveOAuthClientId(opts.clientId),
          issuer: authBase,
        })
        const refreshed = await oauth.refresh(token.refreshToken)
        saveToken({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt.toISOString(),
          scopes: refreshed.scopes,
          address: token.address,
          authMethod: "oauth",
        })
        console.log(
          formatOutput(
            {
              status: "refreshed",
              address: token.address,
              scopes: refreshed.scopes,
              expires_at: refreshed.expiresAt.toISOString(),
            },
            getFormat(),
          ),
        )
        return
      }

      const baseUrl = getBaseUrl() ?? DEFAULT_BASE_URL
      const data = await exchangeScopedToken(baseUrl, token.refreshToken)
      const expiresAt = new Date(
        Date.now() + (data.expiresIn ?? DEFAULT_TOKEN_TTL_SECONDS) * 1000,
      )
      const grantedScopes = data.tokenScopes ?? token.scopes
      saveToken({
        ...token,
        accessToken: data.accessToken,
        expiresAt: expiresAt.toISOString(),
        scopes: grantedScopes,
      })
      console.log(
        formatOutput(
          {
            status: "refreshed",
            address: token.address,
            scopes: grantedScopes,
            expires_at: expiresAt.toISOString(),
          },
          getFormat(),
        ),
      )
    })

  // --- revoke ---
  cmd
    .command("revoke")
    .description("Revoke the current auth token")
    .option(
      "--address <address>",
      "Wallet address to revoke (defaults to current)",
    )
    .action(async (opts: { address?: string }) => {
      const revokeAddress = opts.address
      const token = revokeAddress
        ? listTokens().find(
            t => t.address.toLowerCase() === revokeAddress.toLowerCase(),
          )
        : loadCurrentToken()
      if (!token) {
        console.error("No token found to revoke")
        process.exit(1)
      }
      const baseUrl = getBaseUrl() ?? DEFAULT_BASE_URL
      let res: Response
      if (token.authMethod === "siwe" && token.scopedTokenId) {
        res = await fetch(
          `${baseUrl}/api/v2/auth/tokens/${token.scopedTokenId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token.accessToken}` },
          },
        )
      } else {
        const authBase = getAuthBaseUrl?.() ?? DEFAULT_AUTH_BASE_URL
        res = await fetch(`${authBase}/api/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.accessToken }),
        })
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        console.error(
          JSON.stringify({
            error: "Auth Error",
            status: res.status,
            body,
          }),
        )
        process.exit(1)
      }
      removeToken(token.address)
      console.log(
        formatOutput(
          {
            status: "revoked",
            address: token.address,
          },
          getFormat(),
        ),
      )
    })

  // --- tokens ---
  cmd
    .command("tokens")
    .description("List all stored auth tokens")
    .action(() => {
      const tokens = listTokens()
      if (tokens.length === 0) {
        console.log(formatOutput({ message: "No stored tokens" }, getFormat()))
        return
      }
      const current = loadCurrentToken()
      const output = tokens.map(t => ({
        address: t.address,
        scopes: t.scopes,
        expires_at: t.expiresAt,
        expired: new Date(t.expiresAt) < new Date(),
        current: t.address.toLowerCase() === current?.address.toLowerCase(),
      }))
      console.log(formatOutput(output, getFormat()))
    })

  // --- scopes ---
  cmd
    .command("scopes")
    .description("List available auth scopes with descriptions")
    .action(() => {
      console.log(formatOutput(SCOPES, getFormat()))
    })

  // --- clear ---
  cmd
    .command("clear")
    .description("Remove all stored auth tokens")
    .action(() => {
      clearTokens()
      console.log(
        formatOutput(
          { status: "cleared", message: "All tokens removed" },
          getFormat(),
        ),
      )
    })

  return cmd
}
