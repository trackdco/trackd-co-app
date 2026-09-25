import { describe, expect, it } from "vitest"

import { physicalUndoForm, type PhysicalValues } from "./physicalUndo"

const before = (over: Partial<PhysicalValues>): PhysicalValues => ({
  displayName: "Adrian",
  sex: "male",
  goal: "trt",
  unitsPreference: "metric",
  heightCm: 180.3,
  ...over,
})

/** What `updatePhysical` does with a posted height: into cm, one decimal. */
const storedCm = (posted: string, imperial: boolean) =>
  Math.round((imperial ? Number(posted) * 2.54 : Number(posted)) * 10) / 10

describe("physicalUndoForm", () => {
  it("posts the previous values back as the form reads them", () => {
    expect(physicalUndoForm(before({}))).toEqual({
      display_name: "Adrian",
      sex: "male",
      goal: "trt",
      units_preference: "metric",
      height: "180.3",
    })
  })

  it("clears what was empty: no name, no goal, no height", () => {
    expect(physicalUndoForm(before({ displayName: null, goal: null, heightCm: null }))).toMatchObject({
      display_name: "",
      goal: "",
      height: "",
    })
  })

  it("lands an imperial height back on the exact stored centimetres", () => {
    for (const cm of [180.3, 175, 162.6, 199.9, 120, 230]) {
      const form = physicalUndoForm(before({ unitsPreference: "imperial", heightCm: cm }))!
      expect(storedCm(form.height, true)).toBe(cm)
    }
  })

  it("offers no Undo the action would refuse", () => {
    expect(physicalUndoForm(before({ sex: null }))).toBeNull()
    expect(physicalUndoForm(before({ sex: "" }))).toBeNull()
    expect(physicalUndoForm(before({ unitsPreference: "" }))).toBeNull()
  })
})
