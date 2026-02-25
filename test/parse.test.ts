import { describe, expect, it } from "vitest"
import { parseFloatOption, parseIntOption } from "../src/parse.js"

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
