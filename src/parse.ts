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
