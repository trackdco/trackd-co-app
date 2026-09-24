import { describe, expect, it } from "vitest"

import { COMPOUNDS } from "@/lib/compounds-catalogue"
import { componentsOf } from "./compound-blends"

const byName = new Map(COMPOUNDS.map((c) => [c.name, c]))

describe("blend components", () => {
  const blends = [
    "Wolverine (BPC-157 + TB-500)",
    "Glow (BPC-157 + TB-500 + GHK-Cu)",
    "KLOW (BPC-157 + TB-500 + GHK-Cu + KPV)",
    "CJC-1295 + Ipamorelin",
    "Natural Desiccated Thyroid",
  ]

  it("names only real catalogue compounds, so each line reads its own half-life", () => {
    for (const b of blends) {
      expect(byName.has(b), b).toBe(true)
      for (const c of componentsOf(b) ?? []) expect(byName.has(c.name), c.name).toBe(true)
    }
  })

  it("splits a same-unit blend's whole dose, and no more", () => {
    for (const b of blends.slice(0, 4)) {
      const sum = (componentsOf(b) ?? []).reduce((s, c) => s + c.perDoseUnit, 0)
      expect(sum, b).toBeCloseTo(1, 10)
    }
  })

  it("draws Glow at the ratio it was designed with: 250 : 250 : 1250 of 1750 mcg", () => {
    const glow = componentsOf("Glow (BPC-157 + TB-500 + GHK-Cu)")!
    expect(glow.map((c) => Math.round(c.perDoseUnit * 1750))).toEqual([250, 250, 1250])
  })

  it("counts NDT's T4 and T3 in mcg per mg of tablet: 38 and 9 a grain", () => {
    const ndt = componentsOf("Natural Desiccated Thyroid")!
    expect(ndt.map((c) => [c.label, Math.round(c.perDoseUnit * 60), c.unit])).toEqual([
      ["T4", 38, "mcg"],
      ["T3", 9, "mcg"],
    ])
  })

  it("leaves a single compound alone, and matches names loosely", () => {
    expect(componentsOf("Retatrutide")).toBeNull()
    expect(componentsOf("  glow (bpc-157 + tb-500 + ghk-cu) ")).not.toBeNull()
  })
})
