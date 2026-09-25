import { describe, expect, it } from "vitest"

import { formatDose, formatDoseAmount } from "@/lib/format/dose"

describe("formatDose", () => {
  it("keeps up to three decimals, trims zeros, and puts one space before the unit", () => {
    expect(formatDose(250, "mg")).toBe("250 mg")
    expect(formatDose(1.125, "mg")).toBe("1.125 mg")
    expect(formatDose(0.5, "mL")).toBe("0.5 mL")
    expect(formatDose(0.12345, "mg")).toBe("0.123 mg")
    expect(formatDoseAmount(2.1)).toBe("2.1")
    expect(formatDose(12)).toBe("12")
  })
})
