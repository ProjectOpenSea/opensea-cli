# Agent Rules for opensea-cli

## Overview

opensea-cli is a TypeScript CLI and SDK for querying the OpenSea API v2. It produces two build artifacts: a CLI binary (Commander.js) and a programmatic SDK library.

## Commands

```bash
npm install             # Install dependencies
npm run build           # Build CLI + SDK with tsup
npm run type-check      # TypeScript type checking (tsc --noEmit)
npm run lint            # Lint with Biome
npm run lint:fix        # Lint and auto-fix with Biome
npm run format          # Format with Biome
npm run format:check    # Check formatting with Biome
npm run test            # Run tests with vitest
```

## Architecture

```
src/
  cli.ts              CLI entrypoint (Commander program, global options)
  index.ts            SDK entrypoint (public exports)
  client.ts           OpenSeaClient - low-level HTTP client (fetch + API key auth)
  sdk.ts              OpenSeaCLI - high-level SDK with domain API classes
  output.ts           Output formatting (JSON / table)
  commands/
    index.ts          Barrel export for all command factories
    accounts.ts       Account lookup commands
    collections.ts    Collection metadata/stats/traits commands
    events.ts         Marketplace event commands
    listings.ts       Listing query commands
    nfts.ts           NFT query/refresh commands
    offers.ts         Offer query commands
    swaps.ts          Swap quote commands
    tokens.ts         Fungible token commands
  types/
    index.ts          Re-exports API types + internal config types
    api.ts            TypeScript interfaces matching OpenSea API v2 responses
```

### Layer Separation

- **`OpenSeaClient`** (`src/client.ts`): Thin HTTP wrapper around native `fetch`. Adds `x-api-key` header, builds URLs with query params, wraps errors in `OpenSeaAPIError`.
- **CLI commands** (`src/commands/*.ts`): Each file exports a factory function `(getClient, getFormat) => Command`. Commands call `OpenSeaClient` directly with API paths.
- **SDK classes** (`src/sdk.ts`): Domain-specific classes wrapping `OpenSeaClient` with typed camelCase methods. Exposed via `OpenSeaCLI` for programmatic consumers.
- **Output** (`src/output.ts`): `formatOutput(data, format)` handles JSON (default) and table formatting.

CLI commands and SDK classes are independent consumers of `OpenSeaClient`. The CLI does not use the SDK.

## Idioms

### Module System
- ESM-only (`"type": "module"` in package.json)
- Always use `.js` extensions in import paths
- Use `import type` for type-only imports (`verbatimModuleSyntax` is enabled)

### Formatting (Biome)
- 2 spaces indentation
- Double quotes
- Trailing commas always
- Semicolons as needed (omit when not required)
- Arrow parens as needed
- Line width 80, LF line endings

### Command Pattern
- Factory function receiving `getClient` and `getFormat` thunks
- Parse CLI string options to numbers with `Number.parseInt(value, 10)` or `Number.parseFloat(value)`
- Output via `console.log(formatOutput(result, getFormat()))`
- Errors to stderr via `console.error`

### Type Conventions
- API response types in `src/types/api.ts` use snake_case field names matching the API
- SDK method parameters use camelCase
- Use union literal types for enums (e.g., `Chain`, `EventType`, `CollectionOrderBy`)

## Design Rules

1. **Native fetch only** - No external HTTP libraries (no axios, got, node-fetch)
2. **Thin commands** - CLI command files parse args, call client, format output. No business logic.
3. **CLI and SDK are independent** - CLI commands use `OpenSeaClient` directly, not `OpenSeaCLI`
4. **Stdout for data, stderr for errors** - Never mix data and error output
5. **One file per domain** - Each API domain gets one command file in `src/commands/`
6. **Types mirror the API** - Don't rename or restructure API response fields
7. **Cursor-based pagination** - Use `next` cursor strings, expose via `--next <cursor>` CLI option
8. **Exit codes** - 0 success, 1 API error, 2 auth error

## Adding a New API Domain

1. Define response types in `src/types/api.ts`
2. Create `src/commands/<domain>.ts` using the command factory pattern
3. Export from `src/commands/index.ts`
4. Wire in `src/cli.ts` with `program.addCommand(...)`
5. Add SDK class in `src/sdk.ts` and register on `OpenSeaCLI`
6. Document CLI usage and SDK examples in `README.md`
