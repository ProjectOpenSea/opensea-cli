import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { readJsonBodyOption } from "../parse.js"

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
const API_V2_PREFIX = ["", "api", "v2", ""].join("/")

/** Low-level escape hatch for newly published OpenSea API operations. */
export function apiCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const command = new Command("api").description(
    "Call an OpenSea API v2 endpoint with the active credentials",
  )
  command
    .command("request")
    .description(
      "Send a REST request; useful for scoped endpoints before a dedicated command exists",
    )
    .argument("<method>", "GET, POST, PUT, PATCH, or DELETE")
    .argument("<path>", "OpenSea API v2 path")
    .option("--body <path>", "JSON request body file")
    .option("--params <json>", "JSON object of query parameters")
    .action(
      async (
        methodInput: string,
        path: string,
        options: { body?: string; params?: string },
      ) => {
        const method = methodInput.toUpperCase() as Method
        if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
          throw new Error(`Unsupported HTTP method: ${methodInput}`)
        }
        if (!path.startsWith(API_V2_PREFIX)) {
          throw new Error("API path must begin with /api/v2/")
        }

        const body = options.body
          ? readJsonBodyOption<Record<string, unknown>>(options.body, "--body")
          : undefined
        const parsedParams: unknown = options.params
          ? JSON.parse(options.params)
          : undefined
        if (
          parsedParams !== undefined &&
          (parsedParams === null ||
            typeof parsedParams !== "object" ||
            Array.isArray(parsedParams))
        ) {
          throw new Error("--params must be a JSON object")
        }
        const params = parsedParams as Record<string, unknown> | undefined
        const client = getClient()
        const result =
          method === "GET"
            ? await client.get<unknown>(path, params)
            : method === "POST"
              ? await client.post<unknown>(path, body, params)
              : method === "PUT"
                ? await client.put<unknown>(path, body, params)
                : method === "PATCH"
                  ? await client.patch<unknown>(path, body, params)
                  : await client.delete<unknown>(path, body, params)

        console.log(formatOutput(result, getFormat()))
      },
    )
  return command
}
