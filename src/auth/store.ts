import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { z } from "zod"

/**
 * Shape of a persisted auth token entry.
 */
export interface StoredToken {
  accessToken: string
  refreshToken: string
  scopedTokenId?: string
  expiresAt: string
  scopes: string[]
  scopeSource?:
    | "authorization_server"
    | "token_exchange"
    | "token_creation"
    | "jwt_claim"
  address: string
  authMethod: "oauth" | "siwe"
}

/**
 * Shape of the auth.json file.
 */
interface AuthStore {
  currentAddress?: string
  tokens: Record<string, StoredToken>
}

const storedTokenSchema = z
  .object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    scopedTokenId: z.string().min(1).optional(),
    expiresAt: z.iso.datetime(),
    scopes: z.array(z.string().min(1)),
    scopeSource: z
      .enum([
        "authorization_server",
        "token_exchange",
        "token_creation",
        "jwt_claim",
      ])
      .optional(),
    address: z.string().min(1),
    authMethod: z.enum(["oauth", "siwe"]),
  })
  .strict()

const authStoreSchema = z
  .object({
    currentAddress: z.string().min(1).optional(),
    tokens: z.record(z.string(), storedTokenSchema),
  })
  .strict()

const AUTH_DIR = join(homedir(), ".opensea")
const AUTH_FILE = join(AUTH_DIR, "auth.json")

function ensureDir(): void {
  try {
    if (!existsSync(AUTH_DIR)) {
      mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 })
    }
    chmodSync(AUTH_DIR, 0o700)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to secure auth directory ${AUTH_DIR}: ${msg}`)
  }
}

function readStore(): AuthStore {
  if (!existsSync(AUTH_FILE)) return { tokens: {} }
  if (!lstatSync(AUTH_FILE).isFile()) {
    console.warn(
      `Warning: ${AUTH_FILE} is not a regular file and was not read.`,
    )
    return { tokens: {} }
  }
  try {
    const data = readFileSync(AUTH_FILE, "utf-8")
    const store = authStoreSchema.parse(JSON.parse(data))
    for (const [key, token] of Object.entries(store.tokens)) {
      if (key !== normalizeAddress(token.address)) {
        throw new Error(
          "Auth store token key does not match its wallet address",
        )
      }
    }
    if (store.currentAddress && !store.tokens[store.currentAddress]) {
      throw new Error("Auth store current address has no matching token")
    }
    return store
  } catch {
    console.warn(
      `Warning: ${AUTH_FILE} is corrupted or incompatible. Run \`opensea login\` to authenticate again.`,
    )
    return { tokens: {} }
  }
}

function writeStore(store: AuthStore): void {
  ensureDir()
  try {
    if (existsSync(AUTH_FILE)) {
      if (!lstatSync(AUTH_FILE).isFile()) {
        throw new Error("auth store path is not a regular file")
      }
      chmodSync(AUTH_FILE, 0o600)
    }
    writeFileSync(AUTH_FILE, JSON.stringify(store, null, 2), { mode: 0o600 })
    // The mode option only applies when writeFileSync creates a file. Repair
    // permissions explicitly when an older or user-created auth file exists.
    chmodSync(AUTH_FILE, 0o600)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to write auth store ${AUTH_FILE}: ${msg}`)
  }
}

function normalizeAddress(address: string): string {
  return address.slice(0, 2).toLowerCase() === "0x"
    ? address.toLowerCase()
    : address
}

/**
 * Save a token to the persistent store, keyed by wallet address.
 */
export function saveToken(token: StoredToken): void {
  const store = readStore()
  const key = normalizeAddress(token.address)
  store.tokens[key] = storedTokenSchema.parse(token)
  store.currentAddress = key
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
  return store.tokens[normalizeAddress(address)]
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
  const key = normalizeAddress(address)
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
