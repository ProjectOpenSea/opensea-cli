import { formatToon } from "./toon.js"

export type OutputFormat = "json" | "table" | "toon"

export interface OutputOptions {
  fields?: string[]
  maxLines?: number
}

let _outputOptions: OutputOptions = {}

export function setOutputOptions(options: OutputOptions): void {
  _outputOptions = options
}

export function formatOutput(data: unknown, format: OutputFormat): string {
  const processed = _outputOptions.fields
    ? filterFields(data, _outputOptions.fields)
    : data

  let result: string
  if (format === "table") {
    result = formatTable(processed)
  } else if (format === "toon") {
    result = formatToon(processed)
  } else {
    result = JSON.stringify(processed, null, 2)
  }

  if (_outputOptions.maxLines != null) {
    result = truncateOutput(result, _outputOptions.maxLines)
  }

  return result
}

function formatTable(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return "(empty)"
    const keys = Object.keys(data[0] as Record<string, unknown>)
    const widths = keys.map(key =>
      Math.max(
        key.length,
        ...data.map(row => {
          const val = (row as Record<string, unknown>)[key]
          return String(val ?? "").length
        }),
      ),
    )

    const header = keys.map((key, i) => key.padEnd(widths[i])).join("  ")
    const separator = widths.map(w => "-".repeat(w)).join("  ")
    const rows = data.map(row =>
      keys
        .map((key, i) => {
          const val = (row as Record<string, unknown>)[key]
          return String(val ?? "").padEnd(widths[i])
        })
        .join("  "),
    )

    return [header, separator, ...rows].join("\n")
  }

  if (data && typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0) return "(empty)"
    const maxKeyLength = Math.max(...entries.map(([k]) => k.length))
    return entries
      .map(([key, value]) => {
        const displayValue =
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : String(value ?? "")
        return `${key.padEnd(maxKeyLength)}  ${displayValue}`
      })
      .join("\n")
  }

  return String(data)
}

function pickFields(
  obj: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    if (field in obj) {
      result[field] = obj[field]
    }
  }
  return result
}

function filterFields(data: unknown, fields: string[]): unknown {
  if (Array.isArray(data)) {
    return data.map(item => filterFields(item, fields))
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>
    const keys = Object.keys(obj)
    const hasMatchingKey = fields.some(f => f in obj)
    if (hasMatchingKey) {
      return pickFields(obj, fields)
    }
    const result: Record<string, unknown> = {}
    for (const key of keys) {
      const value = obj[key]
      result[key] = Array.isArray(value)
        ? value.map(item =>
            item && typeof item === "object"
              ? pickFields(item as Record<string, unknown>, fields)
              : item,
          )
        : value
    }
    return result
  }
  return data
}

function truncateOutput(text: string, maxLines: number): string {
  const lines = text.split("\n")
  if (lines.length <= maxLines) return text
  const omitted = lines.length - maxLines
  return (
    lines.slice(0, maxLines).join("\n") +
    `\n... (${omitted} more line${omitted === 1 ? "" : "s"})`
  )
}
