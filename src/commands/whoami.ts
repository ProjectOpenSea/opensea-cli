import { Command } from "commander"
import { loadCurrentToken } from "../auth/store.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"

const PROJECT_ROLES_CLAIM = "urn:zitadel:iam:org:project:roles"

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".")
  if (parts.length !== 3) {
    throw new Error("Not a JWT")
  }
  const payload = Buffer.from(parts[1], "base64url").toString("utf8")
  return JSON.parse(payload) as Record<string, unknown>
}

function readScopesClaim(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(/\s+/).filter(Boolean)
  }
  if (Array.isArray(value)) {
    return value.filter((scope): scope is string => typeof scope === "string")
  }
  return []
}

function readJwtIdentity(accessToken: string): {
  wallet?: string
  opensea_scopes: string[]
  project_roles?: unknown
} {
  const claims = decodeJwtPayload(accessToken)
  const wallet = typeof claims.wallet === "string" ? claims.wallet : undefined
  const projectRoles = claims[PROJECT_ROLES_CLAIM] ?? claims.project_roles

  return {
    wallet,
    opensea_scopes: readScopesClaim(claims.opensea_scopes),
    ...(projectRoles === undefined ? {} : { project_roles: projectRoles }),
  }
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right)
  return left.filter(scope => !rightSet.has(scope))
}

export function whoamiCommand(getFormat: () => OutputFormat): Command {
  return new Command("whoami")
    .description("Show the current authenticated wallet and scopes")
    .option(
      "--diagnostic",
      "Include unverified JWT claims for troubleshooting; claims are not authorization data",
    )
    .action((options: { diagnostic?: boolean }) => {
      const token = loadCurrentToken()
      if (!token) {
        console.log(
          formatOutput(
            { status: "not_authenticated", message: "No stored token" },
            getFormat(),
          ),
        )
        return
      }

      const expired = new Date(token.expiresAt) < new Date()
      let jwt: ReturnType<typeof readJwtIdentity> | undefined
      let jwtError: string | undefined
      try {
        jwt = readJwtIdentity(token.accessToken)
      } catch (error) {
        jwtError = error instanceof Error ? error.message : String(error)
      }

      const jwtScopes = jwt?.opensea_scopes ?? []
      const broaderScopes = difference(token.scopes, token.requestedScopes)
      const diagnostic = options.diagnostic
        ? {
            unverified: true,
            jwt: jwt ?? { opensea_scopes: [] },
            scope_difference: {
              only_in_token: difference(token.scopes, jwtScopes),
              only_in_jwt: difference(jwtScopes, token.scopes),
            },
            ...(jwtError ? { jwt_error: jwtError } : {}),
          }
        : undefined
      console.log(
        formatOutput(
          {
            status: expired ? "expired" : "authenticated",
            address: token.address,
            auth_method: token.authMethod,
            scopes: token.scopes,
            requested_scopes: token.requestedScopes,
            granted_scopes: token.scopes,
            scope_source: token.scopeSource ?? "unknown",
            ...(broaderScopes.length > 0
              ? {
                  scope_warning: {
                    type: "broader_than_requested",
                    scopes: broaderScopes,
                  },
                }
              : {}),
            ...(diagnostic ? { diagnostic } : {}),
            expires_at: token.expiresAt,
            expired,
          },
          getFormat(),
        ),
      )
    })
}
