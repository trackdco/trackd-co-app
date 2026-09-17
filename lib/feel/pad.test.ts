import { describe, expect, it } from "vitest"

import { sanitizeDoseInput } from "@/lib/home/stack"
import { sanitizeWeightInput } from "@/lib/weight"

import { applyPadKey, padKeyFromKeyboard } from "./pad"

const dec = { decimal: true }
const int = { decimal: false }

describe("applyPadKey", () => {
  it("types digits", () => {
    expect(applyPadKey("12", "3", dec)).toEqual({ value: "123", rejected: false })
  })

  it("replaces a lone zero", () => {
    expect(applyPadKey("0", "5", dec).value).toBe("5")
  })

  it("starts a decimal with 0.", () => {
    expect(applyPadKey("", ".", dec).value).toBe("0.")
  })

  it("refuses a second decimal point", () => {
    expect(applyPadKey("1.5", ".", dec)).toEqual({ value: "1.5", rejected: true })
  })

  it("refuses a decimal point on a whole-number field", () => {
    expect(applyPadKey("7", ".", int)).toEqual({ value: "7", rejected: true })
  })

  it("caps at six digits", () => {
    expect(applyPadKey("123456", "7", dec).rejected).toBe(true)
    expect(applyPadKey("1234.56", "7", dec).rejected).toBe(true)
    expect(applyPadKey("12345", "6", dec).value).toBe("123456")
  })

  it("deletes the last character", () => {
    expect(applyPadKey("1.5", "del", dec).value).toBe("1.")
    expect(applyPadKey("", "del", dec)).toEqual({ value: "", rejected: false })
  })

  it("replaces a selected value on the first digit", () => {
    expect(applyPadKey("85.2", "9", { ...dec, selected: true }).value).toBe("9")
  })

  it("clears a selected value on delete", () => {
    expect(applyPadKey("85.2", "del", { ...dec, selected: true }).value).toBe("")
  })

  it("starts a selected value over with 0. on the decimal key", () => {
    expect(applyPadKey("85.2", ".", { ...dec, selected: true }).value).toBe("0.")
  })

  it("honours the field's own sanitiser by refusing the key", () => {
    // Weight: three whole digits and two decimals.
    expect(applyPadKey("123", "4", { ...dec, sanitize: sanitizeWeightInput }).rejected).toBe(true)
    expect(applyPadKey("85.25", "1", { ...dec, sanitize: sanitizeWeightInput }).rejected).toBe(true)
    expect(applyPadKey("85.2", "5", { ...dec, sanitize: sanitizeWeightInput }).value).toBe("85.25")
    // Dose: five whole digits, three decimals.
    expect(applyPadKey("0.125", "5", { ...dec, sanitize: sanitizeDoseInput }).rejected).toBe(true)
  })
})

describe("padKeyFromKeyboard", () => {
  it("maps digits, both decimal separators and the delete keys", () => {
    expect(padKeyFromKeyboard("7")).toBe("7")
    expect(padKeyFromKeyboard(",")).toBe(".")
    expect(padKeyFromKeyboard(".")).toBe(".")
    expect(padKeyFromKeyboard("Backspace")).toBe("del")
    expect(padKeyFromKeyboard("a")).toBeNull()
  })
})
