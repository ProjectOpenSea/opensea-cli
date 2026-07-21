import { AUTH_SCOPES } from "@opensea/api-types"
import { linkWalletWithSiwx, OpenSeaOAuth } from "@opensea/sdk"
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
  resolvePrivateKey,
  warnIfInlinePrivateKey,
} from "../auth/private-key.js"
import {
  DEFAULT_TOKEN_TTL_SECONDS,
  exchangeScopedToken,
  loginWithSiwe,
  refreshSiweSession,
} from "../auth/siwe-login.js"
import {
  clearTokens,
  listTokens,
  loadCurrentToken,
  removeToken,
  saveToken,
} from "../auth/store.js"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import type { WalletUnlinkResponse } from "../types/index.js"

const DEFAULT_BASE_URL = "https://api.opensea.io"

/** Available scopes for OpenSea auth tokens, derived from the OpenAPI spec. */
const SCOPES = AUTH_SCOPES.map(({ name, description }) => ({
  name,
  description,
}))

export function authCommand(
  getBaseUrl: () => string | undefined,
  getFormat: () => OutputFormat,
  getAuthBaseUrl?: () => string | undefined,
  getClient?: () => OpenSeaClient,
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
      "--private-key [key]",
      "Use a private key for SIWE login (set OPENSEA_PRIVATE_KEY, or pass the key as the value; using the env var is recommended)",
    )
    .option("--scopes <scopes>", "Comma-separated scopes to request")
    .action(async (opts: { privateKey?: string | true; scopes?: string }) => {
      if (!opts.scopes?.trim()) {
        throw new Error(
          "Private-key login requires --scopes. Run `opensea auth scopes` to list available scopes.",
        )
      }
      const baseUrl = getBaseUrl() ?? DEFAULT_BASE_URL
      const scopes = opts.scopes
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
      if (scopes.length === 0) {
        throw new Error(
          "Private-key login requires --scopes. Run `opensea auth scopes` to list available scopes.",
        )
      }
      const { privateKey, source } = resolvePrivateKey(opts.privateKey)
      warnIfInlinePrivateKey(source)

      const result = await loginWithSiwe({ baseUrl, privateKey, scopes })

      saveToken({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        scopedTokenId: result.scopedTokenId,
        sessionCookie: result.sessionCookie,
        expiresAt: result.expiresAt.toISOString(),
        requestedScopes: result.requestedScopes,
        scopes: result.scopes,
        scopeSource: result.scopeSource,
        address: result.address,
        authMethod: "siwe",
      })

      console.log(
        formatOutput(
          {
            status: "authenticated",
            address: result.address,
            scopes: result.scopes,
            scope_source: result.scopeSource,
            expires_at: result.expiresAt.toISOString(),
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

        const privateKey = process.env.OPENSEA_PRIVATE_KEY
        const adapter = privateKey
          ? new PrivateKeyAdapter({
              privateKey,
              rpcUrl: process.env.OPENSEA_RPC_URL ?? "https://eth.merkle.io",
            })
          : createWalletFromEnv()
        const signMessage = adapter.signMessage?.bind(adapter)
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

  cmd
    .command("unlink-wallet")
    .description(
      "Unlink a wallet from the authenticated account (requires write:wallets)",
    )
    .argument("<wallet>", "Wallet address to unlink")
    .action(async (wallet: string) => {
      if (!getClient) {
        throw new Error("unlink-wallet is not available in this context")
      }
      const client = getClient()
      const result = await client.delete<WalletUnlinkResponse>(
        `/api/v2/accounts/wallets/${wallet}`,
      )
      console.log(formatOutput(result, getFormat()))
    })

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
          requestedScopes: token.requestedScopes,
          scopes: refreshed.scopes,
          scopeSource: refreshed.scopeSource,
          address: token.address,
          authMethod: "oauth",
        })
        console.log(
          formatOutput(
            {
              status: "refreshed",
              address: token.address,
              scopes: refreshed.scopes,
              scope_source: refreshed.scopeSource,
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
      const scopeSource = data.tokenScopes
        ? "token_exchange"
        : (token.scopeSource ?? "unknown")
      saveToken({
        ...token,
        accessToken: data.accessToken,
        expiresAt: expiresAt.toISOString(),
        scopes: grantedScopes,
        ...(scopeSource === "unknown" ? {} : { scopeSource }),
      })
      console.log(
        formatOutput(
          {
            status: "refreshed",
            address: token.address,
            scopes: grantedScopes,
            scope_source: scopeSource,
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
      if (token.authMethod === "siwe") {
        if (!token.scopedTokenId || !token.sessionCookie) {
          throw new Error(
            "Stored SIWE login cannot manage its token. Run `opensea login --private-key` again.",
          )
        }
        const refreshedCookie = await refreshSiweSession(
          baseUrl,
          token.sessionCookie,
        )
        // Refresh tokens rotate. Persist the replacement before revocation so
        // a transient DELETE failure can be retried without reusing the old
        // session token.
        saveToken({ ...token, sessionCookie: refreshedCookie })
        res = await fetch(
          `${baseUrl}/api/v2/auth/tokens/${token.scopedTokenId}`,
          {
            method: "DELETE",
            headers: { Cookie: refreshedCookie },
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
        scope_source: t.scopeSource ?? "unknown",
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
