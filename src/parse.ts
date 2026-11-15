import { readFileSync } from "node:fs"
import type { Command } from "commander"

/**
 * Read and parse a JSON file passed via a `--body <path>` style option. Wraps
 * raw `fs.readFileSync` + `JSON.parse` errors with a message that names the
 * option and the file path so users see "Could not read --body from 'foo.json':
 * ENOENT…" instead of a bare Node stack trace.
 */
export function readJsonBodyOption<T = unknown>(
  path: string,
  optionName: string,
): T {
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch (err) {
    throw new Error(
      `Could not read ${optionName} from '${path}': ${(err as Error).message}`,
    )
  }
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    throw new Error(
      `Could not parse ${optionName} '${path}' as JSON: ${(err as Error).message}`,
    )
  }
}

/**
 * Encode one URL path segment. `.` and `..` are rejected because the URL
 * parser collapses them (encoded or not) and would request another endpoint.
 */
export function pathSegment(value: string): string {
  if (value === "." || value === "..") {
    throw new Error(
      `Invalid path segment: ${JSON.stringify(value)} would traverse to a different endpoint`,
    )
  }
  return encodeURIComponent(value)
}

export function parseIntOption(value: string, name: string): number {
  const parsed = Number(value)
  if (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid value for ${name}: "${value}" is not an integer`)
  }
  return parsed
}

/**
 * A token ID as the API takes it: a non-negative decimal integer string
 * (uint256), passed through unchanged so IDs above 2^53 keep every digit.
 */
export function parseTokenIdOption(value: string, name: string): string {
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `${name} must be a non-negative decimal integer, got "${value}"`,
    )
  }
  return value
}

export function parseBooleanOption(value: string, flag: string): boolean {
  if (value !== "true" && value !== "false") {
    throw new Error(`${flag} must be 'true' or 'false'`)
  }
  return value === "true"
}

/** Commander argParser for a repeatable option: `--x a --x b` → `["a", "b"]`. */
export function collectOption(value: string, previous?: string[]): string[] {
  return [...(previous ?? []), value]
}

export function parseFloatOption(value: string, name: string): number {
  const parsed = Number(value)
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) ||
    !Number.isFinite(parsed)
  ) {
    throw new Error(`Invalid value for ${name}: "${value}" is not a number`)
  }
  return parsed
}

const TRAITS_OPTION_DESCRIPTION =
  'Filter by traits (JSON array, e.g. \'[{"traitType":"Background","value":"Red"}]\'). Multiple entries are AND-combined.'

/** Register the shared `--traits <json>` option on a command. */
export function addTraitsOption(cmd: Command): Command {
  return cmd.option("--traits <json>", TRAITS_OPTION_DESCRIPTION)
}

/**
 * Register the shared `--limit <limit>` option. `description` and
 * `defaultValue` are overridable because per-command caps and defaults vary
 * (e.g. "Number of results (max 100)", default "50").
 */
export function addLimitOption(
  cmd: Command,
  description = "Number of results",
  defaultValue = "20",
): Command {
  return cmd.option("--limit <limit>", description, defaultValue)
}

/** Register the shared `--next <cursor>` pagination-cursor option. */
export function addNextOption(cmd: Command): Command {
  return cmd.option("--next <cursor>", "Pagination cursor")
}

/**
 * Register the common `--limit` + `--next` pagination pair (in that order).
 * Most paginated commands need exactly this; `--limit` remains customizable.
 */
export function addPaginationOptions(
  cmd: Command,
  limitDescription = "Number of results",
  limitDefault = "20",
): Command {
  return addNextOption(addLimitOption(cmd, limitDescription, limitDefault))
}

/** Register the shared `--sort-direction <dir>` option. */
export function addSortDirectionOption(cmd: Command): Command {
  return cmd.option("--sort-direction <dir>", "Sort direction (asc, desc)")
}

/** Register the shared `--chain <chain>` filter option. */
export function addChainOption(cmd: Command): Command {
  return cmd.option("--chain <chain>", "Filter by chain")
}

/**
 * Hand a user-supplied program `--chain` to the subcommand being run.
 *
 * The program declares `--chain` too, and commander gives a program option to
 * the program wherever it appears on the line, so a subcommand's own `--chain`
 * is never set by the parser. Only a value the user supplied is forwarded:
 * the program's `ethereum` default would turn "no filter" into "ethereum only"
 * and satisfy a required chain the user never chose.
 *
 * This runs in a preAction hook, after commander's mandatory-option check, so
 * a subcommand must declare `--chain` with `option` and check it with
 * `requireChainOption`, never with `requiredOption`.
 */
export function forwardChainOption(
  program: Command,
  actionCommand: Command,
): void {
  if (actionCommand === program) return
  if (!actionCommand.options.some(o => o.attributeName() === "chain")) return
  const own = actionCommand.getOptionValueSource("chain")
  if (own !== undefined && own !== "default") return
  const source = program.getOptionValueSource("chain")
  if (source === undefined || source === "default") return
  actionCommand.setOptionValueWithSource(
    "chain",
    program.getOptionValue("chain"),
    source,
  )
}

/**
 * Return the subcommand's `--chain`, or fail the way commander fails a missing
 * required option. Use in place of `requiredOption("--chain ...")`; see
 * `forwardChainOption`.
 */
export function requireChainOption(
  chain: string | undefined,
  cmd: Command,
): string {
  if (chain) return chain
  return cmd.error("error: required option '--chain <chain>' not specified", {
    code: "commander.missingMandatoryOptionValue",
  })
}

// Re-stringify (rather than passing the raw input through) so whitespace and
// key order are normalized before hitting the API.
export function parseTraitsOption(value: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid value for --traits: not valid JSON (${reason})`)
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      '--traits must be a non-empty JSON array, e.g. \'[{"traitType":"Background","value":"Red"}]\'',
    )
  }
  for (const [i, item] of parsed.entries()) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as { traitType?: unknown }).traitType !== "string" ||
      typeof (item as { value?: unknown }).value !== "string"
    ) {
      throw new Error(
        `--traits[${i}] must be { traitType: string, value: string }`,
      )
    }
  }
  return JSON.stringify(parsed)
}
