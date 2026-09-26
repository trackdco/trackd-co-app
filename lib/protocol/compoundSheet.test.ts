import { describe, expect, it } from "vitest"

import type { StockItem } from "@/lib/db/inventory"
import type { StackCompound } from "@/lib/home/stack"
import {
  drawnFill,
  heldKind,
  nextDoseKey,
  nextDoseText,
  othersLabel,
  stockPicture,
} from "./compoundSheet"
import { containersOf } from "./stockView"

const item = (over: Partial<StockItem> = {}): StockItem => ({
  id: "v1",
  createdAt: "2026-09-01T00:00:00Z",
  protocolCompoundId: "pc",
  compoundName: "Retatrutide",
  category: "peptide",
  inventoryType: "reconstituted",
  baseUnit: "mg",
  acquiredOn: "2026-09-10",
  reconstitutedOn: "2026-09-10",
  totalAmount: 10,
  totalAmountUnit: "mg",
  bacWaterMl: 2,
  concentrationMgPerMl: null,
  strengthPerUnit: null,
  servingSizeG: null,
  priorUsedBase: null,
  remainingDisplay: 0.8,
  dosesRemaining: 4,
  estEmptyDate: null,
  daysToEmpty: null,
  mlPerDose: null,
  unitsPerDoseOral: null,
  concentrationPerMl: null,
  remainingBase: 4,
  totalBase: 10,
  ...over,
})

const spare = (id: string, over: Partial<StockItem> = {}) =>
  item({
    id,
    acquiredOn: null,
    reconstitutedOn: null,
    bacWaterMl: null,
    dosesRemaining: null,
    remainingBase: null,
    remainingDisplay: null,
    createdAt: `2026-09-2${id.length}T00:00:00Z`,
    ...over,
  })

const naming = { category: "peptide", name: "Retatrutide" }

/** As `compoundStockViews` holds a compound: the one in use, and the rest. */
function view(rows: StockItem[]) {
  const box = containersOf(rows, "pc")
  const inUse = box.inUse ?? box.spares[0] ?? null
  return { inUse, extras: [...box.open, ...box.spares].filter((i) => i !== inUse) }
}

describe("the stock picture (W17)", () => {
  // Retatrutide as the Protocol preview holds it: two vials open, three dry.
  const rows = [
    item({ id: "open-1", dosesRemaining: 4, remainingBase: 2, totalBase: 10, createdAt: "2026-09-01T00:00:00Z" }),
    item({ id: "open-2", dosesRemaining: 7, remainingBase: 7, totalBase: 10, createdAt: "2026-09-20T00:00:00Z" }),
    spare("s1"),
    spare("s22"),
    spare("s333"),
  ]
  const box = view(rows)

  it("leads with the vial in use, at its own level and its own figure", () => {
    const p = stockPicture({ ...box, others: 4, naming })!
    expect(p.lead.item.id).toBe("open-1")
    expect(p.lead.title).toBe("Current vial")
    expect(p.lead.figure).toBe("4 doses left")
    expect(p.lead.fill).toBeCloseTo(0.2, 9)
    expect(p.lead.powder).toBe(false)
  })

  it("draws the rest as mixed at their levels and unmixed with their powder", () => {
    const p = stockPicture({ ...box, others: 4, naming })!
    expect(p.groups.map((g) => [g.kind, g.label])).toEqual([
      ["mixed", "1 mixed"],
      ["unmixed", "3 unmixed"],
    ])
    expect(p.groups[0].drawn[0].fill).toBeCloseTo(0.7, 9)
    expect(p.groups[1].drawn.every((d) => d.fill === 0 && d.powder)).toBe(true)
  })

  it("draws at most three of a group and still counts them all", () => {
    const many = view([rows[0], ...["a", "bb", "ccc", "dddd", "eeeee"].map((id) => spare(id))])
    const g = stockPicture({ ...many, others: 5, naming })!.groups[0]
    expect(g.label).toBe("5 unmixed")
    expect(g.drawn).toHaveLength(3)
  })

  it("ends the line in the count and the container's noun (D13)", () => {
    expect(stockPicture({ ...box, others: 4, naming })!.othersLabel).toBe("+4 vials")
    expect(othersLabel(1, "vial")).toBe("+1 vial")
    expect(othersLabel(0, "vial")).toBeNull()
  })

  it("names an oil vial's sealed spare, and a bottle's", () => {
    const oil = item({ id: "oil", inventoryType: "preconcentrated", totalAmountUnit: "ml", bacWaterMl: null, category: "anabolic" })
    const oilSpare = spare("oil-s", { inventoryType: "preconcentrated", totalAmountUnit: "ml", category: "anabolic" })
    const p = stockPicture({ ...view([oil, oilSpare]), others: 1, naming: { category: "anabolic", name: "Testosterone Enanthate" } })!
    expect(p.groups).toEqual([expect.objectContaining({ kind: "sealed", label: "1 sealed" })])
    expect(p.groups[0].drawn[0].fill).toBe(1)
    expect(p.othersLabel).toBe("+1 vial")

    const tabs = item({ id: "t", inventoryType: "oral_solid", totalAmountUnit: "capsule", bacWaterMl: null, category: "supplement" })
    const t = stockPicture({ ...view([tabs, spare("t2", { inventoryType: "oral_solid", totalAmountUnit: "capsule", category: "supplement" })]), others: 1, naming: { category: "supplement", name: "NAC" } })!
    expect(t.othersLabel).toBe("+1 bottle")
  })

  it("leads with the first spare when nothing is started, and states no doses", () => {
    const p = stockPicture({ ...view([spare("s1"), spare("s22")]), others: 1, naming })!
    expect(p.lead.title).toBe("Powder, not mixed")
    expect(p.lead.figure).toBeNull()
    expect(p.lead.powder).toBe(true)
    expect(p.groups.map((g) => g.label)).toEqual(["1 unmixed"])
  })

  it("without a breakdown, is the lead and the count alone", () => {
    const p = stockPicture({ inUse: box.inUse, others: 4, naming })!
    expect(p.groups).toEqual([])
    expect(p.othersLabel).toBe("+4 vials")
  })

  it("is nothing without a container", () => {
    expect(stockPicture({ inUse: null, others: 0, naming })).toBeNull()
  })

  it("reads a wet powder vial held back as mixed, and draws an unknown level as unknown", () => {
    expect(heldKind(spare("w", { bacWaterMl: 2 }))).toBe("mixed")
    expect(drawnFill(item({ remainingBase: null }))).toBeUndefined()
  })
})

const compound = (over: Partial<StackCompound> = {}): Pick<StackCompound, "schedule" | "cycle" | "pauses"> => ({
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-09-01" },
  ...over,
})

// Saturday 26 Sep 2026, mid-morning.
const SAT = new Date(2026, 8, 26, 10, 0)

describe("the next dose (D13, F14)", () => {
  it("is today while today's dose is still to take", () => {
    expect(nextDoseKey(compound(), SAT, 0)).toBe("2026-09-26")
    expect(nextDoseText("2026-09-26", SAT)).toBe("Today")
  })

  it("is never today once today's dose is logged", () => {
    expect(nextDoseKey(compound(), SAT, 1)).toBe("2026-09-27")
    expect(nextDoseText("2026-09-27", SAT)).toBe("Tomorrow")
  })

  it("stays today while one of two daily doses is still to take", () => {
    const twice = compound({
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", laterTimes: ["20:00"], startDate: "2026-09-01" },
    })
    expect(nextDoseKey(twice, SAT, 1)).toBe("2026-09-26")
    expect(nextDoseKey(twice, SAT, 2)).toBe("2026-09-27")
  })

  it("names one date, the next due day, on a weekly schedule", () => {
    // Mon and Thu: from a Saturday, Monday 28 Sep.
    const monThu = compound({
      schedule: { cadence: { type: "daysOfWeek", days: [1, 4] }, timeOfDay: "08:00", startDate: "2026-09-01" },
    })
    expect(nextDoseKey(monThu, SAT, 0)).toBe("2026-09-28")
    expect(nextDoseText("2026-09-28", SAT)).toBe("Mon 28 Sep")
  })
})
