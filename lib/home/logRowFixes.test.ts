/**
 * Regressions for the dose rows (Home's Today's Log, Quick log, the Calendar's
 * day) from the cold bug review, 26 Sep 2026. Each `it` names its id in
 * Context/reviews/cold-bugs.md.
 */
import { describe, expect, it } from "vitest"

import type { StockItem } from "@/lib/db/inventory"
import type { DayLogs } from "@/lib/home/doseLog"
import type { DoseLog } from "@/lib/home/mockHomeData"
import type { StackCompound } from "@/lib/home/stack"
import {
  draftTime,
  draftToLog,
  initialDraft,
  isCountedUnit,
  logTimeLabel,
  shownTime,
  stepAmount,
  stepFor,
  trackDay,
} from "./logDraft"
import {
  autoPickContainer,
  edgeFinishPlays,
  freeToRestore,
  needsStockIdLookup,
  rowContainer,
  rowStockOf,
  slotIsFree,
  stockCompoundId,
} from "./logRows"

const TODAY = "2026-09-26"
const PAST = "2026-09-24"

const c = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "bpc",
  name: "BPC-157",
  category: "peptide",
  method: "subq",
  dose: 0.25,
  unit: "mg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", laterTimes: ["20:00"], startDate: "2026-01-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

const item = (over: Partial<StockItem> = {}): StockItem =>
  ({
    id: "vial",
    createdAt: "2026-09-01T00:00:00Z",
    protocolCompoundId: "bpc",
    compoundName: "BPC-157",
    category: "peptide",
    inventoryType: "reconstituted",
    baseUnit: "mg",
    acquiredOn: "2026-09-01",
    reconstitutedOn: "2026-09-01",
    totalAmount: 5,
    totalAmountUnit: "mg",
    bacWaterMl: 2,
    concentrationMgPerMl: null,
    strengthPerUnit: null,
    servingSizeG: null,
    priorUsedBase: null,
    remainingDisplay: null,
    dosesRemaining: 10,
    estEmptyDate: null,
    remainingBase: 2.5,
    totalBase: 5,
    ...over,
  }) as StockItem

describe("B4: a SKIPPED dose saved from its open row", () => {
  it("stays skipped (it neither comes off stock nor counts as taken)", () => {
    const skipped: DoseLog = { amount: "0.25", unit: "mg", siteId: null, time24: "08:00", status: "skipped" }
    const draft = { ...initialDraft(c(), TODAY, 0, skipped), note: "felt sick" }
    const saved = draftToLog(c(), draft, TODAY, TODAY, 0, new Date(2026, 8, 26, 9, 0))
    expect(saved.status).toBe("skipped")
    expect(saved.note).toBe("felt sick")
  })

  it("adds no status to a taken dose, fresh or edited", () => {
    const taken: DoseLog = { amount: "0.25", unit: "mg", siteId: null, time24: "08:00" }
    expect("status" in draftToLog(c(), initialDraft(c(), TODAY, 0, taken), TODAY, TODAY, 0, new Date())).toBe(false)
    expect("status" in draftToLog(c(), initialDraft(c(), TODAY, 0, null), TODAY, TODAY, 0, new Date())).toBe(false)
  })

  it("says the skipped dose is not counted from stock", () => {
    const stock = rowStockOf([item()], "bpc", "mg", true, undefined)
    expect(rowContainer(stock, undefined, true, true)).toEqual({ kind: "none", why: "notCounted" })
  })
})

describe("B8: opening a logged dose to edit it", () => {
  const emptied = item({ id: "vial-X", remainingBase: 0, dosesRemaining: 0 })
  const spare = item({ id: "spare-S", inventoryType: "preconcentrated", acquiredOn: null, reconstitutedOn: null })
  const stock = rowStockOf([emptied, spare], "bpc", "mg", true, undefined)

  it("never re-picks its container, and never starts a spare", () => {
    expect(autoPickContainer(stock, true, true)).toBeNull()
    // A back-dated edit is left alone too.
    expect(autoPickContainer(rowStockOf([emptied], "bpc", "mg", false, "vial-X"), false, true)).toBeNull()
  })

  it("still picks for a NEW dose: the spare, which Track then starts", () => {
    expect(autoPickContainer(stock, true, false)).toEqual({ id: "spare-S", spare: true })
    const open = rowStockOf([item({ id: "open-1" }), spare], "bpc", "mg", true, undefined)
    expect(autoPickContainer(open, true, false)).toEqual({ id: "open-1", spare: false })
  })

  it("never picks a powder vial still to mix", () => {
    const dry = item({ id: "dry", acquiredOn: null, bacWaterMl: null, reconstitutedOn: null })
    expect(autoPickContainer(rowStockOf([dry], "bpc", "mg", true, undefined), true, false)).toBeNull()
  })

  it("names the vial the dose came out of, even used up", () => {
    expect(rowContainer(stock, "vial-X", true)).toEqual({ kind: "item", item: emptied })
  })
})

describe("B19: the Time row on a back-dated day", () => {
  it("shows the slot's own time, the one Track writes", () => {
    const draft = initialDraft(c(), PAST, 1, null)
    const written = draftToLog(c(), draft, PAST, TODAY, 1, new Date()).time24
    expect(written).toBe("20:00")
    const shown = shownTime(c(), draft, PAST, TODAY, 1, "09:30")
    expect(shown).toBe(written)
    expect(logTimeLabel(PAST, TODAY, shown)).toBe("Thu 24 Sep · 8:00 PM")
  })

  it("shows the clock today and a time set by hand anywhere", () => {
    const draft = initialDraft(c(), TODAY, 1, null)
    expect(shownTime(c(), draft, TODAY, TODAY, 1, "09:30")).toBe("09:30")
    expect(shownTime(c(), { ...draft, time24: "21:15" }, PAST, TODAY, 1, "09:30")).toBe("21:15")
    expect(draftTime(c(), draft, TODAY, TODAY, 1, new Date(2026, 8, 26, 9, 30))).toBe("09:30")
  })
})

describe("B20: a back-dated day whose container has since run out", () => {
  const then = item({ id: "vial-then", remainingBase: 0, dosesRemaining: 0 })

  it("names that container, the one Track links the dose to", () => {
    const stock = rowStockOf([then], "bpc", "mg", false, "vial-then")
    expect(autoPickContainer(stock, false, false)).toEqual({ id: "vial-then", spare: false })
    expect(rowContainer(stock, "vial-then", false)).toEqual({ kind: "item", item: then })
    expect(rowContainer(stock, undefined, false)).toEqual({ kind: "item", item: then })
  })

  it("names it even when it is no longer listed at all", () => {
    const stock = rowStockOf([], "bpc", "mg", false, "vial-gone")
    expect(rowContainer(stock, "vial-gone", false)).toEqual({ kind: "then", id: "vial-gone" })
  })

  it("says none was in use only when none was", () => {
    const stock = rowStockOf([], "bpc", "mg", false, null)
    expect(rowContainer(stock, undefined, false)).toEqual({ kind: "none", why: "pastNone" })
  })
})

describe("the Stock panel's other lines", () => {
  it("today: no stock, only powder to mix, or not counted", () => {
    expect(rowContainer(rowStockOf([], "bpc", "mg", true, undefined), undefined, true)).toEqual({
      kind: "none",
      why: "noStock",
    })
    const dry = item({ id: "dry", acquiredOn: null })
    expect(rowContainer(rowStockOf([dry], "bpc", "mg", true, undefined), undefined, true)).toEqual({
      kind: "none",
      why: "unmixed",
    })
    expect(rowContainer(rowStockOf([item()], "bpc", "mg", true, undefined), null, true)).toEqual({
      kind: "none",
      why: "notCounted",
    })
  })

  it("leaves out containers of another unit family", () => {
    const iu = item({ id: "iu-vial", baseUnit: "iu" })
    expect(rowStockOf([iu], "bpc", "mg", true, undefined).open).toEqual([])
  })
})

describe("S11: a compound whose Postgres id differs from the device's", () => {
  const items = [item({ id: "v1", protocolCompoundId: "pc-uuid" })]

  it("asks for the Postgres id only when no container carries the device id", () => {
    expect(needsStockIdLookup(items, "bpc")).toBe(true)
    expect(needsStockIdLookup([item()], "bpc")).toBe(false)
  })

  it("reads its containers under the resolved id, as Protocol does", () => {
    const pcId = stockCompoundId(items, "bpc", "pc-uuid")
    expect(pcId).toBe("pc-uuid")
    expect(rowStockOf(items, pcId, "mg", true, undefined).open.map((v) => v.id)).toEqual(["v1"])
    // The device id wins whenever a container carries it.
    expect(stockCompoundId([item()], "bpc", "pc-uuid")).toBe("bpc")
    // Nothing resolved: the device id, as before.
    expect(stockCompoundId(items, "bpc", null)).toBe("bpc")
  })
})

describe("S9: tablets, capsules and drops step whole", () => {
  it("a half-tablet plan steps to whole tablets, never 0.5 → 1.5", () => {
    expect(isCountedUnit("tab")).toBe(true)
    expect(stepAmount(0.5, 1, "tab", stepFor(0.5, "tab"))).toBe(1)
    expect(stepAmount(1, 1, "tab", 1)).toBe(2)
    expect(stepAmount(1.5, -1, "capsule", 1)).toBe(1)
    expect(stepAmount(0.5, -1, "drop", 1)).toBe(0)
    expect(stepAmount(0, -1, "tab", 1)).toBe(0)
  })

  it("other units step by their step, to three places", () => {
    expect(isCountedUnit("mg")).toBe(false)
    expect(stepAmount(2, 1, "mg", 0.5)).toBe(2.5)
    expect(stepAmount(0.1, -1, "mg", 0.025)).toBe(0.075)
    expect(stepAmount(0.2, -1, "mg", 0.5)).toBe(0)
  })
})

describe("B23: a dose tracked in the first minute after midnight", () => {
  const fresh = initialDraft(c(), "2026-09-26", 0, null)

  it("lands on the new day when the host's clock has not caught up", () => {
    expect(trackDay("2026-09-26", "2026-09-26", "2026-09-27", fresh, false)).toEqual({
      day: "2026-09-27",
      todayKey: "2026-09-27",
    })
    const log = draftToLog(c(), fresh, "2026-09-27", "2026-09-27", 0, new Date(2026, 8, 27, 0, 0, 30))
    expect(log.time24).toBe("00:00")
  })

  it("keeps the row's day for an edit, a time set by hand, a back-dated row, or a clock that agrees", () => {
    expect(trackDay("2026-09-26", "2026-09-26", "2026-09-27", fresh, true).day).toBe("2026-09-26")
    expect(trackDay("2026-09-26", "2026-09-26", "2026-09-27", { ...fresh, time24: "23:50" }, false).day).toBe(
      "2026-09-26",
    )
    expect(trackDay("2026-09-20", "2026-09-26", "2026-09-27", fresh, false).day).toBe("2026-09-20")
    expect(trackDay("2026-09-26", "2026-09-26", "2026-09-26", fresh, false).day).toBe("2026-09-26")
  })
})

describe("B17: a late write only into an empty slot", () => {
  const logs: DayLogs = { [TODAY]: { A: { amount: "2", unit: "mg", siteId: null, time24: "09:00" } } }

  it("refuses to put a dose back where one was logged since", () => {
    expect(slotIsFree(logs, TODAY, "A", 0)).toBe(false)
    expect(slotIsFree(logs, TODAY, "A", 1)).toBe(true)
    expect(slotIsFree(logs, PAST, "A", 0)).toBe(true)
  })

  it("puts back only the stack's doses whose slot is still empty", () => {
    const removed = [
      { id: "A", slot: 0 },
      { id: "B", slot: 0 },
    ]
    expect(freeToRestore(logs, TODAY, removed)).toEqual([{ id: "B", slot: 0 }])
  })
})

describe("B33: the Log card's edge finishes only when the day completes", () => {
  it("plays when the last dose lands", () => {
    expect(edgeFinishPlays({ full: false, day: TODAY }, { full: true, day: TODAY })).toBe(true)
  })

  it("does not replay on moving to a day that was already done", () => {
    expect(edgeFinishPlays({ full: false, day: TODAY }, { full: true, day: PAST })).toBe(false)
    expect(edgeFinishPlays({ full: true, day: TODAY }, { full: true, day: TODAY })).toBe(false)
  })
})
