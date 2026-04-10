import { describe, expect, it } from "vitest"
import { p1363ToDer } from "../../src/wallet/turnkey.js"

/**
 * Test vectors for P1363→DER signature conversion.
 *
 * P1363 format: raw r||s (64 bytes for P-256, 32 bytes each)
 * DER format: ASN.1 SEQUENCE { INTEGER r, INTEGER s }
 *
 * DER encoding rules for INTEGERs:
 *   - Strip leading zero bytes (except keep at least one byte)
 *   - If high bit of first byte is set, prepend 0x00 (sign padding)
 *   - Tag 0x02, then length, then value bytes
 *
 * SEQUENCE: tag 0x30, then total length, then concatenated INTEGERs
 */
describe("p1363ToDer", () => {
  it("converts a basic signature with no padding needed", () => {
    // r and s both start with a byte < 0x80, no leading zeros
    const r = new Uint8Array(32)
    const s = new Uint8Array(32)
    r[0] = 0x01
    r[31] = 0xaa
    s[0] = 0x02
    s[31] = 0xbb

    const p1363 = new Uint8Array(64)
    p1363.set(r, 0)
    p1363.set(s, 32)

    const der = p1363ToDer(p1363)

    // r: strip leading zeros → [0x01, 0x00...0x00, 0xaa] (32 bytes, starts < 0x80 → no pad)
    // s: strip leading zeros → [0x02, 0x00...0x00, 0xbb] (32 bytes, starts < 0x80 → no pad)
    expect(der[0]).toBe(0x30) // SEQUENCE tag
    expect(der[2]).toBe(0x02) // first INTEGER tag
    // Total should be valid DER
    const seqLen = der[1]
    expect(der.length).toBe(2 + seqLen)
  })

  it("adds sign padding when high bit is set", () => {
    // r starts with 0xff (high bit set → needs 0x00 pad)
    // s starts with 0x7f (high bit not set → no pad)
    const p1363 = new Uint8Array(64)
    p1363[0] = 0xff
    for (let i = 1; i < 32; i++) p1363[i] = 0x01
    p1363[32] = 0x7f
    for (let i = 33; i < 64; i++) p1363[i] = 0x02

    const der = p1363ToDer(p1363)

    // Parse the DER output
    expect(der[0]).toBe(0x30) // SEQUENCE
    const seqLen = der[1]

    // First INTEGER (r with padding)
    expect(der[2]).toBe(0x02) // INTEGER tag
    const rLen = der[3]
    expect(rLen).toBe(33) // 32 bytes + 1 pad byte
    expect(der[4]).toBe(0x00) // pad byte
    expect(der[5]).toBe(0xff) // first real byte

    // Second INTEGER (s without padding)
    const sOffset = 4 + rLen
    expect(der[sOffset]).toBe(0x02) // INTEGER tag
    const sLen = der[sOffset + 1]
    expect(sLen).toBe(32) // no padding needed
    expect(der[sOffset + 2]).toBe(0x7f)

    expect(der.length).toBe(2 + seqLen)
  })

  it("strips leading zeros from r and s", () => {
    // r has 10 leading zero bytes, then 0x05, then remaining
    // s has 5 leading zero bytes, then 0x90 (high bit set → needs pad)
    const p1363 = new Uint8Array(64)
    // r: [0x00 x10, 0x05, 0x00 x21]
    p1363[10] = 0x05
    // s: [0x00 x5, 0x90, 0x00 x26] starting at offset 32
    p1363[32 + 5] = 0x90

    const der = p1363ToDer(p1363)

    expect(der[0]).toBe(0x30) // SEQUENCE

    // First INTEGER (r): stripped to [0x05, 0x00...] = 22 bytes, no pad (0x05 < 0x80)
    expect(der[2]).toBe(0x02)
    const rLen = der[3]
    expect(rLen).toBe(22) // 32 - 10 leading zeros = 22
    expect(der[4]).toBe(0x05)

    // Second INTEGER (s): stripped to [0x90, 0x00...] = 27 bytes, + pad (0x90 >= 0x80)
    const sOffset = 4 + rLen
    expect(der[sOffset]).toBe(0x02)
    const sLen = der[sOffset + 1]
    expect(sLen).toBe(28) // 27 bytes + 1 pad
    expect(der[sOffset + 2]).toBe(0x00) // pad
    expect(der[sOffset + 3]).toBe(0x90)
  })

  it("handles all-zero r (keeps one byte)", () => {
    // r is all zeros → should keep single 0x00 byte (no stripping to empty)
    // s is 0x01 followed by zeros
    const p1363 = new Uint8Array(64)
    p1363[32] = 0x01

    const der = p1363ToDer(p1363)

    expect(der[0]).toBe(0x30)
    // r INTEGER: [0x02, 0x01, 0x00] (single zero byte)
    expect(der[2]).toBe(0x02)
    expect(der[3]).toBe(1) // length 1
    expect(der[4]).toBe(0x00) // the single zero byte
  })

  it("produces a known DER output for a specific P1363 input", () => {
    // Known test vector: r and s are both 32 bytes of 0x01
    const p1363 = new Uint8Array(64).fill(0x01)
    const der = p1363ToDer(p1363)

    // r = 0x0101...01 (32 bytes), starts with 0x01 < 0x80 → no pad → INTEGER len = 32
    // s = 0x0101...01 (32 bytes), starts with 0x01 < 0x80 → no pad → INTEGER len = 32
    // r_der = [0x02, 0x20, 0x01 x32] = 34 bytes
    // s_der = [0x02, 0x20, 0x01 x32] = 34 bytes
    // SEQUENCE = [0x30, 0x44, r_der, s_der] = 70 bytes
    expect(der.length).toBe(70)
    expect(der[0]).toBe(0x30) // SEQUENCE
    expect(der[1]).toBe(68) // 0x44 = 34 + 34
    expect(der[2]).toBe(0x02) // r INTEGER tag
    expect(der[3]).toBe(32) // r length
    expect(der[36]).toBe(0x02) // s INTEGER tag
    expect(der[37]).toBe(32) // s length
  })

  it("handles maximum-value r and s (all 0xff)", () => {
    // Both r and s are 0xff repeated — both need sign padding
    const p1363 = new Uint8Array(64).fill(0xff)
    const der = p1363ToDer(p1363)

    // Each INTEGER: [0x02, 0x21, 0x00, 0xff x32] = 35 bytes
    // SEQUENCE: [0x30, 0x46, ...] = 72 bytes
    expect(der.length).toBe(72)
    expect(der[0]).toBe(0x30)
    expect(der[1]).toBe(70) // 35 + 35
    expect(der[2]).toBe(0x02)
    expect(der[3]).toBe(33) // 32 + 1 pad
    expect(der[4]).toBe(0x00) // pad byte
    expect(der[5]).toBe(0xff) // first real byte
  })
})
