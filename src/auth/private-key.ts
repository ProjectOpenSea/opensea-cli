/**
 * Resolve the private key to use for SIWE login.
 *
 * `--private-key` is intentionally an optional-value option. Passing it
 * without a value reads `OPENSEA_PRIVATE_KEY`; passing it with a value
 * should only be used in scripted/automated contexts because command-line
 * arguments can leak into shell history and process listings.
 */
export function resolvePrivateKey(optionValue: string | true | undefined): {
  privateKey: string
  source: "argument" | "environment"
} {
  if (typeof optionValue === "string") {
    return { privateKey: optionValue, source: "argument" }
  }

  const envValue = process.env.OPENSEA_PRIVATE_KEY
  if (envValue) {
    return { privateKey: envValue, source: "environment" }
  }

  throw new Error(
    "Private key required. Set OPENSEA_PRIVATE_KEY or pass --private-key <key>.",
  )
}

/**
 * Emit a stderr warning when a private key was passed as an inline command
 * argument, so users are nudged toward the environment variable.
 */
export function warnIfInlinePrivateKey(
  source: "argument" | "environment",
): void {
  if (source === "argument") {
    console.error(
      "Warning: passing a private key as a command-line argument is insecure " +
        "and may be recorded in shell history or visible to other users via ps. " +
        "Prefer setting OPENSEA_PRIVATE_KEY and passing --private-key without a value.",
    )
  }
}
