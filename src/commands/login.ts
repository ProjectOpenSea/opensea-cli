import { spawn } from "node:child_process"
import { AUTH_SCOPES } from "@opensea/api-types"
import {
  decodeJwtPayload,
  extractWalletAddress,
  OpenSeaOAuth,
} from "@opensea/sdk"
import { Command } from "commander"
import {
  DEFAULT_AUTH_BASE_URL,
  resolveOAuthClientId,
} from "../auth/oauth-config.js"
import { loginWithLoopback } from "../auth/oauth-login.js"
import {
  resolvePrivateKey,
  warnIfInlinePrivateKey,
} from "../auth/private-key.js"
import { loginWithSiwe } from "../auth/siwe-login.js"
import { saveToken } from "../auth/store.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"

const DEFAULT_BASE_URL = "https://api.opensea.io"

/**
 * Request the canonical public API scope set when the user does not choose a
 * narrower set. This must come from generated OpenAPI metadata rather than
 * Zitadel's project roles, which can include deferred or internal roles.
 */
const DEFAULT_SCOPES = AUTH_SCOPES.map(({ name }) => name)

function scopesOutsideRequested(
  requestedScopes: string[],
  grantedScopes: string[],
): string[] {
  const requested = new Set(requestedScopes)
  return grantedScopes.filter(scope => !requested.has(scope))
}

/**
 * Top-level `opensea login` — keyless OAuth 2.1 (authorization-code + PKCE)
 * login against the OpenSea authorization server, or SIWE sign-in with a
 * private key for server-side agents. Falls back to the device authorization
 * flow for headless environments (`--device`, or automatically when no browser
 * is available).
 *
 * The resulting token is written to the shared `~/.opensea/auth.json` store,
 * so every other command (and `opensea auth status`) picks it up transparently.
 */
export function loginCommand(
  getFormat: () => OutputFormat,
  getAuthBaseUrl?: () => string | undefined,
  getBaseUrl?: () => string | undefined,
): Command {
  return new Command("login")
    .description(
      "Log in with OAuth (browser, keyless) or a private key and store a scoped auth token",
    )
    .option(
      "--scopes <scopes>",
      "Comma-separated OpenSea scopes to grant (e.g. read:eligibility,write:orders)",
    )
    .option(
      "--client-id <id>",
      "Public OAuth client id (or set OPENSEA_OAUTH_CLIENT_ID); defaults to the OpenSea public client",
    )
    .option(
      "--private-key [key]",
      "Use a private key for SIWE login (set OPENSEA_PRIVATE_KEY, or pass the key as the value; using the env var is recommended)",
    )
    .option(
      "--device",
      "Use the device authorization flow instead of a browser redirect",
    )
    .option(
      "--no-browser",
      "Print the authorization URL instead of opening it (still redirects to this machine's loopback; use --device for headless/remote hosts)",
    )
    .action(
      async (opts: {
        scopes?: string
        clientId?: string
        privateKey?: string | true
        device?: boolean
        browser: boolean
      }) => {
        const scopes = opts.scopes
          ? opts.scopes
              .split(",")
              .map(s => s.trim())
              .filter(Boolean)
          : [...DEFAULT_SCOPES]

        if (opts.privateKey !== undefined) {
          const { privateKey, source } = resolvePrivateKey(opts.privateKey)
          warnIfInlinePrivateKey(source)

          const ignored: string[] = []
          if (opts.device) ignored.push("--device")
          if (!opts.browser) ignored.push("--no-browser")
          if (opts.clientId) ignored.push("--client-id")
          if (ignored.length > 0) {
            console.error(
              `Warning: ${ignored.join(", ")} ${ignored.length === 1 ? "is" : "are"} not used with SIWE login and ${ignored.length === 1 ? "was" : "were"} ignored.`,
            )
          }

          const baseUrl = getBaseUrl?.() ?? DEFAULT_BASE_URL
          const result = await loginWithSiwe({
            baseUrl,
            privateKey,
            scopes,
          })

          const broaderScopes = scopesOutsideRequested(scopes, result.scopes)
          if (broaderScopes.length > 0) {
            console.error(
              `Warning: the authorization server granted scopes outside the requested set: ${broaderScopes.join(", ")}`,
            )
          }

          saveToken({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            scopedTokenId: result.scopedTokenId,
            expiresAt: result.expiresAt.toISOString(),
            requestedScopes: scopes,
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
                requested_scopes: scopes,
                granted_scopes: result.scopes,
                scope_source: result.scopeSource,
                ...(broaderScopes.length > 0
                  ? {
                      scope_warning: {
                        type: "broader_than_requested",
                        scopes: broaderScopes,
                      },
                    }
                  : {}),
                expires_at: result.expiresAt.toISOString(),
              },
              getFormat(),
            ),
          )
          return
        }

        const clientId = resolveOAuthClientId(opts.clientId)
        const issuer = getAuthBaseUrl?.() ?? DEFAULT_AUTH_BASE_URL
        const oauth = new OpenSeaOAuth({ clientId, issuer })

        const token = opts.device
          ? await runDeviceFlow(oauth, scopes)
          : await loginWithLoopback(oauth, {
              scopes,
              openBrowser: url => {
                if (opts.browser) openBrowser(url)
                else console.error(`Open this URL to continue:\n${url}`)
              },
            })

        const broaderScopes = scopesOutsideRequested(scopes, token.scopes)
        if (broaderScopes.length > 0) {
          console.error(
            `Warning: the authorization server granted scopes outside the requested set: ${broaderScopes.join(", ")}`,
          )
        }

        const claims = decodeJwtPayload(token.accessToken)
        const address = extractWalletAddress(claims)
        if (!address) {
          throw new Error(
            "OAuth access token is missing the required wallet claim",
          )
        }

        saveToken({
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: token.expiresAt.toISOString(),
          requestedScopes: scopes,
          scopes: token.scopes,
          ...(token.scopeSource ? { scopeSource: token.scopeSource } : {}),
          address,
          authMethod: "oauth",
        })

        console.log(
          formatOutput(
            {
              status: "authenticated",
              address,
              requested_scopes: scopes,
              granted_scopes: token.scopes,
              scope_source: token.scopeSource,
              ...(broaderScopes.length > 0
                ? {
                    scope_warning: {
                      type: "broader_than_requested",
                      scopes: broaderScopes,
                    },
                  }
                : {}),
              expires_at: token.expiresAt.toISOString(),
            },
            getFormat(),
          ),
        )
      },
    )
}

async function runDeviceFlow(
  oauth: OpenSeaOAuth,
  scopes: string[],
): Promise<import("@opensea/sdk").OAuthToken> {
  const device = await oauth.requestDeviceAuthorization({ scopes })
  const url = device.verification_uri_complete ?? device.verification_uri
  console.error(`To log in, open ${url} and enter code: ${device.user_code}`)
  return oauth.pollDeviceToken(device)
}

/** Open a URL in the user's default browser (best-effort, cross-platform). */
function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open"
  // cmd.exe's `start` treats `&` as a command separator, so the OAuth URL
  // (which is full of `&`-joined query params) must be quoted or it gets
  // truncated at the first `&` and login silently fails on Windows.
  const args =
    process.platform === "win32" ? ["/c", "start", "", `"${url}"`] : [url]
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true })
    child.on("error", () => {
      console.error(`Could not open a browser automatically. Open:\n${url}`)
    })
    child.unref()
  } catch {
    console.error(`Could not open a browser automatically. Open:\n${url}`)
  }
}
