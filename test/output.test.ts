import { afterEach, describe, expect, it } from "vitest"
import { formatOutput, setOutputOptions } from "../src/output.js"

describe("formatOutput", () => {
  afterEach(() => {
    setOutputOptions({})
  })

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

  describe("--fields option", () => {
    it("filters top-level fields on a plain object", () => {
      setOutputOptions({ fields: ["name", "collection"] })
      const data = {
        name: "Cool NFT",
        collection: "cool-cats",
        description: "A cool cat",
        image_url: "https://example.com/img.png",
      }
      const result = JSON.parse(formatOutput(data, "json"))
      expect(result).toEqual({ name: "Cool NFT", collection: "cool-cats" })
    })

    it("filters fields on items inside wrapped arrays", () => {
      setOutputOptions({ fields: ["identifier", "name"] })
      const data = {
        nfts: [
          {
            identifier: "1",
            name: "NFT #1",
            image_url: "https://example.com/1.png",
          },
          {
            identifier: "2",
            name: "NFT #2",
            image_url: "https://example.com/2.png",
          },
        ],
        next: "cursor123",
      }
      const result = JSON.parse(formatOutput(data, "json"))
      expect(result).toEqual({
        nfts: [
          { identifier: "1", name: "NFT #1" },
          { identifier: "2", name: "NFT #2" },
        ],
        next: "cursor123",
      })
    })

    it("filters fields on a bare array", () => {
      setOutputOptions({ fields: ["name"] })
      const data = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ]
      const result = JSON.parse(formatOutput(data, "json"))
      expect(result).toEqual([{ name: "Alice" }, { name: "Bob" }])
    })

    it("ignores fields that do not exist", () => {
      setOutputOptions({ fields: ["name", "nonexistent"] })
      const data = { name: "test", value: 42 }
      const result = JSON.parse(formatOutput(data, "json"))
      expect(result).toEqual({ name: "test" })
    })

    it("filters top-level fields on objects with array properties", () => {
      setOutputOptions({ fields: ["name", "collection"] })
      const data = {
        name: "Cool Cats",
        collection: "cool-cats",
        description: "A cool collection",
        contracts: [{ address: "0x1", chain: "ethereum" }],
        editors: ["alice"],
        fees: [{ fee: 250, recipient: "0x2", required: true }],
      }
      const result = JSON.parse(formatOutput(data, "json"))
      expect(result).toEqual({
        name: "Cool Cats",
        collection: "cool-cats",
      })
    })

    it("returns primitives unchanged", () => {
      setOutputOptions({ fields: ["name"] })
      expect(formatOutput("hello", "json")).toBe('"hello"')
    })

    it("works with table format", () => {
      setOutputOptions({ fields: ["name"] })
      const data = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ]
      const result = formatOutput(data, "table")
      expect(result).toContain("name")
      expect(result).not.toContain("age")
    })
  })

  describe("--max-lines option", () => {
    it("truncates output exceeding max lines", () => {
      setOutputOptions({ maxLines: 3 })
      const data = { a: 1, b: 2, c: 3, d: 4, e: 5 }
      const result = formatOutput(data, "json")
      const lines = result.split("\n")
      expect(lines).toHaveLength(4)
      expect(lines[3]).toBe("... (4 more lines)")
    })

    it("does not truncate when output fits within max lines", () => {
      setOutputOptions({ maxLines: 100 })
      const data = { a: 1 }
      const result = formatOutput(data, "json")
      expect(result).not.toContain("...")
      expect(result).toBe(JSON.stringify(data, null, 2))
    })

    it("uses singular 'line' for exactly one omitted line", () => {
      setOutputOptions({ maxLines: 2 })
      const data = { a: 1 }
      const result = formatOutput(data, "json")
      const lines = result.split("\n")
      expect(lines[lines.length - 1]).toBe("... (1 more line)")
    })

    it("works with table format", () => {
      setOutputOptions({ maxLines: 2 })
      const data = [{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }]
      const result = formatOutput(data, "table")
      const lines = result.split("\n")
      expect(lines).toHaveLength(3)
      expect(lines[2]).toMatch(/\.\.\. \(\d+ more lines?\)/)
    })

    it("handles max-lines 0 by truncating all lines", () => {
      setOutputOptions({ maxLines: 0 })
      const data = { a: 1 }
      const result = formatOutput(data, "json")
      expect(result).toContain("... (3 more lines)")
    })
  })

  describe("--fields and --max-lines combined", () => {
    it("applies field filtering then truncation", () => {
      setOutputOptions({ fields: ["name"], maxLines: 3 })
      const data = {
        nfts: [
          { name: "A", id: 1 },
          { name: "B", id: 2 },
          { name: "C", id: 3 },
          { name: "D", id: 4 },
        ],
        next: "cursor",
      }
      const result = formatOutput(data, "json")
      expect(result).not.toContain("id")
      const lines = result.split("\n")
      expect(lines).toHaveLength(4)
      expect(lines[3]).toMatch(/\.\.\. \(\d+ more lines?\)/)
    })
  })
})
