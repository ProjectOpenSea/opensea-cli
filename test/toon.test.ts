import { describe, expect, it } from "vitest"
import { formatToon } from "../src/toon.js"

describe("formatToon", () => {
  describe("primitives", () => {
    it("encodes null", () => {
      expect(formatToon(null)).toBe("null")
    })

    it("encodes booleans", () => {
      expect(formatToon(true)).toBe("true")
      expect(formatToon(false)).toBe("false")
    })

    it("encodes numbers", () => {
      expect(formatToon(42)).toBe("42")
      expect(formatToon(3.14)).toBe("3.14")
      expect(formatToon(0)).toBe("0")
      expect(formatToon(-1)).toBe("-1")
    })

    it("encodes simple strings unquoted", () => {
      expect(formatToon("hello")).toBe("hello")
    })

    it("quotes strings that look like booleans", () => {
      expect(formatToon("true")).toBe('"true"')
      expect(formatToon("false")).toBe('"false"')
    })

    it("quotes strings that look like null", () => {
      expect(formatToon("null")).toBe('"null"')
    })

    it("quotes strings that look like numbers", () => {
      expect(formatToon("42")).toBe('"42"')
      expect(formatToon("3.14")).toBe('"3.14"')
    })

    it("quotes empty strings", () => {
      expect(formatToon("")).toBe('""')
    })

    it("quotes strings with special characters", () => {
      expect(formatToon("hello:world")).toBe('"hello:world"')
      expect(formatToon('say "hi"')).toBe('"say \\"hi\\""')
      expect(formatToon("line\nnewline")).toBe('"line\\nnewline"')
    })

    it("quotes strings starting with hyphen", () => {
      expect(formatToon("-value")).toBe('"-value"')
      expect(formatToon("-")).toBe('"-"')
    })

    it("quotes strings with leading/trailing whitespace", () => {
      expect(formatToon(" hello")).toBe('" hello"')
      expect(formatToon("hello ")).toBe('"hello "')
    })

    it("does not quote strings with internal spaces", () => {
      expect(formatToon("hello world")).toBe("hello world")
    })
  })

  describe("objects", () => {
    it("encodes a flat object", () => {
      const result = formatToon({ name: "Alice", age: 30 })
      expect(result).toBe("name: Alice\nage: 30")
    })

    it("encodes nested objects", () => {
      const result = formatToon({
        user: { name: "Alice", role: "admin" },
      })
      expect(result).toBe("user:\n  name: Alice\n  role: admin")
    })

    it("encodes an empty object as empty string", () => {
      expect(formatToon({})).toBe("")
    })

    it("quotes keys that need quoting", () => {
      const result = formatToon({ "my-key": "value" })
      expect(result).toBe('"my-key": value')
    })
  })

  describe("primitive arrays", () => {
    it("encodes an inline primitive array at root", () => {
      const result = formatToon([1, 2, 3])
      expect(result).toBe("[3]: 1,2,3")
    })

    it("encodes a string array at root", () => {
      const result = formatToon(["ana", "luis", "sam"])
      expect(result).toBe("[3]: ana,luis,sam")
    })

    it("encodes empty array", () => {
      expect(formatToon([])).toBe("[0]:")
    })

    it("encodes array with mixed primitives", () => {
      const result = formatToon([1, "hello", true, null])
      expect(result).toBe("[4]: 1,hello,true,null")
    })

    it("quotes values containing commas", () => {
      const result = formatToon(["a,b", "c"])
      expect(result).toBe('[2]: "a,b",c')
    })

    it("encodes primitive array as object field", () => {
      const result = formatToon({ friends: ["ana", "luis", "sam"] })
      expect(result).toBe("friends[3]: ana,luis,sam")
    })
  })

  describe("tabular arrays (arrays of uniform objects)", () => {
    it("encodes a tabular array at root", () => {
      const result = formatToon([
        { id: 1, name: "Alice", role: "admin" },
        { id: 2, name: "Bob", role: "user" },
      ])
      expect(result).toBe("[2]{id,name,role}:\n  1,Alice,admin\n  2,Bob,user")
    })

    it("encodes a tabular array as object field", () => {
      const result = formatToon({
        users: [
          { id: 1, name: "Alice", role: "admin" },
          { id: 2, name: "Bob", role: "user" },
        ],
      })
      expect(result).toBe(
        "users[2]{id,name,role}:\n  1,Alice,admin\n  2,Bob,user",
      )
    })

    it("quotes tabular values that contain commas", () => {
      const result = formatToon([
        { name: "Smith, John", age: 30 },
        { name: "Doe, Jane", age: 25 },
      ])
      expect(result).toBe(
        '[2]{name,age}:\n  "Smith, John",30\n  "Doe, Jane",25',
      )
    })

    it("handles null values in tabular rows", () => {
      const result = formatToon([
        { id: 1, value: null },
        { id: 2, value: "test" },
      ])
      expect(result).toBe("[2]{id,value}:\n  1,null\n  2,test")
    })
  })

  describe("mixed/non-uniform arrays", () => {
    it("encodes an array of objects with nested values as expanded list", () => {
      const result = formatToon([{ name: "Alice", meta: { role: "admin" } }])
      expect(result).toContain("[1]:")
      expect(result).toContain("- name: Alice")
      expect(result).toContain("meta:")
      expect(result).toContain("role: admin")
    })
  })

  describe("complex nested structures", () => {
    it("encodes the hikes example from the spec", () => {
      const data = {
        context: {
          task: "Our favorite hikes together",
          location: "Boulder",
          season: "spring_2025",
        },
        friends: ["ana", "luis", "sam"],
        hikes: [
          {
            id: 1,
            name: "Blue Lake Trail",
            distanceKm: 7.5,
            elevationGain: 320,
            companion: "ana",
            wasSunny: true,
          },
          {
            id: 2,
            name: "Ridge Overlook",
            distanceKm: 9.2,
            elevationGain: 540,
            companion: "luis",
            wasSunny: false,
          },
          {
            id: 3,
            name: "Wildflower Loop",
            distanceKm: 5.1,
            elevationGain: 180,
            companion: "sam",
            wasSunny: true,
          },
        ],
      }

      const result = formatToon(data)
      expect(result).toContain("context:")
      expect(result).toContain("  task: Our favorite hikes together")
      expect(result).toContain("  location: Boulder")
      expect(result).toContain("  season: spring_2025")
      expect(result).toContain("friends[3]: ana,luis,sam")
      expect(result).toContain(
        "hikes[3]{id,name,distanceKm,elevationGain,companion,wasSunny}:",
      )
      expect(result).toContain("  1,Blue Lake Trail,7.5,320,ana,true")
      expect(result).toContain("  2,Ridge Overlook,9.2,540,luis,false")
      expect(result).toContain("  3,Wildflower Loop,5.1,180,sam,true")
    })

    it("encodes deeply nested objects", () => {
      const data = {
        a: { b: { c: { d: "deep" } } },
      }
      const result = formatToon(data)
      expect(result).toBe("a:\n  b:\n    c:\n      d: deep")
    })
  })

  describe("formatOutput integration", () => {
    it("is used by formatOutput with toon format", async () => {
      const { formatOutput } = await import("../src/output.js")
      const data = { name: "test", value: 42 }
      const result = formatOutput(data, "toon")
      expect(result).toBe("name: test\nvalue: 42")
    })
  })
})
