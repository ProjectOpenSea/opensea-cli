import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  parseFloatOption,
  parseIntOption,
  parseTraitsOption,
  readJsonBodyOption,
} from "../src/parse.js"

describe("parseIntOption", () => {
  it("parses valid integers", () => {
    expect(parseIntOption("42", "--limit")).toBe(42)
    expect(parseIntOption("0", "--limit")).toBe(0)
    expect(parseIntOption("-1", "--offset")).toBe(-1)
  })

  it("throws on non-numeric strings", () => {
    expect(() => parseIntOption("abc", "--limit")).toThrow(
      'Invalid value for --limit: "abc" is not an integer',
    )
  })

  it("throws on empty string", () => {
    expect(() => parseIntOption("", "--limit")).toThrow(
      'Invalid value for --limit: "" is not an integer',
    )
  })

  it.each([
    "10foo",
    "1.9",
    "1e2",
    "0x10",
  ])('throws when "%s" is not entirely an integer', value => {
    expect(() => parseIntOption(value, "--limit")).toThrow(
      `Invalid value for --limit: "${value}" is not an integer`,
    )
  })
})

describe("parseFloatOption", () => {
  it("parses valid floats", () => {
    expect(parseFloatOption("0.5", "--slippage")).toBe(0.5)
    expect(parseFloatOption("1", "--slippage")).toBe(1)
    expect(parseFloatOption("0.01", "--slippage")).toBe(0.01)
    expect(parseFloatOption(".5", "--slippage")).toBe(0.5)
    expect(parseFloatOption("1.", "--slippage")).toBe(1)
    expect(parseFloatOption("1e-2", "--slippage")).toBe(0.01)
  })

  it("throws on non-numeric strings", () => {
    expect(() => parseFloatOption("abc", "--slippage")).toThrow(
      'Invalid value for --slippage: "abc" is not a number',
    )
  })

  it("throws on empty string", () => {
    expect(() => parseFloatOption("", "--slippage")).toThrow(
      'Invalid value for --slippage: "" is not a number',
    )
  })

  it.each([
    "0.5oops",
    "0.01%",
    "Infinity",
    "1e309",
  ])('throws when "%s" is not an entirely finite number', value => {
    expect(() => parseFloatOption(value, "--slippage")).toThrow(
      `Invalid value for --slippage: "${value}" is not a number`,
    )
  })
})

describe("readJsonBodyOption", () => {
  let dir: string

  beforeEach(() => {
    // mkdtemp, not a Date.now() suffix: two concurrent runs must not collide.
    dir = mkdtempSync(join(tmpdir(), "opensea-cli-parse-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("reads and parses a JSON file", () => {
    const path = join(dir, "body.json")
    writeFileSync(path, JSON.stringify({ key: "value", num: 100 }))

    expect(readJsonBodyOption(path, "--body")).toEqual({
      key: "value",
      num: 100,
    })
  })

  it("names the option and the path when the file cannot be read", () => {
    const path = join(dir, "absent.json")
    expect(() => readJsonBodyOption(path, "--body")).toThrow(
      `Could not read --body from '${path}'`,
    )
  })

  it("names the option and the path when the file is not valid JSON", () => {
    const path = join(dir, "invalid.json")
    writeFileSync(path, "{ not json }")

    expect(() => readJsonBodyOption(path, "--body")).toThrow(
      `Could not parse --body '${path}' as JSON`,
    )
  })
})

describe("parseTraitsOption", () => {
  it("returns the normalized JSON string for a valid filter array", () => {
    const input = '[{"traitType":"Background","value":"Red"}]'
    expect(parseTraitsOption(input)).toBe(input)
  })

  it("re-stringifies to normalize whitespace", () => {
    const input = '[ { "traitType": "Background", "value": "Red" } ]'
    expect(parseTraitsOption(input)).toBe(
      '[{"traitType":"Background","value":"Red"}]',
    )
  })

  it("accepts multiple trait filters", () => {
    const input =
      '[{"traitType":"Background","value":"Red"},{"traitType":"Eyes","value":"Laser"}]'
    expect(parseTraitsOption(input)).toBe(input)
  })

  it("throws on malformed JSON", () => {
    expect(() => parseTraitsOption("not-json")).toThrow(
      "Invalid value for --traits: not valid JSON",
    )
  })

  it("throws when input is not an array", () => {
    expect(() =>
      parseTraitsOption('{"traitType":"Background","value":"Red"}'),
    ).toThrow("--traits must be a non-empty JSON array")
  })

  it("throws on an empty array", () => {
    expect(() => parseTraitsOption("[]")).toThrow(
      "--traits must be a non-empty JSON array",
    )
  })

  it("throws when an item is missing traitType", () => {
    expect(() => parseTraitsOption('[{"value":"Red"}]')).toThrow(
      "--traits[0] must be { traitType: string, value: string }",
    )
  })

  it("throws when an item has wrong types", () => {
    expect(() =>
      parseTraitsOption('[{"traitType":"Background","value":42}]'),
    ).toThrow("--traits[0] must be { traitType: string, value: string }")
  })
})
