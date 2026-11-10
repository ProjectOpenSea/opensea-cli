import { randomBytes } from "node:crypto"
import {
  chmodSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { ensureAuthDir, getAuthDir } from "./store.js"

/**
 * Path of the cached API key, `~/.opensea/api_key` by default.
 *
 * The skill's `opensea-resolve-key.sh` writes the same file: the bare key
 * followed by a newline, mode 0600, under `${OPENSEA_CONFIG_DIR:-~/.opensea}`.
 * Keep the two in step so a key cached by either one is read by the other.
 */
export function getApiKeyFile(): string {
  return join(getAuthDir(), "api_key")
}

/**
 * Read the cached API key, or `undefined` when there is none.
 *
 * A missing, empty or whitespace-only file counts as no key. Surrounding
 * whitespace (the trailing newline the shell helper writes) is trimmed. Any
 * other read failure is reported on stderr and treated as no key, so the
 * caller's "API key required" error still fires.
 */
export function loadCachedApiKey(): string | undefined {
  const file = getApiKeyFile()
  try {
    if (!statSync(file).isFile()) {
      console.warn(`Warning: ${file} is not a regular file and was not read.`)
      return undefined
    }
    const key = readFileSync(file, "utf-8").trim()
    return key === "" ? undefined : key
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`Warning: could not read ${file}: ${msg}`)
    return undefined
  }
}

/**
 * Write `key` to {@link getApiKeyFile} with mode 0600, creating the config
 * directory with mode 0700 if needed. The key goes to a temporary file in the
 * same directory first and is renamed into place, so a reader never sees a
 * partly written key. Returns the path written.
 */
export function saveApiKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed === "") {
    throw new Error("Refusing to save an empty API key")
  }
  ensureAuthDir()
  const file = getApiKeyFile()
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  try {
    writeFileSync(tmp, `${trimmed}\n`, { mode: 0o600, flag: "wx" })
    // The mode option is filtered through the umask; set it exactly.
    chmodSync(tmp, 0o600)
    renameSync(tmp, file)
  } catch (err) {
    rmSync(tmp, { force: true })
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to write API key to ${file}: ${msg}`)
  }
  return file
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value : undefined
}

/**
 * Resolve the API key: the `--api-key` flag, then `OPENSEA_API_KEY`, then the
 * cached key file. Empty or whitespace-only values fall through to the next
 * source, matching `opensea-resolve-key.sh`.
 */
export function resolveApiKey(flag?: string): string | undefined {
  return (
    nonEmpty(flag) ??
    nonEmpty(process.env.OPENSEA_API_KEY) ??
    loadCachedApiKey()
  )
}
