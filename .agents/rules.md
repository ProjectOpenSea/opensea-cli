# opensea-cli

A TypeScript CLI and SDK for querying the OpenSea API. Designed for both AI agents and developers.

## Quick Reference

```bash
node --version          # Requires >= 18.0.0 (see .nvmrc for exact version)
npm install             # Install dependencies
npm run build           # Build CLI + SDK with tsup
npm run dev             # Build in watch mode
npm run type-check      # TypeScript type checking (tsc --noEmit)
npm run lint            # Lint with Biome
npm run lint:fix        # Lint and auto-fix with Biome
npm run format          # Format with Biome
npm run format:check    # Check formatting with Biome
npm run test            # Run tests with vitest
```

## Architecture

### Dual Entry Points

The project produces two build artifacts via `tsup`:

1. **CLI** (`src/cli.ts` -> `dist/cli.js`) - Command-line interface with `#!/usr/bin/env node` shebang. Uses Commander.js to parse commands and options.
2. **SDK** (`src/index.ts` -> `dist/index.js` + `dist/index.d.ts`) - Programmatic TypeScript/JavaScript library. Exports `OpenSeaCLI`, `OpenSeaClient`, `OpenSeaAPIError`, and all API types.

### Layer Diagram

```
CLI (src/cli.ts)              SDK (src/sdk.ts)
  |                             |
  |  Commander commands         |  Domain API classes
  |  (src/commands/*.ts)        |  (CollectionsAPI, NFTsAPI, ...)
  |                             |
  +----------+------------------+
             |
       OpenSeaClient (src/client.ts)
             |
        fetch -> OpenSea API v2
```

### Key Modules

| Module | Purpose |
|---|---|
| `src/client.ts` | Low-level HTTP client. Handles auth headers, query params, error wrapping. |
| `src/sdk.ts` | High-level SDK with domain-specific API classes (`OpenSeaCLI`). |
| `src/cli.ts` | CLI entrypoint. Configures Commander program and global options. |
| `src/commands/*.ts` | One file per API domain. Each exports a factory function. |
| `src/output.ts` | Output formatting (JSON or table). |
| `src/types/api.ts` | TypeScript interfaces matching OpenSea API v2 response shapes. |
| `src/types/index.ts` | Re-exports API types plus internal config types. |

### API Domains

Each domain has both a CLI command file (`src/commands/<domain>.ts`) and an SDK class (`src/sdk.ts`):

- **collections** - Collection metadata, stats, traits
- **nfts** - NFT lookup, listing by collection/contract/account, metadata refresh
- **listings** - Active listings (all, best, best-for-nft)
- **offers** - Offers (all, collection, best-for-nft, trait offers)
- **events** - Marketplace events (sales, transfers, mints, etc.)
- **accounts** - Account profile lookup
- **tokens** - Fungible token trending/top/details
- **swaps** - Token swap quotes

## Conventions

### TypeScript & Module System

- ESM-only (`"type": "module"` in package.json).
- Use `.js` extensions in all import paths (required by ESM + bundler module resolution).
- Target ES2022 with strict mode enabled.
- `verbatimModuleSyntax` is on: use `import type` for type-only imports.

### Formatting & Linting (Biome)

- **Indentation**: 2 spaces
- **Quotes**: double quotes
- **Semicolons**: as needed (omit when not required)
- **Trailing commas**: always
- **Arrow parens**: as needed (omit for single params)
- **Line width**: 80 characters
- **Line endings**: LF

Run `npm run format` before committing. Run `npm run lint` to check for issues.

### Command File Pattern

Every command file in `src/commands/` follows this pattern:

```typescript
import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import { formatOutput } from "../output.js"
import type { SomeType } from "../types/index.js"

export function domainCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => "json" | "table",
): Command {
  const cmd = new Command("domain").description("Description")

  cmd
    .command("subcommand")
    .description("What it does")
    .argument("<required>", "Description")
    .option("--limit <limit>", "Number of results", "20")
    .action(async (requiredArg: string, options: { limit: string }) => {
      const client = getClient()
      const result = await client.get<SomeType>(`/api/v2/...`)
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
```

Key aspects:
- Factory function receives `getClient` and `getFormat` thunks (lazy initialization).
- Commands call `client.get<T>()` or `client.post<T>()` directly with API paths.
- All output goes through `formatOutput()` to `console.log()`.
- CLI option strings are parsed to numbers with `Number.parseInt(value, 10)` or `Number.parseFloat(value)`.
- Register new commands in `src/commands/index.ts` and wire them in `src/cli.ts`.

### SDK Class Pattern

SDK domain classes in `src/sdk.ts`:

```typescript
class DomainAPI {
  constructor(private client: OpenSeaClient) {}

  async methodName(param: string, options?: {
    limit?: number
    next?: string
  }): Promise<ResponseType> {
    return this.client.get<ResponseType>("/api/v2/...", {
      limit: options?.limit,
      next: options?.next,
    })
  }
}
```

Key aspects:
- Each class wraps `OpenSeaClient` with typed, camelCase methods.
- SDK methods use camelCase option names; the client maps them to snake_case query params.
- Add new domain classes and register them as `readonly` properties on `OpenSeaCLI`.

### Type Definitions

- All API response types live in `src/types/api.ts`.
- Types use snake_case field names to match OpenSea API v2 responses exactly.
- Internal config types live in `src/types/index.ts`.
- Use `export type` for type-only exports (enforced by `verbatimModuleSyntax`).

### Error Handling

- API errors are wrapped in `OpenSeaAPIError` (includes status code, response body, path).
- CLI catches `OpenSeaAPIError` and outputs structured JSON to stderr, then exits with code 1.
- Authentication errors (missing API key) exit with code 2.
- Exit codes: 0 = success, 1 = API error, 2 = auth error.

## Design Rules

1. **No external HTTP libraries** - Uses native `fetch` (available in Node 18+). Do not add axios, got, node-fetch, or similar.
2. **No runtime validation in the client** - The client trusts API responses match declared types. Zod is a dependency available for future use but not currently applied to responses.
3. **Commands are thin wrappers** - CLI commands should only parse arguments, call the client, and format output. No business logic in command files.
4. **Keep the SDK and CLI independent** - CLI commands use `OpenSeaClient` directly (not `OpenSeaCLI`). The SDK is for external programmatic consumers.
5. **Stdout for data, stderr for errors** - Data output goes to `console.log`. Error messages go to `console.error`.
6. **One file per domain in commands/** - Each API domain gets exactly one command file. Don't merge domains or split a domain across files.
7. **Types mirror the API** - Type definitions should match the OpenSea API v2 response schema. Don't rename fields or restructure response types.
8. **Pagination is cursor-based** - Use `next` cursor strings for pagination, never offset-based. Expose `--next <cursor>` on CLI commands that support pagination.

## Adding a New API Domain

1. Add response types to `src/types/api.ts`.
2. Create `src/commands/<domain>.ts` following the command file pattern.
3. Export the command from `src/commands/index.ts`.
4. Wire the command in `src/cli.ts` via `program.addCommand(...)`.
5. Add an SDK class in `src/sdk.ts` and register it on `OpenSeaCLI`.
6. Update `README.md` with CLI usage and SDK examples.

## Testing

### Test Suite

Tests use [Vitest](https://vitest.dev/) with v8 coverage, located in the top-level `test/` directory:

```bash
npm run test            # Run all tests
npm run test -- --coverage  # Run with coverage report
```

| Directory | What it covers |
|---|---|
| `test/client.test.ts` | `OpenSeaClient` (get, post, graphql, error handling) |
| `test/output.test.ts` | `formatOutput` (JSON and table formatting) |
| `test/sdk.test.ts` | All SDK API classes and their methods |
| `test/commands/*.test.ts` | Each CLI command module (option parsing, subcommand routing, output) |
| `test/integration.test.ts` | End-to-end SDK flows with mocked `fetch` |
| `test/mocks.ts` | Shared mock factories (`createCommandTestContext`, `mockFetchResponse`, `mockFetchTextResponse`) |

### Testing Requirements

All new code must include tests with coverage:

1. **New API domains**: Add tests for the command file (`test/commands/<domain>.test.ts`), SDK methods (`test/sdk.test.ts`), and any new client methods (`test/client.test.ts`).
2. **New client methods**: Add unit tests covering success paths, error paths, and edge cases.
3. **Bug fixes**: Add a regression test that fails without the fix and passes with it.
4. **Use shared mocks**: Import from `test/mocks.ts` instead of duplicating mock setup. For command tests, use `createCommandTestContext()`. For tests that need `fetch` mocking, use `mockFetchResponse()` / `mockFetchTextResponse()`.
5. **Coverage**: Aim for coverage parity or improvement. Do not merge code that reduces overall test coverage.

## CI / Publishing

### CI (GitHub Actions)

The CI workflow (`.github/workflows/ci.yml`) runs on all PRs and pushes to `main` with two parallel jobs:

- **lint** job: `format:check`, `lint`, `type-check`
- **test** job: `vitest run --coverage`

All CI checks must pass before merging.

### Publishing

- GitHub Actions workflow (`.github/workflows/npm-publish.yml`) publishes to npm on GitHub release.
- **Dual-package publishing**: The workflow publishes two packages:
  1. `@opensea/cli` — the main package (from repo root).
  2. `opensea-cli` — a stub redirect package (from `packages/opensea-cli-stub/`) that warns users to install `@opensea/cli`. The stub publish uses `continue-on-error: true` since its version rarely changes.
- Auth uses OIDC via `id-token: write` + `setup-node` with `registry-url` + `--provenance` flag. No npm token secret needed.
