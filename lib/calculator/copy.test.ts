import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { CALCULATOR_DISCLAIMER, misuseCopy } from "./copy"

describe("calculator copy", () => {
  it("⚠️ the disclaimer is word for word the one the legal direction quotes", () => {
    const spec = readFileSync(
      new URL("../../Context/Feature Specs/12-Legal-Direction-Spec.md", import.meta.url),
      "utf8",
    )
    const quoted = spec.match(/> "(This is a calculator, not a dosing instruction\..*?)"/)?.[1]
    // CONTROL: a regex that found nothing would pass against undefined for ever.
    expect(quoted, "the legal spec no longer quotes the disclaimer").toBeTruthy()
    expect(CALCULATOR_DISCLAIMER).toBe(quoted)
  })

  it("keeps the two misuse warnings as they read before the move", () => {
    expect(misuseCopy("under", 1.5, "0.5 mL", "0.5")).toBe(
      "That is under 2 units, too little to read off a syringe accurately. Check the figures you entered.",
    )
    expect(misuseCopy("over", 62.5, "0.5 mL", "0.5")).toBe(
      "62.5 units will not fit a 0.5 mL syringe. Check the figures you entered, or pick a larger syringe.",
    )
    expect(misuseCopy("over", 120, "1 mL", "1")).toBe(
      "120 units will not fit a 1 mL syringe. Check the figures you entered.",
    )
  })
})
