import { describe, expect, it } from "vitest"

import type { StackCompound } from "@/lib/home/stack"
import { pickFill, stockPickRows, stockPickStep, type HeldStock } from "@/lib/shortcuts/stockPick"

const TODAY = "2026-09-26"

function compound(over: Partial<StackCompound> = {}): StackCompound {
  return {
    id: "c1",
    name: "BPC-157",
    category: "peptide",
    method: "subq",
    dose: 250,
    unit: "mcg",
    schedule: { cadence: { type: "daily" }, timeOfDay: "09:00", startDate: "2026-09-01" },
    rotationSites: [],
    rotationIndex: 0,
    ...over,
  }
}

const held = (remainingBase: number | null, totalBase: number | null, inventoryType = "reconstituted"): HeldStock => ({
  inUse: { inventoryType: inventoryType as HeldStock["inUse"]["inventoryType"], remainingBase, totalBase },
})

describe("W43: Add stock asks which compound, from the ones Protocol shows", () => {
  const stack = [
    compound({ id: "bpc", name: "BPC-157", category: "peptide" }),
    compound({ id: "teste", name: "Testosterone Enanthate", category: "anabolic", method: "im" }),
    compound({ id: "gone", name: "Anavar", category: "oral", method: "po", archived: true }),
    compound({ id: "glow", name: "Glow (BPC-157 + TB-500 + GHK-Cu)", category: "peptide" }),
  ]

  it("offers every running compound, in Protocol's order, names in full, and never a deleted one", () => {
    const rows = stockPickRows(stack, TODAY, null)
    expect(rows.map((r) => r.id)).not.toContain("gone")
    expect(rows.map((r) => r.id)[0]).toBe("teste")
    expect(rows.find((r) => r.id === "glow")?.name).toBe("Glow (BPC-157 + TB-500 + GHK-Cu)")
  })

  it("draws each container at the level of the one in use once the read lands", () => {
    const rows = stockPickRows(stack, TODAY, new Map([["bpc", held(3, 12)]]))
    const bpc = rows.find((r) => r.id === "bpc")!
    expect(bpc.fill).toBe(0.25)
    expect(bpc.onHand).toBe(true)
    expect(rows.find((r) => r.id === "teste")!.onHand).toBe(false)
  })

  it("claims nothing while the read is out or after it failed", () => {
    for (const r of stockPickRows(stack, TODAY, null)) {
      expect(r.onHand).toBeNull()
      expect(r.fill).toBeUndefined()
    }
  })

  it("draws the container the compound is held in: the one in use, else its own form", () => {
    const rows = stockPickRows(stack, TODAY, new Map([["teste", held(1, 2, "preconcentrated")]]))
    expect(rows.find((r) => r.id === "teste")!.inventoryType).toBe("preconcentrated")
    expect(rows.find((r) => r.id === "bpc")!.inventoryType).not.toBeUndefined()
  })
})

describe("the level drawn", () => {
  it("is what is left over what it held, clamped", () => {
    expect(pickFill(held(5, 10))).toBe(0.5)
    expect(pickFill(held(12, 10))).toBe(1)
    expect(pickFill(held(-1, 10))).toBe(0)
  })

  it("is no figure at all without both numbers (drawn at the illustrative level)", () => {
    expect(pickFill(held(null, 10))).toBeUndefined()
    expect(pickFill(held(5, 0))).toBeUndefined()
    expect(pickFill(undefined)).toBeUndefined()
  })
})

describe("what choosing Add stock does", () => {
  it("asks only when there is a choice", () => {
    expect(stockPickStep([{ id: "a" }, { id: "b" }])).toEqual({ kind: "choose" })
    expect(stockPickStep([{ id: "a" }])).toEqual({ kind: "one", id: "a" })
    expect(stockPickStep([])).toEqual({ kind: "none" })
  })
})
