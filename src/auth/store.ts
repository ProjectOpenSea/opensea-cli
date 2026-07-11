import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * Shape of a persisted auth token entry.
 */
export interface StoredToken {
  accessToken: string
  refreshToken: string
  expiresAt: string
  scopes: string[]
  address: string
}

/**
 * Shape of the auth.json file.
 */
interface AuthStore {
  currentAddress?: string
  tokens: Record<string, StoredToken>
}

const AUTH_DIR = join(homedir(), ".opensea")
const AUTH_FILE = join(AUTH_DIR, "auth.json")

function ensureDir(): void {
  if (!existsSync(AUTH_DIR)) {
    try {
      mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to create auth directory ${AUTH_DIR}: ${msg}`)
    }
  }
}

function readStore(): AuthStore {
  if (!existsSync(AUTH_FILE)) return { tokens: {} }
  try {
    const data = readFileSync(AUTH_FILE, "utf-8")
    return JSON.parse(data) as AuthStore
  } catch {
    console.warn(
      `Warning: ${AUTH_FILE} is corrupted. Starting with empty store.`,
    )
    return { tokens: {} }
  }
}

function writeStore(store: AuthStore): void {
  ensureDir()
  try {
    writeFileSync(AUTH_FILE, JSON.stringify(store, null, 2), { mode: 0o600 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to write auth store ${AUTH_FILE}: ${msg}`)
  }
}

/**
 * Save a token to the persistent store, keyed by wallet address.
 */
export function saveToken(token: StoredToken): void {
  const store = readStore()
  store.tokens[token.address.toLowerCase()] = token
  store.currentAddress = token.address.toLowerCase()
  writeStore(store)
}

/**
 * Load the current (most recently saved) token.
 */
export function loadCurrentToken(): StoredToken | undefined {
  const store = readStore()
  if (!store.currentAddress) return undefined
  return store.tokens[store.currentAddress]
}

/**
 * Load a specific token by wallet address.
 */
export function loadToken(address: string): StoredToken | undefined {
  const store = readStore()
  return store.tokens[address.toLowerCase()]
}

/**
 * List all stored tokens.
 */
export function listTokens(): StoredToken[] {
  const store = readStore()
  return Object.values(store.tokens)
}

/**
 * Remove a token by wallet address. If it was the current token, clears
 * the currentAddress pointer.
 */
export function removeToken(address: string): boolean {
  const store = readStore()
  const key = address.toLowerCase()
  if (!store.tokens[key]) return false
  delete store.tokens[key]
  if (store.currentAddress === key) {
    store.currentAddress = undefined
  }
  writeStore(store)
  return true
}

/**
 * Remove all stored tokens.
 */
export function clearTokens(): void {
  writeStore({ tokens: {} })
}
