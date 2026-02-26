const INDENT = "  "

const NUMERIC_RE = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i
const LEADING_ZERO_RE = /^0\d+$/
const UNQUOTED_KEY_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/

function escapeString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
}

function needsQuoting(value: string, delimiter: string): boolean {
  if (value === "") return true
  if (value !== value.trim()) return true
  if (value === "true" || value === "false" || value === "null") return true
  if (NUMERIC_RE.test(value) || LEADING_ZERO_RE.test(value)) return true
  if (/[:"\\[\]{}]/.test(value)) return true
  if (/[\n\r\t]/.test(value)) return true
  if (value.includes(delimiter)) return true
  if (value.startsWith("-")) return true
  return false
}

function encodeKey(key: string): string {
  if (UNQUOTED_KEY_RE.test(key)) return key
  return `"${escapeString(key)}"`
}

function encodePrimitive(value: unknown, delimiter: string): string {
  if (value === null) return "null"
  if (value === undefined) return "null"
  if (typeof value === "boolean") return String(value)
  if (typeof value === "number") return String(value)
  if (typeof value === "string") {
    if (needsQuoting(value, delimiter)) {
      return `"${escapeString(value)}"`
    }
    return value
  }
  return `"${escapeString(String(value))}"`
}

function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  )
}

function isTabular(arr: unknown[]): boolean {
  if (arr.length === 0) return false
  const first = arr[0]
  if (first === null || typeof first !== "object" || Array.isArray(first))
    return false
  const keys = Object.keys(first as Record<string, unknown>).sort()
  for (const item of arr) {
    if (item === null || typeof item !== "object" || Array.isArray(item))
      return false
    const itemKeys = Object.keys(item as Record<string, unknown>).sort()
    if (itemKeys.length !== keys.length) return false
    for (let i = 0; i < keys.length; i++) {
      if (itemKeys[i] !== keys[i]) return false
    }
    for (const k of keys) {
      if (!isPrimitive((item as Record<string, unknown>)[k])) return false
    }
  }
  return true
}

function isPrimitiveArray(arr: unknown[]): boolean {
  return arr.every(isPrimitive)
}

function encodeValue(value: unknown, depth: number, delimiter: string): string {
  if (isPrimitive(value)) {
    return encodePrimitive(value, delimiter)
  }

  if (Array.isArray(value)) {
    return encodeArray(value, depth, delimiter)
  }

  if (typeof value === "object" && value !== null) {
    return encodeObject(value as Record<string, unknown>, depth, delimiter)
  }

  return encodePrimitive(value, delimiter)
}

function encodeObject(
  obj: Record<string, unknown>,
  depth: number,
  delimiter: string,
): string {
  const entries = Object.entries(obj)
  if (entries.length === 0) return ""

  const lines: string[] = []
  const prefix = INDENT.repeat(depth)

  for (const [key, value] of entries) {
    const encodedKey = encodeKey(key)

    if (isPrimitive(value)) {
      lines.push(`${prefix}${encodedKey}: ${encodePrimitive(value, delimiter)}`)
    } else if (Array.isArray(value)) {
      lines.push(encodeArrayField(encodedKey, value, depth, delimiter))
    } else if (typeof value === "object" && value !== null) {
      const nested = value as Record<string, unknown>
      if (Object.keys(nested).length === 0) {
        lines.push(`${prefix}${encodedKey}:`)
      } else {
        lines.push(`${prefix}${encodedKey}:`)
        lines.push(encodeObject(nested, depth + 1, delimiter))
      }
    }
  }

  return lines.join("\n")
}

function encodeArrayField(
  encodedKey: string,
  arr: unknown[],
  depth: number,
  delimiter: string,
): string {
  const prefix = INDENT.repeat(depth)

  if (arr.length === 0) {
    return `${prefix}${encodedKey}[0]:`
  }

  if (isPrimitiveArray(arr)) {
    const values = arr.map(v => encodePrimitive(v, delimiter)).join(delimiter)
    return `${prefix}${encodedKey}[${arr.length}]: ${values}`
  }

  if (isTabular(arr)) {
    const firstObj = arr[0] as Record<string, unknown>
    const fields = Object.keys(firstObj)
    const fieldHeader = fields.map(encodeKey).join(delimiter)
    const lines: string[] = []
    lines.push(`${prefix}${encodedKey}[${arr.length}]{${fieldHeader}}:`)
    const rowPrefix = INDENT.repeat(depth + 1)
    for (const item of arr) {
      const obj = item as Record<string, unknown>
      const row = fields
        .map(f => encodePrimitive(obj[f], delimiter))
        .join(delimiter)
      lines.push(`${rowPrefix}${row}`)
    }
    return lines.join("\n")
  }

  return encodeExpandedList(encodedKey, arr, depth, delimiter)
}

function encodeExpandedList(
  encodedKey: string,
  arr: unknown[],
  depth: number,
  delimiter: string,
): string {
  const prefix = INDENT.repeat(depth)
  const itemPrefix = INDENT.repeat(depth + 1)
  const lines: string[] = []
  lines.push(`${prefix}${encodedKey}[${arr.length}]:`)

  for (const item of arr) {
    if (isPrimitive(item)) {
      lines.push(`${itemPrefix}- ${encodePrimitive(item, delimiter)}`)
    } else if (Array.isArray(item)) {
      if (isPrimitiveArray(item)) {
        const values = item
          .map(v => encodePrimitive(v, delimiter))
          .join(delimiter)
        lines.push(`${itemPrefix}- [${item.length}]: ${values}`)
      } else {
        lines.push(`${itemPrefix}- [${item.length}]:`)
        for (const inner of item) {
          lines.push(encodeValue(inner, depth + 2, delimiter))
        }
      }
    } else if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>
      const entries = Object.entries(obj)
      if (entries.length === 0) {
        lines.push(`${itemPrefix}-`)
      } else {
        const [firstKey, firstValue] = entries[0]
        const ek = encodeKey(firstKey)

        if (Array.isArray(firstValue)) {
          const arrayLine = encodeArrayField(ek, firstValue, 0, delimiter)
          lines.push(`${itemPrefix}- ${arrayLine.trimStart()}`)
        } else if (isPrimitive(firstValue)) {
          lines.push(
            `${itemPrefix}- ${ek}: ${encodePrimitive(firstValue, delimiter)}`,
          )
        } else {
          lines.push(`${itemPrefix}- ${ek}:`)
          lines.push(
            encodeObject(
              firstValue as Record<string, unknown>,
              depth + 2,
              delimiter,
            ),
          )
        }

        for (let i = 1; i < entries.length; i++) {
          const [k, v] = entries[i]
          const encodedK = encodeKey(k)
          if (isPrimitive(v)) {
            lines.push(
              `${INDENT.repeat(depth + 2)}${encodedK}: ${encodePrimitive(v, delimiter)}`,
            )
          } else if (Array.isArray(v)) {
            lines.push(encodeArrayField(encodedK, v, depth + 2, delimiter))
          } else if (typeof v === "object" && v !== null) {
            lines.push(`${INDENT.repeat(depth + 2)}${encodedK}:`)
            lines.push(
              encodeObject(v as Record<string, unknown>, depth + 3, delimiter),
            )
          }
        }
      }
    }
  }

  return lines.join("\n")
}

function encodeArray(arr: unknown[], depth: number, delimiter: string): string {
  const prefix = INDENT.repeat(depth)

  if (arr.length === 0) {
    return `${prefix}[0]:`
  }

  if (isPrimitiveArray(arr)) {
    const values = arr.map(v => encodePrimitive(v, delimiter)).join(delimiter)
    return `${prefix}[${arr.length}]: ${values}`
  }

  if (isTabular(arr)) {
    const firstObj = arr[0] as Record<string, unknown>
    const fields = Object.keys(firstObj)
    const fieldHeader = fields.map(encodeKey).join(delimiter)
    const lines: string[] = []
    lines.push(`${prefix}[${arr.length}]{${fieldHeader}}:`)
    const rowPrefix = INDENT.repeat(depth + 1)
    for (const item of arr) {
      const obj = item as Record<string, unknown>
      const row = fields
        .map(f => encodePrimitive(obj[f], delimiter))
        .join(delimiter)
      lines.push(`${rowPrefix}${row}`)
    }
    return lines.join("\n")
  }

  const lines: string[] = []
  lines.push(`${prefix}[${arr.length}]:`)
  const itemPrefix = INDENT.repeat(depth + 1)
  for (const item of arr) {
    if (isPrimitive(item)) {
      lines.push(`${itemPrefix}- ${encodePrimitive(item, delimiter)}`)
    } else if (Array.isArray(item)) {
      if (isPrimitiveArray(item)) {
        const values = item
          .map(v => encodePrimitive(v, delimiter))
          .join(delimiter)
        lines.push(`${itemPrefix}- [${item.length}]: ${values}`)
      } else {
        lines.push(`${itemPrefix}- [${item.length}]:`)
      }
    } else if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>
      const entries = Object.entries(obj)
      if (entries.length > 0) {
        const [firstKey, firstValue] = entries[0]
        const ek = encodeKey(firstKey)
        if (isPrimitive(firstValue)) {
          lines.push(
            `${itemPrefix}- ${ek}: ${encodePrimitive(firstValue, delimiter)}`,
          )
        } else {
          lines.push(`${itemPrefix}- ${ek}:`)
          lines.push(encodeValue(firstValue, depth + 2, delimiter))
        }
        for (let i = 1; i < entries.length; i++) {
          const [k, v] = entries[i]
          const encodedK = encodeKey(k)
          if (isPrimitive(v)) {
            lines.push(
              `${INDENT.repeat(depth + 2)}${encodedK}: ${encodePrimitive(v, delimiter)}`,
            )
          } else if (Array.isArray(v)) {
            lines.push(encodeArrayField(encodedK, v, depth + 2, delimiter))
          } else if (typeof v === "object" && v !== null) {
            lines.push(`${INDENT.repeat(depth + 2)}${encodedK}:`)
            lines.push(
              encodeObject(v as Record<string, unknown>, depth + 3, delimiter),
            )
          }
        }
      }
    }
  }

  return lines.join("\n")
}

export function formatToon(data: unknown): string {
  if (isPrimitive(data)) {
    return encodePrimitive(data, ",")
  }

  if (Array.isArray(data)) {
    return encodeArray(data, 0, ",")
  }

  if (typeof data === "object" && data !== null) {
    return encodeObject(data as Record<string, unknown>, 0, ",")
  }

  return String(data)
}
