import { spawn } from "node:child_process"
import { AUTH_SCOPES } from "@opensea/api-types"
import {
  decodeJwtPayload,
  extractWalletAddress,
  OpenSeaOAuth,
} from "@opensea/sdk"
import { Command } from "commander"
import { loginWithLoopback } from "../auth/oauth-login.js"
import { saveToken } from "../auth/store.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"

const DEFAULT_AUTH_BASE_URL = "https://auth.opensea.io"

/**
 * The pre-registered OpenSea public OAuth client (PKCE, no secret) — the
 * `opensea-mcp-public` app in Zitadel. Overridable via `--client-id` or
 * `OPENSEA_OAUTH_CLIENT_ID` for other environments.
 */
const DEFAULT_PUBLIC_CLIENT_ID = "379893200225068569"

/**
 * Request the canonical public API scope set when the user does not choose a
 * narrower set. This must come from generated OpenAPI metadata rather than
 * Zitadel's project roles, which can include deferred or internal roles.
 */
const DEFAULT_SCOPES = AUTH_SCOPES.map(({ name }) => name)

/**
 * Top-level `opensea login` — keyless OAuth 2.1 (authorization-code + PKCE)
 * login against the OpenSea authorization server. No private key, no SIWE
 * signing. Falls back to the device authorization flow for headless
 * environments (`--device`, or automatically when no browser is available).
 *
 * The resulting token is written to the shared `~/.opensea/auth.json` store,
 * so every other command (and `opensea auth status`) picks it up transparently.
 */
export function loginCommand(
  getFormat: () => OutputFormat,
  getAuthBaseUrl?: () => string | undefined,
): Command {
  return new Command("login")
    .description(
      "Log in with OAuth (browser, keyless) and store a scoped auth token",
    )
    .option(
      "--scopes <scopes>",
      "Comma-separated scopes to request (e.g. read:eligibility,write:orders). Requested scopes are advisory: the scopes actually granted are determined server-side by the account's project grants",
    )
    .option(
      "--client-id <id>",
      "Public OAuth client id (or set OPENSEA_OAUTH_CLIENT_ID); defaults to the OpenSea public client",
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
        device?: boolean
        browser: boolean
      }) => {
        const clientId =
          opts.clientId ??
          process.env.OPENSEA_OAUTH_CLIENT_ID ??
          DEFAULT_PUBLIC_CLIENT_ID

        const issuer = getAuthBaseUrl?.() ?? DEFAULT_AUTH_BASE_URL
        const scopes = opts.scopes
          ? opts.scopes
              .split(",")
              .map(s => s.trim())
              .filter(Boolean)
          : [...DEFAULT_SCOPES]
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

        const claims = safeDecodeClaims(token.accessToken)
        const address = extractWalletAddress(claims) ?? "unknown"

        saveToken({
          accessToken: token.accessToken,
          refreshToken: token.refreshToken ?? "",
          expiresAt: token.expiresAt.toISOString(),
          scopes: token.scopes,
          address,
        })

        console.log(
          formatOutput(
            {
              status: "authenticated",
              address,
              scopes: token.scopes,
              expires_at: token.expiresAt.toISOString(),
            },
            getFormat(),
          ),
        )
      },
    )
}

/**
 * Decode token claims, tolerating opaque (non-JWT) access tokens. The
 * authorization server normally issues a JWT, but if it returns an opaque
 * token `decodeJwtPayload` throws — fall back to empty claims so
 * `extractWalletAddress` uses its `sub`/`unknown` path and the token is still
 * saved.
 */
function safeDecodeClaims(accessToken: string): Record<string, unknown> {
  try {
    return decodeJwtPayload(accessToken)
  } catch {
    return {}
  }
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
