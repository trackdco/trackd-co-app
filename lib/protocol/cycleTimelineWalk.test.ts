import { describe, expect, it } from "vitest"

import type { CompoundCategory } from "@/lib/compound-categories"
import { PRESS_SLOP_PX } from "@/lib/feel/press"
import type { Pause } from "@/lib/home/pauses"
import type { CycleRule } from "@/lib/protocol/cycleRule"
import {
  SCRUB_IDLE,
  SCRUB_TAP_GUARD_MS,
  cycleTypeGroups,
  hoursIntoDay,
  isScrubRelease,
  scrubStep,
  type ScrubGesture,
  type ScrubInput,
  nextTurn,
  nowWords,
  onDaysIn,
  onOnDay,
  pausedToday,
  scrubAt,
  scrubDate,
  scrubWords,
  timelineRange,
  turnRow,
} from "@/lib/protocol/cycleTimeline"

const T = "2026-09-26"
const fiveTwo = (anchor: string): CycleRule => ({
  pattern: { type: "onOff", onDays: 5, offDays: 2 },
  end: { type: "never" },
  colour: "steel",
  anchor,
})

describe("nowWords on a paused day (cold review B22)", () => {
  // Ported from the bug reviewer's proof (tests/home/pure.test.ts): anchored
  // ten days ago, 5 on / 2 off, today would be "Day 4 of 5".
  const rule = fiveTwo("2026-09-16")
  const pausedToday: Pause[] = [{ id: "p", startedOn: T, endsOn: T }]

  it("says Paused, not a day of the run, when the lane draws today as a gap", () => {
    expect(onOnDay(rule, pausedToday, T)).toBe(false)
    expect(nowWords(rule, pausedToday, T)).toBe("Paused")
    expect(nowWords(rule, [], T)).toBe("Day 4 of 5")
  })

  it("says Paused for an open-ended pause too, and the day after a one-day pause picks the run up", () => {
    expect(nowWords(rule, [{ id: "p", startedOn: "2026-09-20", endsOn: null }], T)).toBe("Paused")
    // The pause held the clock for a day, so tomorrow is still day 4.
    expect(nowWords(rule, pausedToday, "2026-09-27")).toBe("Day 4 of 5")
  })

  it("still names a start date first: a paused compound whose cycle has not begun", () => {
    const later = fiveTwo("2026-10-12")
    expect(nowWords(later, [{ id: "p", startedOn: "2026-09-20", endsOn: null }], T)).toBe("Starts 12 Oct")
  })
})

describe("nextTurn across a pause longer than a round", () => {
  it("steps over the paused days and finds the day it comes back", () => {
    // Paused from today for 10 days (to 5 Oct), a 7-day round: the old search
    // stopped after 8 calendar days and said nothing.
    const pauses: Pause[] = [{ id: "p", startedOn: T, endsOn: "2026-10-05" }]
    expect(nextTurn(fiveTwo("2026-09-24"), pauses, T)).toBe("6 Oct")
  })

  it("says nothing for a pause with no end", () => {
    expect(nextTurn(fiveTwo("2026-09-24"), [{ id: "p", startedOn: T, endsOn: null }], T)).toBeNull()
  })
})

describe("turnRow: the open lane's words (W30)", () => {
  it("reads 'Off from' while on and 'Back on' while off or paused", () => {
    expect(turnRow(fiveTwo("2026-09-24"), undefined, T)).toEqual({ label: "Off from", date: "29 Sep" })
    expect(turnRow(fiveTwo("2026-09-20"), undefined, T)).toEqual({ label: "Back on", date: "27 Sep" })
    const pauses: Pause[] = [{ id: "p", startedOn: T, endsOn: "2026-09-27" }]
    expect(turnRow(fiveTwo("2026-09-24"), pauses, T)).toEqual({ label: "Back on", date: "28 Sep" })
  })

  it("has no row when nothing turns: continuous, not started, or paused with no end", () => {
    const continuous: CycleRule = { ...fiveTwo("2026-09-01"), pattern: { type: "continuous" } }
    expect(turnRow(continuous, undefined, T)).toBeNull()
    expect(turnRow(fiveTwo("2026-10-12"), undefined, T)).toBeNull()
    expect(turnRow(fiveTwo("2026-09-24"), [{ id: "p", startedOn: T, endsOn: null }], T)).toBeNull()
  })

  it("never says 'Next off'", () => {
    for (const anchor of ["2026-09-20", "2026-09-22", "2026-09-24", "2026-09-26"]) {
      expect(turnRow(fiveTwo(anchor), undefined, T)?.label).not.toMatch(/next/i)
    }
  })
})

describe("cycleTypeGroups: one grouping for the list and the Timeline (D6, W31)", () => {
  type Item = { id: string; category: string; paused: boolean }
  const item = (id: string, category: string, paused = false): Item => ({ id, category, paused })
  const group = (items: Item[]) =>
    cycleTypeGroups(
      items,
      (i) => i.category,
      (i) => i.paused,
    ).map((g) => [g.key, g.label, g.items.map((i) => i.id)])

  it("orders types by consequence, keeps each type's order, and puts paused last out of its type", () => {
    const items = [
      item("bpc", "peptide"),
      item("test", "anabolic"),
      item("anavar", "oral", true),
      item("tb", "peptide"),
      item("deca", "anabolic", true),
    ]
    expect(group(items)).toEqual([
      ["anabolic", "Anabolics", ["test"]],
      ["peptide", "Peptides", ["bpc", "tb"]],
      ["paused", "Paused", ["anavar", "deca"]],
    ])
  })

  it("names no type whose only cycle is paused (the '?n=12' Orals lane the list did not have)", () => {
    const g = group([item("bpc", "peptide"), item("anavar", "oral", true)])
    expect(g.map(([k]) => k)).toEqual(["peptide", "paused"])
  })

  it("counts every cycle exactly once, however many there are", () => {
    const cats: CompoundCategory[] = ["anabolic", "peptide", "oral", "sarm", "supplement"]
    const items = Array.from({ length: 50 }, (_, i) => item(`c${i}`, cats[i % cats.length], i % 10 === 7))
    const groups = cycleTypeGroups(
      items,
      (i) => i.category,
      (i) => i.paused,
    )
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(50)
    expect(groups.find((g) => g.key === "paused")?.items).toHaveLength(5)
    expect(groups.find((g) => g.key === "anabolic")?.items).toHaveLength(10)
    // Every paused one is an oral (i % 10 === 7): the Orals count drops by them.
    expect(groups.find((g) => g.key === "oral")?.items).toHaveLength(5)
  })

  it("keeps a cycle of a type this build does not know, under Other, before Paused", () => {
    const g = group([item("x", "blend"), item("bpc", "peptide"), item("y", "peptide", true)])
    expect(g).toEqual([
      ["peptide", "Peptides", ["bpc"]],
      ["other", "Other", ["x"]],
      ["paused", "Paused", ["y"]],
    ])
  })

  it("tells paused the same way the list does: a pause covering today", () => {
    expect(pausedToday([{ id: "p", startedOn: T, endsOn: T }], T)).toBe(true)
    expect(pausedToday([{ id: "p", startedOn: "2026-09-20", endsOn: null }], T)).toBe(true)
    expect(pausedToday([{ id: "p", startedOn: "2026-09-20", endsOn: "2026-09-25" }], T)).toBe(false)
    expect(pausedToday(undefined, T)).toBe(false)
  })
})

describe("the scrub (W35)", () => {
  it("maps a finger across the range to the day under it and the moment", () => {
    const r = timelineRange("1m") // [-7, 23): 30 days
    expect(scrubAt(0, r)).toEqual({ day: -7, hours: -168 })
    expect(scrubAt(7 / 30, r)).toEqual({ day: 0, hours: 0 })
    expect(scrubAt(1, r)).toEqual({ day: 22, hours: 23 * 24 })
    expect(scrubAt(-3, r).day).toBe(-7)
    expect(scrubAt(Number.NaN, r).day).toBe(-7)
  })

  it("reads hours within a day of now", () => {
    // Now is 09:00; the finger at 14:00 today, at 04:00 today, and on now.
    expect(scrubWords(14, 9, 0)).toBe("In 5 hours")
    expect(scrubWords(4, 9, 0)).toBe("5 hours ago")
    expect(scrubWords(9.4, 9, 0)).toBe("Now")
    expect(scrubWords(10, 9, 0)).toBe("In 1 hour")
    // Tomorrow 03:00 is 18 hours ahead: still hours.
    expect(scrubWords(27, 9, 1)).toBe("In 18 hours")
    // Yesterday 20:00 is 13 hours back.
    expect(scrubWords(-4, 9, -1)).toBe("13 hours ago")
  })

  it("reads calendar days past a day, then weeks, months and years on the long views", () => {
    expect(scrubWords(24 + 12, 9, 1)).toBe("Tomorrow")
    expect(scrubWords(-24 + 2, 9, -1)).toBe("Yesterday")
    expect(scrubWords(3 * 24 + 12, 9, 3)).toBe("In 3 days")
    expect(scrubWords(-4 * 24 + 12, 9, -4)).toBe("4 days ago")
    expect(scrubWords(13 * 24, 9, 13)).toBe("In 13 days")
    expect(scrubWords(21 * 24, 9, 21)).toBe("In 3 weeks")
    expect(scrubWords(120 * 24, 9, 120)).toBe("In 4 months")
    expect(scrubWords(-400 * 24, 9, -400)).toBe("1 year ago")
    expect(scrubWords(-800 * 24, 9, -800)).toBe("2 years ago")
  })

  it("never reads more than 23 hours, and never 'In 0'", () => {
    for (let h = -30; h <= 54; h += 0.25) {
      const day = Math.floor(h / 24)
      const w = scrubWords(h, 9, day)
      expect(w).not.toMatch(/\b(0|24) hours?\b/)
      expect(w).not.toMatch(/In 0|^0 /)
    }
  })

  it("dates the day, with the year when it is not this year's", () => {
    expect(scrubDate(T, 3)).toBe("29 Sep")
    expect(scrubDate(T, -300)).toBe("30 Nov 2025")
    expect(scrubDate(T, 100)).toBe("4 Jan 2027")
  })

  it("measures the time of day locally", () => {
    expect(hoursIntoDay(new Date(2026, 8, 26, 9, 30))).toBe(9.5)
  })
})

describe("press, hold and scrub (W48)", () => {
  const down = (lane: string | null = "l:bpc", pointerId = 1, x = 100, y = 50, primary = true): ScrubInput => ({
    type: "down",
    lane,
    pointerId,
    x,
    y,
    primary,
  })
  const run = (...inputs: ScrubInput[]) => inputs.reduce<ScrubGesture>((g, e) => scrubStep(g, e), SCRUB_IDLE)

  it("a quick release is a tap: the lane's own click opens it", () => {
    const g = run(down(), { type: "move", pointerId: 1, x: 103, y: 51 }, { type: "end", pointerId: 1, at: 1000 })
    expect(g.phase).toBe("idle")
    expect(isScrubRelease(g, 1001)).toBe(false)
  })

  it("a rested finger scrubs that lane, follows the finger, and its release is not a tap", () => {
    const scrubbing = run(down(), { type: "hold" }, { type: "move", pointerId: 1, x: 240, y: 90 })
    expect(scrubbing).toMatchObject({ phase: "scrubbing", lane: "l:bpc", x: 240 })
    // Far from where it started, and up and down: a scrub never turns into a scroll.
    const still = scrubStep(scrubbing, { type: "move", pointerId: 1, x: 10, y: 400 })
    expect(still).toMatchObject({ phase: "scrubbing", x: 10 })
    const ended = scrubStep(still, { type: "end", pointerId: 1, at: 5000 })
    expect(ended).toEqual({ phase: "idle", endedAt: 5000 })
    expect(isScrubRelease(ended, 5020)).toBe(true)
    expect(isScrubRelease(ended, 5000 + SCRUB_TAP_GUARD_MS)).toBe(false)
  })

  it("moving past the slop before the hold is a scroll: the hold never lands", () => {
    const g = run(down(), { type: "move", pointerId: 1, x: 100, y: 50 + PRESS_SLOP_PX + 1 }, { type: "hold" })
    expect(g.phase).toBe("idle")
  })

  it("ignores a child's lost capture (a touch's, bubbling up as the scrub starts), not its own", () => {
    const scrubbing = run(down(), { type: "hold" })
    expect(scrubStep(scrubbing, { type: "lost", pointerId: 1, own: false, at: 10 })).toBe(scrubbing)
    expect(scrubStep(scrubbing, { type: "lost", pointerId: 1, own: true, at: 10 })).toEqual({ phase: "idle", endedAt: 10 })
  })

  it("leaving the lanes drops a press (a mouse let go outside) but never a scrub", () => {
    expect(run(down(), { type: "leave", pointerId: 1, at: 7 }).phase).toBe("idle")
    const scrubbing = run(down(), { type: "hold" })
    expect(scrubStep(scrubbing, { type: "leave", pointerId: 1, at: 7 })).toBe(scrubbing)
  })

  it("starts only on a lane, with a touch or the main button, one pointer at a time", () => {
    expect(run(down(null)).phase).toBe("idle")
    expect(run(down("l:bpc", 1, 100, 50, false)).phase).toBe("idle")
    const pressing = run(down())
    expect(scrubStep(pressing, down("l:tb", 2))).toBe(pressing)
    expect(scrubStep(pressing, { type: "move", pointerId: 2, x: 400, y: 400 })).toBe(pressing)
    expect(scrubStep(pressing, { type: "end", pointerId: 2, at: 1 })).toBe(pressing)
  })

  it("a cancelled scrub (the browser took the touch) ends like a release", () => {
    const g = run(down(), { type: "hold" }, { type: "end", pointerId: 1, at: 42 })
    expect(g).toEqual({ phase: "idle", endedAt: 42 })
  })
})

describe("the lanes still draw the same days", () => {
  it("leaves a paused day off", () => {
    const on = onDaysIn(fiveTwo("2026-09-26"), [{ id: "p", startedOn: "2026-09-27", endsOn: "2026-09-27" }], T, [0, 7])
    expect(on).toEqual([true, false, true, true, true, true, false])
  })
})
