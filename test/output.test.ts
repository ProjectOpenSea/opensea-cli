import { describe, expect, it } from "vitest"
import { formatOutput } from "../src/output.js"

describe("formatOutput", () => {
  describe("json format", () => {
    it("formats data as pretty JSON", () => {
      const data = { name: "test", value: 42 }
      expect(formatOutput(data, "json")).toBe(JSON.stringify(data, null, 2))
    })

    it("formats arrays as pretty JSON", () => {
      const data = [{ a: 1 }, { a: 2 }]
      expect(formatOutput(data, "json")).toBe(JSON.stringify(data, null, 2))
    })
  })

  describe("table format", () => {
    it("formats an array as a table with header and rows", () => {
      const data = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ]
      const result = formatOutput(data, "table")
      const lines = result.split("\n")
      expect(lines).toHaveLength(4)
      expect(lines[0]).toContain("name")
      expect(lines[0]).toContain("age")
      expect(lines[1]).toMatch(/^-/)
      expect(lines[2]).toContain("Alice")
      expect(lines[3]).toContain("Bob")
    })

    it("returns (empty) for empty array", () => {
      expect(formatOutput([], "table")).toBe("(empty)")
    })

    it("returns (empty) for empty object", () => {
      expect(formatOutput({}, "table")).toBe("(empty)")
    })

    it("formats an object as key-value pairs", () => {
      const data = { name: "test", count: 5 }
      const result = formatOutput(data, "table")
      expect(result).toContain("name")
      expect(result).toContain("test")
      expect(result).toContain("count")
      expect(result).toContain("5")
    })

    it("formats nested objects in key-value mode as JSON strings", () => {
      const data = { name: "test", meta: { foo: "bar" } }
      const result = formatOutput(data, "table")
      expect(result).toContain('{"foo":"bar"}')
    })

    it("handles null values in table rows", () => {
      const data = [{ name: "Alice", value: null }]
      const result = formatOutput(data, "table")
      expect(result).toContain("Alice")
    })

    it("handles null values in key-value mode", () => {
      const data = { key: null }
      const result = formatOutput(data, "table")
      expect(result).toContain("key")
    })

    it("formats primitive values as strings", () => {
      expect(formatOutput("hello", "table")).toBe("hello")
      expect(formatOutput(42, "table")).toBe("42")
    })
  })
})
