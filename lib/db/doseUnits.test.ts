import { describe, expect, it } from "vitest"

import { unitFamilyOk } from "@/lib/db/doseUnits"

/**
 * The TS mirror of `unit_family_compatible` (`supabase/protocol/016`). A pairing
 * missing here is a dose written with NO vial link — it logs cleanly, reports no
 * error, and the container never depletes. So this pins every family the
 * database accepts, in both directions.
 */
describe("unitFamilyOk", () => {
  it("pairs a mg container with mg and mcg doses", () => {
    expect(unitFamilyOk("mg", "mg")).toBe(true)
    expect(unitFamilyOk("mg", "mcg")).toBe(true)
  })

  it("pairs iu with iu ALONE", () => {
    expect(unitFamilyOk("iu", "iu")).toBe(true)
    // The whole reason the powder unit toggle had to be narrowed: an mg vial on
    // an iu dose (or the reverse) silently never links.
    expect(unitFamilyOk("iu", "mg")).toBe(false)
    expect(unitFamilyOk("mg", "iu")).toBe(false)
    expect(unitFamilyOk("iu", "mcg")).toBe(false)
  })

  it("pairs a gram tub with g and mg doses", () => {
    // The families the log sheet's private copy was missing, which is why a tub
    // never appeared in its stock picker.
    expect(unitFamilyOk("g", "g")).toBe(true)
    expect(unitFamilyOk("g", "mg")).toBe(true)
  })

  it("pairs counted containers with their own unit only", () => {
    expect(unitFamilyOk("tab", "tab")).toBe(true)
    expect(unitFamilyOk("capsule", "capsule")).toBe(true)
    expect(unitFamilyOk("tab", "capsule")).toBe(false)
    expect(unitFamilyOk("capsule", "tab")).toBe(false)
  })

  it("rejects cross-family pairings that would draw down the wrong scale", () => {
    expect(unitFamilyOk("mg", "g")).toBe(false)
    expect(unitFamilyOk("g", "mcg")).toBe(false)
    expect(unitFamilyOk("tab", "mg")).toBe(false)
    expect(unitFamilyOk("mg", "tab")).toBe(false)
  })

  it("rejects unknown or empty units rather than guessing", () => {
    expect(unitFamilyOk("", "")).toBe(false)
    expect(unitFamilyOk("ml", "ml")).toBe(false)
    expect(unitFamilyOk("MG", "mg")).toBe(false)
  })
})
