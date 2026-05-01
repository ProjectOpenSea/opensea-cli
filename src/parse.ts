import type { Command } from "commander"

export function parseIntOption(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid value for ${name}: "${value}" is not an integer`)
  }
  return parsed
}

export function parseFloatOption(value: string, name: string): number {
  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed)) {
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
