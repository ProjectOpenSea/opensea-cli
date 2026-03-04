import { describe, expect, it } from "vitest"
import { filterData, formatOutput } from "../src/output.js"

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

  describe("filters", () => {
    it("applies maxItems to top-level arrays", () => {
      const data = [{ a: 1 }, { a: 2 }, { a: 3 }]
      const result = formatOutput(data, "json", { maxItems: 2 })
      expect(JSON.parse(result)).toEqual([{ a: 1 }, { a: 2 }])
    })

    it("applies maxItems to nested arrays in objects", () => {
      const data = { items: [1, 2, 3, 4], name: "test" }
      const result = formatOutput(data, "json", { maxItems: 2 })
      const parsed = JSON.parse(result)
      expect(parsed.items).toEqual([1, 2])
      expect(parsed.name).toBe("test")
    })

    it("applies fields filter to objects", () => {
      const data = { name: "test", age: 30, city: "NYC" }
      const result = formatOutput(data, "json", {
        fields: ["name", "city"],
      })
      expect(JSON.parse(result)).toEqual({ name: "test", city: "NYC" })
    })

    it("applies fields filter to array of objects", () => {
      const data = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ]
      const result = formatOutput(data, "json", {
        fields: ["name"],
      })
      expect(JSON.parse(result)).toEqual([{ name: "Alice" }, { name: "Bob" }])
    })

    it("applies both maxItems and fields together", () => {
      const data = [
        { name: "A", age: 1 },
        { name: "B", age: 2 },
        { name: "C", age: 3 },
      ]
      const result = formatOutput(data, "json", {
        maxItems: 2,
        fields: ["name"],
      })
      expect(JSON.parse(result)).toEqual([{ name: "A" }, { name: "B" }])
    })

    it("works with table format", () => {
      const data = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ]
      const result = formatOutput(data, "table", {
        fields: ["name"],
      })
      expect(result).toContain("name")
      expect(result).not.toContain("age")
    })

    it("passes data through when no filters specified", () => {
      const data = { a: 1, b: 2 }
      const result = formatOutput(data, "json")
      expect(JSON.parse(result)).toEqual(data)
    })
  })
})

describe("filterData", () => {
  it("returns primitives unchanged", () => {
    expect(filterData("hello", { maxItems: 2 })).toBe("hello")
    expect(filterData(42, { fields: ["a"] })).toBe(42)
  })

  it("ignores missing fields", () => {
    const data = { name: "test", age: 30 }
    expect(filterData(data, { fields: ["name", "missing"] })).toEqual({
      name: "test",
    })
  })

  it("returns empty object when no fields match", () => {
    const data = { name: "test" }
    expect(filterData(data, { fields: ["missing"] })).toEqual({})
  })
})
