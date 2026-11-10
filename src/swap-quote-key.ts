import { randomBytes } from "node:crypto"
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { ensureAuthDir, getAuthDir } from "./auth/store.js"

const KEY_BYTES = 32

/** Path of the key that signs saved swap quotes, inside the CLI config directory. */
export function getQuoteKeyFile(): string {
  return join(getAuthDir(), "quote-key")
}

/** The quote key, or `undefined` when this machine has not saved a quote yet. */
export function readQuoteKey(): Uint8Array | undefined {
  const file = getQuoteKeyFile()
  if (!existsSync(file)) return undefined
  if (!lstatSync(file).isFile()) {
    throw new Error(`${file} is not a regular file`)
  }
  const key = readFileSync(file)
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `${file} is not a ${KEY_BYTES}-byte quote key. Delete it to create a new one, then re-quote.`,
    )
  }
  return key
}

/**
 * Read the quote key, creating it on first use. The key is written to a temp file (0600) and
 * hard-linked into place, which fails if another process created it first, so concurrent first
 * runs agree on one key instead of the last rename winning.
 */
export function loadOrCreateQuoteKey(): Uint8Array {
  const existing = readQuoteKey()
  if (existing) return existing
  ensureAuthDir()
  const file = getQuoteKeyFile()
  const temp = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  writeFileSync(temp, randomBytes(KEY_BYTES), { mode: 0o600, flag: "wx" })
  try {
    chmodSync(temp, 0o600)
    linkSync(temp, file)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
  } finally {
    unlinkSync(temp)
  }
  return readQuoteKey() as Uint8Array
}
