export function formatOutput(data: unknown, format: "json" | "table"): string {
  if (format === "table") {
    return formatTable(data)
  }
  return JSON.stringify(data, null, 2)
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
