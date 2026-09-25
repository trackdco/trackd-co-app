import { describe, expect, it } from "vitest"

import type { StackCompound } from "@/lib/home/stack"
import { draftToLog, initialDraft, stepFor, trackLabel } from "./logDraft"

const c = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "reta",
  name: "Retatrutide",
  category: "peptide",
  method: "subq",
  dose: 2,
  unit: "mg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-09-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

const NOW = new Date(2026, 8, 24, 9, 41)

describe("the open row's draft", () => {
  it("opens on the plan, with no site and the clock", () => {
    expect(initialDraft(c(), "2026-09-24", 0, null)).toEqual({
      amount: 2,
      unit: "mg",
      time24: null,
      siteId: null,
      note: "",
      inventoryItemId: undefined,
    })
  })

  it("opens a logged dose as it was logged (edit mode)", () => {
    const d = initialDraft(c(), "2026-09-24", 0, {
      amount: "2.5",
      unit: "mg",
      siteId: "sq-abdo-l",
      time24: "07:30",
      note: "late",
      inventoryItemId: null,
    })
    expect(d).toEqual({ amount: 2.5, unit: "mg", time24: "07:30", siteId: "sq-abdo-l", note: "late", inventoryItemId: null })
  })

  it("opens a later slot on its own planned amount", () => {
    const twice = c({ schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", laterTimes: ["20:00"], laterDoses: [1], startDate: "2026-09-01" } })
    expect(initialDraft(twice, "2026-09-24", 1, null).amount).toBe(1)
  })
})

describe("track writes the same record as the sheet", () => {
  it("takes the clock today, and keeps the container left to the server", () => {
    const log = draftToLog(c(), initialDraft(c(), "2026-09-24", 0, null), "2026-09-24", "2026-09-24", 0, NOW)
    expect(log).toEqual({ amount: "2", unit: "mg", siteId: null, time24: "09:41" })
    expect("inventoryItemId" in log).toBe(false)
  })

  it("takes the scheduled time on a back-dated day", () => {
    const log = draftToLog(c(), initialDraft(c(), "2026-09-20", 0, null), "2026-09-20", "2026-09-24", 0, NOW)
    expect(log.time24).toBe("08:00")
  })

  it("drops a site from an oral, and an empty note", () => {
    const oral = c({ method: "po" })
    const log = draftToLog(oral, { ...initialDraft(oral, "2026-09-24", 0, null), siteId: "sq-abdo-l", note: "  " }, "2026-09-24", "2026-09-24", 0, NOW)
    expect(log.siteId).toBeNull()
    expect("note" in log).toBe(false)
  })

  it("keeps 'Don't count this dose' as an explicit null", () => {
    const log = draftToLog(c(), { ...initialDraft(c(), "2026-09-24", 0, null), inventoryItemId: null }, "2026-09-24", "2026-09-24", 0, NOW)
    expect(log.inventoryItemId).toBeNull()
  })
})

describe("the stepper and the bar", () => {
  it("steps about a quarter of a small dose and a twenty-fifth of a big one", () => {
    expect(stepFor(2)).toBe(0.5)
    expect(stepFor(125)).toBe(5)
    expect(stepFor(0.5)).toBe(0.1)
    expect(stepFor(250)).toBe(10)
    // Counted things step whole.
    expect(stepFor(1, "tab")).toBe(1)
    expect(stepFor(2, "capsule")).toBe(1)
    expect(stepFor(3, "drop")).toBe(1)
    expect(stepFor(2, "mg")).toBe(0.5)
  })

  it("reads Track with the site, or Save when editing", () => {
    const d = initialDraft(c(), "2026-09-24", 0, null)
    expect(trackLabel(d, "Abdomen L", false)).toBe("Track 2 mg · Abdomen L")
    expect(trackLabel(d, null, false)).toBe("Track 2 mg")
    expect(trackLabel(d, "Abdomen L", true)).toBe("Save")
  })
})
