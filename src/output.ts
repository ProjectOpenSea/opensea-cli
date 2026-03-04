import { formatToon } from "./toon.js"

export type OutputFormat = "json" | "table" | "toon"

export interface OutputFilterOptions {
  fields?: string[]
  maxItems?: number
}

export function filterData(
  data: unknown,
  options: OutputFilterOptions,
): unknown {
  let result = data

  if (options.maxItems !== undefined && Array.isArray(result)) {
    result = result.slice(0, options.maxItems)
  } else if (
    options.maxItems !== undefined &&
    result &&
    typeof result === "object"
  ) {
    const obj = { ...(result as Record<string, unknown>) }
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        obj[key] = value.slice(0, options.maxItems)
      }
    }
    result = obj
  }

  if (options.fields && options.fields.length > 0) {
    result = pickFields(result, options.fields)
  }

  return result
}

function pickFields(data: unknown, fields: string[]): unknown {
  if (Array.isArray(data)) {
    return data.map(item => pickFields(item, fields))
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>
    const picked: Record<string, unknown> = {}
    for (const field of fields) {
      if (field in obj) {
        picked[field] = obj[field]
      }
    }
    return picked
  }
  return data
}

export function formatOutput(
  data: unknown,
  format: OutputFormat,
  filters?: OutputFilterOptions,
): string {
  const filtered = filters ? filterData(data, filters) : data
  if (format === "table") {
    return formatTable(filtered)
  }
  if (format === "toon") {
    return formatToon(filtered)
  }
  return JSON.stringify(filtered, null, 2)
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
