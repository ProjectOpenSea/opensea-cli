import { generateKeyPairSync } from "node:crypto"
import { createWalletFromEnv, type WalletInfo } from "@opensea/wallet-adapters"
import { Command } from "commander"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"

const PRIVY_API_BASE = "https://api.privy.io"

/**
 * `opensea wallet info` reports the security posture of the active
 * wallet adapter — what credential is in env, what hardening is in
 * place, what is missing. Read-only. Provider-aware.
 *
 * Warnings go to stderr; data goes to stdout. Exit code is 0 on
 * success regardless of warnings; nonzero only on auth/network
 * failure.
 */
export function walletCommand(getFormat: () => OutputFormat): Command {
  const cmd = new Command("wallet").description(
    "Inspect the active wallet adapter's security posture",
  )

  cmd
    .command("generate-auth-key")
    .description(
      "Generate a P-256 keypair for use as a Privy authorization key. " +
        "Pure-local — no API calls. The private key is for the agent " +
        "(PRIVY_AUTH_SIGNING_KEY) or for off-machine storage if registering " +
        "as owner_id; the public key is what you register with Privy.",
    )
    .action(() => {
      const { publicKey, privateKey } = generateKeyPairSync("ec", {
        namedCurve: "P-256",
      })
      const privatePkcs8 = privateKey
        .export({ type: "pkcs8", format: "der" })
        .toString("base64")
      const publicSpki = publicKey
        .export({ type: "spki", format: "der" })
        .toString("base64")
      console.log(
        formatOutput(
          {
            privateKey: privatePkcs8,
            publicKey: publicSpki,
            format: "PKCS8 (private) / SPKI (public), base64-encoded P-256",
            usage:
              "Register publicKey with Privy as additional_signer or owner. " +
              "Set privateKey as PRIVY_AUTH_SIGNING_KEY (additional_signer) " +
              "OR keep it OFF the agent host (owner). Never put both keys " +
              "on the agent.",
          },
          getFormat(),
        ),
      )
    })

  cmd
    .command("create")
    .description(
      "Create a new Privy server wallet. Privy-only. Creates a NEW " +
        "resource — cannot touch existing wallets. New wallet has no " +
        "funds and no policy until separately configured. Reads " +
        "PRIVY_APP_ID and PRIVY_APP_SECRET from env.",
    )
    .option(
      "--chain-type <type>",
      "Chain type for the wallet (default: ethereum)",
      "ethereum",
    )
    .option(
      "--owner-public-key <base64>",
      "Optional SPKI base64-encoded P-256 public key to register as " +
        "owner. Recommended: pass the public key from `opensea wallet " +
        "generate-auth-key` (whose private half you keep OFF this " +
        "machine). Without an owner_id, env credentials can rewrite the " +
        "wallet's policy unilaterally.",
    )
    .action(async (options: { chainType: string; ownerPublicKey?: string }) => {
      const appId = process.env.PRIVY_APP_ID
      const appSecret = process.env.PRIVY_APP_SECRET
      if (!appId || !appSecret) {
        console.error(
          "PRIVY_APP_ID and PRIVY_APP_SECRET must be set in env to create " +
            "a Privy server wallet.",
        )
        process.exit(1)
        return
      }
      try {
        const baseUrl = process.env.PRIVY_API_BASE_URL ?? PRIVY_API_BASE
        const credentials = Buffer.from(`${appId}:${appSecret}`).toString(
          "base64",
        )
        const body: Record<string, unknown> = { chain_type: options.chainType }
        if (options.ownerPublicKey) {
          body.owner = { public_key: options.ownerPublicKey }
        }
        const response = await fetch(`${baseUrl}/v1/wallets`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${credentials}`,
            "privy-app-id": appId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        })
        if (!response.ok) {
          const errorBody = await response.text()
          const hint =
            response.status === 401 &&
            errorBody.includes("Invalid app ID or app secret")
              ? " (hint: if you tested via curl, use 'printf %s \"$id:$secret\" | base64' — 'echo' adds a trailing newline that breaks basic auth)"
              : ""
          console.error(
            JSON.stringify(
              {
                error: "Wallet create failed",
                status: response.status,
                body: errorBody + hint,
              },
              null,
              2,
            ),
          )
          process.exit(1)
        }
        const data = (await response.json()) as {
          id: string
          address: string
          chain_type: string
          owner_id?: string | null
        }
        if (!options.ownerPublicKey) {
          console.error(
            "WARNING: created without --owner-public-key. The wallet has " +
              "no owner_id and the credentials in env can rewrite its " +
              "policy unilaterally. Register an owner before applying a " +
              "policy or funding the wallet (see " +
              "https://github.com/ProjectOpenSea/opensea-skill/blob/main/docs/policy-administration.md).",
          )
        }
        console.log(
          formatOutput(
            {
              id: data.id,
              address: data.address,
              chainType: data.chain_type,
              ownerId: data.owner_id ?? null,
              nextSteps: options.ownerPublicKey
                ? "Set PRIVY_WALLET_ID to this id, apply a policy via " +
                  "https://github.com/ProjectOpenSea/opensea-skill/blob/main/docs/policy-administration.md, fund the wallet, then " +
                  "run `opensea wallet info`."
                : "Register an owner_id BEFORE funding. See " +
                  "https://github.com/ProjectOpenSea/opensea-skill/blob/main/docs/policy-administration.md and opensea-wallet/references/wallet-setup.md.",
            },
            getFormat(),
          ),
        )
      } catch (error) {
        console.error(
          JSON.stringify(
            { error: "Wallet error", message: (error as Error).message },
            null,
            2,
          ),
        )
        process.exit(1)
      }
    })

  cmd
    .command("info")
    .description(
      "Show wallet address, policy/role posture, and hardening warnings",
    )
    .action(async () => {
      try {
        const adapter = createWalletFromEnv()
        if (!adapter.getWalletInfo) {
          console.error(
            `Provider ${adapter.name} does not expose wallet info. ` +
              "This is expected for the private-key adapter.",
          )
          const address = await adapter.getAddress()
          console.log(
            formatOutput({ provider: adapter.name, address }, getFormat()),
          )
          return
        }
        const info = await adapter.getWalletInfo()
        for (const warning of warningsForInfo(info)) {
          console.error(`WARNING: ${warning}`)
        }
        console.log(formatOutput(info, getFormat()))
      } catch (error) {
        console.error(
          JSON.stringify(
            {
              error: "Wallet error",
              message: (error as Error).message,
            },
            null,
            2,
          ),
        )
        process.exit(1)
      }
    })

  return cmd
}

/**
 * Translate provider-specific posture flags into human-readable
 * warnings. Each warning maps to a documented hardening step in
 * `packages/skill/opensea-wallet/references/wallet-setup.md` and
 * `https://github.com/ProjectOpenSea/opensea-skill/blob/main/docs/policy-administration.md`.
 */
function warningsForInfo(info: WalletInfo): string[] {
  switch (info.provider) {
    case "privy": {
      const out: string[] = []
      if (!info.ownerEnforcesAuthKey) {
        out.push(
          "Wallet has no owner_id — the credentials in env can rewrite " +
            "policy unilaterally. Register an authorization key on the " +
            "wallet (see https://github.com/ProjectOpenSea/opensea-skill/blob/main/docs/policy-administration.md and " +
            "opensea-wallet/references/wallet-setup.md, Privy section).",
        )
      }
      if (info.policyIds.length === 0) {
        out.push(
          "Wallet has no policy_ids — there is no on-chain spend " +
            "enforcement. Apply a per-tx cap policy (see " +
            "opensea-wallet/references/wallet-policies.md).",
        )
      }
      return out
    }
    case "turnkey": {
      const out: string[] = []
      if (info.isRootUser) {
        out.push(
          `API user "${info.username || info.userId}" is in the root ` +
            "quorum. Root users bypass Turnkey's policy engine entirely. " +
            "Create a non-root signer-only API user instead (see " +
            "opensea-wallet/references/wallet-setup.md, Turnkey section).",
        )
      }
      return out
    }
    case "fireblocks":
      return [
        "Fireblocks does not expose API-user role via API. Confirm at " +
          "console.fireblocks.io that this key has the `Signer` role " +
          "and not `Admin` or any broader role. Re-confirm whenever " +
          "the key is rotated.",
      ]
    case "bankr":
      return [
        "Bankr does not expose API-key scope flags via API. Confirm at " +
          "bankr.bot/api that this key has appropriate readOnly / " +
          "allowedRecipients / allowedIps / daily-limit settings. " +
          "Re-confirm whenever the key is rotated.",
      ]
    default: {
      const _exhaustive: never = info
      return _exhaustive
    }
  }
}
