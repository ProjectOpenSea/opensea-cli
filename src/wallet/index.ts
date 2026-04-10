import type { WalletAdapter } from "./adapter.js"
import { FireblocksAdapter } from "./fireblocks.js"
import { PrivateKeyAdapter } from "./private-key.js"
import { PrivyAdapter } from "./privy.js"
import { TurnkeyAdapter } from "./turnkey.js"

export type {
  TransactionRequest,
  TransactionResult,
  WalletAdapter,
} from "./adapter.js"
export { CHAIN_IDS, resolveChainId } from "./chains.js"
export { FireblocksAdapter } from "./fireblocks.js"
export { PrivateKeyAdapter } from "./private-key.js"
export { PrivyAdapter } from "./privy.js"
export { TurnkeyAdapter } from "./turnkey.js"

export type WalletProvider = "privy" | "turnkey" | "fireblocks" | "private-key"

export const WALLET_PROVIDERS: WalletProvider[] = [
  "privy",
  "turnkey",
  "fireblocks",
  "private-key",
]

/**
 * Create a WalletAdapter from the current environment.
 *
 * When no provider is specified, auto-detects based on which
 * environment variables are set. Priority: Turnkey > Fireblocks > PrivateKey > Privy.
 * If no provider-specific vars are found, defaults to Privy.
 */
export function createWalletFromEnv(provider?: WalletProvider): WalletAdapter {
  if (provider) {
    return createAdapter(provider)
  }

  // Auto-detect based on available env vars
  const hasTurnkey =
    !!process.env.TURNKEY_API_PUBLIC_KEY &&
    !!process.env.TURNKEY_ORGANIZATION_ID
  const hasFireblocks =
    !!process.env.FIREBLOCKS_API_KEY && !!process.env.FIREBLOCKS_VAULT_ID
  const hasPrivateKey = !!process.env.PRIVATE_KEY && !!process.env.RPC_URL
  const hasPrivy = !!process.env.PRIVY_APP_ID && !!process.env.PRIVY_APP_SECRET

  const detected = [
    hasTurnkey && "turnkey",
    hasFireblocks && "fireblocks",
    hasPrivateKey && "private-key",
    hasPrivy && "privy",
  ].filter(Boolean) as WalletProvider[]

  if (detected.length > 1) {
    console.warn(
      `WARNING: Multiple wallet providers detected: ${detected.join(", ")}. ` +
        `Using ${detected[0]}. Set --wallet-provider explicitly to avoid ambiguity.`,
    )
  }

  if (hasTurnkey) return TurnkeyAdapter.fromEnv()
  if (hasFireblocks) return FireblocksAdapter.fromEnv()
  if (hasPrivateKey) return PrivateKeyAdapter.fromEnv()

  // Default to Privy
  return PrivyAdapter.fromEnv()
}

function createAdapter(provider: WalletProvider): WalletAdapter {
  switch (provider) {
    case "privy":
      return PrivyAdapter.fromEnv()
    case "turnkey":
      return TurnkeyAdapter.fromEnv()
    case "fireblocks":
      return FireblocksAdapter.fromEnv()
    case "private-key":
      return PrivateKeyAdapter.fromEnv()
    default:
      throw new Error(
        `Unknown wallet provider "${provider}". Valid providers: ${WALLET_PROVIDERS.join(", ")}`,
      )
  }
}
