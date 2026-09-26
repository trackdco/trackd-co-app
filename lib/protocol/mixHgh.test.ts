/**
 * Cold review B3, ported from the reviewer's proof (`tests/mine/mix-hgh`):
 * Somatropin mixed at the box's mg figure drew three times the dose and
 * rewrote the vial's powder.
 *
 * The Mix sheet now reads its powder the way these do: typed in the entry
 * unit `mixPowderEntry` offers, converted to the stored unit with
 * `powderAmountInBase`, and only then handed to `mixDrawLine` and saved.
 */
import { describe, expect, it } from "vitest"

import { mixDrawLine, mixDrawText } from "@/lib/protocol/mixDraw"
import {
  mixPowderEntry,
  powderAmountInBase,
  powderEntryUnits,
} from "@/lib/protocol/stockUnits"

const HGH = "Somatropin (HGH)"

/** What the Mix sheet does with a typed powder, in order. */
function mixLine(typed: number, entryUnit: "mg" | "iu", storedUnit: string, waterMl: number, dose: number) {
  const entry = mixPowderEntry(HGH, storedUnit)
  const unit = entry.units.includes(entryUnit) ? entryUnit : entry.base
  const inBase = powderAmountInBase(typed, unit, entry.base)
  return { inBase, text: mixDrawText(mixDrawLine({ powder: inBase, powderUnit: entry.base, waterMl, dose, doseUnit: "iu" })) }
}

describe("Mix a vial, Somatropin (HGH)", () => {
  it("offers the same mg / IU choice as Add, starting on the box's mg", () => {
    // Add stored a "10 mg" box as 30 IU.
    expect(powderEntryUnits(HGH, { doseUnit: "iu" })).toEqual(["iu", "mg"])
    expect(powderAmountInBase(10, "mg", "iu")).toBe(30)
    expect(mixPowderEntry(HGH, "iu")).toEqual({ units: ["iu", "mg"], base: "iu", initial: "mg" })
  })

  it("draws 20 units for 3 IU from the box's 10 mg, not 60", () => {
    const { text, inBase } = mixLine(10, "mg", "iu", 2, 3)
    expect(text).toBe("Draw 20 units for 3 IU")
    // What is saved over the row is the stored unit's figure: 30 IU, the
    // powder the vial already holds, so nothing is rewritten.
    expect(inBase).toBe(30)
  })

  it("still reads a typed IU figure as IU", () => {
    expect(mixLine(30, "iu", "iu", 2, 3).text).toBe("Draw 20 units for 3 IU")
  })

  it("offers no conversion for anything else, where there is no fixed IU per mg", () => {
    expect(mixPowderEntry("HCG", "iu")).toEqual({ units: ["iu"], base: "iu", initial: "iu" })
    expect(mixPowderEntry("BPC-157", "mg")).toEqual({ units: ["mg"], base: "mg", initial: "mg" })
    // A peptide vial wrongly stored in IU keeps its own unit and no guess.
    expect(mixPowderEntry("BPC-157", "iu")).toEqual({ units: ["iu"], base: "iu", initial: "iu" })
    expect(mixPowderEntry("My own blend", null)).toEqual({ units: ["mg"], base: "mg", initial: "mg" })
  })
})
