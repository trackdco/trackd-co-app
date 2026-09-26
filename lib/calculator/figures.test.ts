import { describe, expect, it } from "vitest"

import { reconFigures } from "./figures"
import { computeRecon } from "./recon"

const figuresFor = (powder: string, bac: string, dose: string) =>
  reconFigures(
    computeRecon({ powder, powderUnit: "mg", bac, dose, doseUnit: "mcg" }),
  )

/**
 * Cold review D23: the calculator printed an em dash in each empty figure. A
 * figure with nothing to show is now blank (null), and the page shows only its
 * unit, as an empty field does.
 */
describe("reconFigures — blank until there is a figure (D23)", () => {
  it("is blank everywhere before the powder and water are in", () => {
    expect(reconFigures(null)).toEqual({ concentration: null, perDose: null, insulin: null })
    expect(figuresFor("", "", "")).toEqual({ concentration: null, perDose: null, insulin: null })
    expect(figuresFor("5", "", "250")).toEqual({ concentration: null, perDose: null, insulin: null })
  })

  it("shows the concentration alone until the dose is in", () => {
    expect(figuresFor("5", "2", "")).toEqual({ concentration: "2.5", perDose: null, insulin: null })
  })

  it("shows all three once everything is in, as the page always printed them", () => {
    expect(figuresFor("5", "2", "250")).toEqual({ concentration: "2.5", perDose: "0.1", insulin: "10" })
  })

  it("never stands a dash in for a number", () => {
    for (const f of [reconFigures(null), figuresFor("5", "2", ""), figuresFor("5", "2", "250")]) {
      for (const v of Object.values(f)) {
        if (v !== null) expect(v).toMatch(/^[\d.]+$/)
      }
    }
  })
})
