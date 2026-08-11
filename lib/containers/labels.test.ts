import { describe, expect, it } from "vitest"

import { containerNoun, containerNounTitle, remainingLabel } from "@/lib/containers/labels"

/**
 * The wording bugs these pin are all the same shape: a string that says "vial"
 * or "mL" for a container that is neither. Each case below is one that was
 * shipping wrong on 2026-08-12.
 */
describe("containerNoun", () => {
  it("calls a reconstituted or pre-mixed injectable a vial", () => {
    expect(containerNoun({ inventoryType: "reconstituted", category: "peptide", name: "BPC-157" }))
      .toBe("vial")
    expect(containerNoun({ inventoryType: "preconcentrated", category: "anabolic", name: "Testosterone Enanthate" }))
      .toBe("vial")
  })

  it("calls a scooped powder a tub — the case Adrian reported", () => {
    // Creatine: `bulk_powder` is a STATED form and wins outright.
    expect(containerNoun({ inventoryType: "bulk_powder", category: "supplement", name: "Creatine Monohydrate" }))
      .toBe("tub")
  })

  it("calls tablets and capsules a bottle", () => {
    expect(containerNoun({ inventoryType: "oral_solid", category: "oral", name: "Anastrozole" }))
      .toBe("bottle")
    // A supplement measured in anything but grams is counted out, not scooped.
    expect(containerNoun({ inventoryType: "oral_solid", category: "supplement", name: "Vitamin D3" }))
      .toBe("bottle")
  })

  it("capitalises for a standalone value", () => {
    expect(containerNounTitle({ inventoryType: "bulk_powder", name: "Creatine Monohydrate" })).toBe("Tub")
    expect(containerNounTitle({ inventoryType: "reconstituted", name: "BPC-157" })).toBe("Vial")
  })
})

describe("remainingLabel", () => {
  it("weighs a tub — never millilitres", () => {
    // The exact bug: StockActionsSheet and LogDoseSheet said "1000 mL left".
    expect(remainingLabel({ inventoryType: "bulk_powder", remainingDisplay: 1000 })).toBe("1 kg left")
    expect(remainingLabel({ inventoryType: "bulk_powder", remainingDisplay: 250 })).toBe("250 g left")
  })

  it("counts a bottle in the unit it was stored as", () => {
    expect(remainingLabel({ inventoryType: "oral_solid", remainingDisplay: 60, totalAmountUnit: "capsule" }))
      .toBe("60 caps left")
    expect(remainingLabel({ inventoryType: "oral_solid", remainingDisplay: 30, totalAmountUnit: "tab" }))
      .toBe("30 tabs left")
  })

  it("says tab and cap in the singular for one", () => {
    expect(remainingLabel({ inventoryType: "oral_solid", remainingDisplay: 1, totalAmountUnit: "tab" }))
      .toBe("1 tab left")
    expect(remainingLabel({ inventoryType: "oral_solid", remainingDisplay: 1, totalAmountUnit: "capsule" }))
      .toBe("1 cap left")
  })

  it("measures a vial in millilitres", () => {
    expect(remainingLabel({ inventoryType: "reconstituted", remainingDisplay: 8.5 })).toBe("8.5 mL left")
    expect(remainingLabel({ inventoryType: "preconcentrated", remainingDisplay: 10 })).toBe("10 mL left")
  })

  it("returns null when there is no figure, so the caller words it", () => {
    expect(remainingLabel(null)).toBeNull()
    expect(remainingLabel(undefined)).toBeNull()
    expect(remainingLabel({ inventoryType: "reconstituted", remainingDisplay: null })).toBeNull()
  })

  it("keeps zero — an empty container is a figure, not a missing one", () => {
    expect(remainingLabel({ inventoryType: "reconstituted", remainingDisplay: 0 })).toBe("0 mL left")
    expect(remainingLabel({ inventoryType: "bulk_powder", remainingDisplay: 0 })).toBe("0 g left")
  })
})
