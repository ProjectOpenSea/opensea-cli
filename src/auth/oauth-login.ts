import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import type { OpenSeaOAuth } from "@opensea/sdk"

/**
 * Loopback IP the CLI binds for the OAuth redirect (RFC 8252 §7.3). Using the
 * literal `127.0.0.1` (not `localhost`) avoids DNS rebinding and matches the
 * loopback redirect URIs pre-registered on the public client.
 */
const LOOPBACK_HOST = "127.0.0.1"

const CALLBACK_PATH = "/callback"

/**
 * Run the authorization-code + PKCE flow over a temporary loopback HTTP server.
 *
 * Spins up `http://127.0.0.1:<random-port>/callback`, opens the browser to the
 * authorization endpoint, waits for the redirect, validates `state`, and
 * exchanges the code for tokens. No client secret, no private key.
 */
export async function loginWithLoopback(
  oauth: OpenSeaOAuth,
  options: {
    scopes: string[]
    openBrowser: (url: string) => void | Promise<void>
    timeoutMs?: number
  },
): Promise<import("@opensea/sdk").OAuthToken> {
  const { server, port } = await startServer()
  const redirectUri = `http://${LOOPBACK_HOST}:${port}${CALLBACK_PATH}`

  try {
    const request = await oauth.createAuthorizationRequest({
      redirectUri,
      scopes: options.scopes,
    })

    const codePromise = waitForCode(server, request.state, options.timeoutMs)
    await options.openBrowser(request.url)
    const code = await codePromise

    return await oauth.exchangeCode({
      code,
      codeVerifier: request.codeVerifier,
      redirectUri,
    })
  } finally {
    server.close()
  }
}

function startServer(): Promise<{
  server: import("node:http").Server
  port: number
}> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, LOOPBACK_HOST, () => {
      const address = server.address() as AddressInfo
      resolve({ server, port: address.port })
    })
  })
}

/** Default time to wait for the browser redirect before giving up. */
const DEFAULT_TIMEOUT_MS = 5 * 60_000

function waitForCode(
  server: import("node:http").Server,
  expectedState: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Guard against a late or duplicate callback settling the promise twice
    // and against handling requests after we've already resolved/rejected.
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      server.removeAllListeners("request")
      reject(new Error("Timed out waiting for authorization redirect"))
    }, timeoutMs)

    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`)
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end()
        return
      }
      if (settled) {
        res.writeHead(404).end()
        return
      }

      const error = url.searchParams.get("error")
      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")

      const finish = (message: string, ok: boolean) => {
        res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html" })
        res.end(renderResultPage(message, ok))
      }
      const settle = () => {
        settled = true
        clearTimeout(timer)
      }

      if (error) {
        finish(`Authorization failed: ${error}`, false)
        settle()
        reject(new Error(`Authorization failed: ${error}`))
        return
      }
      if (state !== expectedState) {
        finish("Authorization failed: state mismatch", false)
        settle()
        reject(new Error("State mismatch in authorization response"))
        return
      }
      if (!code) {
        finish("Authorization failed: missing code", false)
        settle()
        reject(new Error("No authorization code in redirect"))
        return
      }

      finish(
        "Login successful. You can close this tab and return to the CLI.",
        true,
      )
      settle()
      resolve(code)
    })
  })
}

function renderResultPage(message: string, ok: boolean): string {
  const color = ok ? "#2081e2" : "#e23b2b"
  return `<!doctype html><html><head><meta charset="utf-8"><title>OpenSea CLI</title></head><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f7fb"><div style="text-align:center"><h2 style="color:${color}">OpenSea</h2><p>${escapeHtml(message)}</p></div></body></html>`
}

/**
 * Escape a string for safe interpolation into HTML text content. The OAuth
 * `error` param is attacker-influenced (it comes from the redirect query
 * string), so it must be encoded before it reaches the result page.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
