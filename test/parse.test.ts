import { describe, expect, it } from "vitest"
import {
  parseFloatOption,
  parseIntOption,
  parseTraitsOption,
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
})

describe("parseFloatOption", () => {
  it("parses valid floats", () => {
    expect(parseFloatOption("0.5", "--slippage")).toBe(0.5)
    expect(parseFloatOption("1", "--slippage")).toBe(1)
    expect(parseFloatOption("0.01", "--slippage")).toBe(0.01)
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
