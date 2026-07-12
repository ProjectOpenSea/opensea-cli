export const DEFAULT_AUTH_BASE_URL = "https://auth.opensea.io"
export const DEFAULT_PUBLIC_CLIENT_ID = "379893200225068569"

export function resolveOAuthClientId(explicitClientId?: string): string {
  return (
    explicitClientId ??
    process.env.OPENSEA_OAUTH_CLIENT_ID ??
    DEFAULT_PUBLIC_CLIENT_ID
  )
}
