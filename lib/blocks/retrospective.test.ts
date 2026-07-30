import { describe, expect, it } from "vitest"

import type { Block } from "./block"
import {
  bloodsAcross,
  buildRetrospective,
  comparePair,
  compoundsRunAcross,
  consistencyAcross,
  daysIn,
  journalAcross,
  photosAcross,
  weightAcross,
} from "./retrospective"
import type { StackCompound } from "@/lib/home/stack"
import type { DayLogs } from "@/lib/home/doseLog"
import { computeAdherenceOver } from "@/lib/progress/consistency"
import type { ProgressPhoto } from "@/lib/progress/photos"
import type { JournalEntry } from "@/lib/progress/journal"

const WINDOW = { from: "2026-01-01", to: "2026-03-01", days: 60 }

const block = (over: Partial<Block> = {}): Block => ({
  id: "b1",
  name: "First prep",
  startedOn: "2026-01-01",
  endsOn: "2026-04-15",
  targets: [],
  status: "active",
  closedOn: null,
  reflection: null,
  ...over,
})

/** The REAL `StackCompound` shape — a cadence is an object, not a string. A
 *  loosely-typed fixture here would let these tests pass against data the app
 *  never produces, which is the failure mode that makes a suite worthless. */
const compound = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "c1",
  name: "Testosterone",
  category: "anabolic",
  method: "im",
  dose: 250,
  unit: "mg",
  schedule: {
    cadence: { type: "everyNDays", n: 3 },
    startDate: "2026-01-01",
    timeOfDay: "08:00",
  },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

const photo = (over: Partial<ProgressPhoto> = {}): ProgressPhoto => ({
  id: "p1",
  pose: "front",
  date: "2026-01-05",
  url: "https://example.test/p1",
  weightKg: null,
  note: null,
  ...over,
})

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: "e1",
  date: "2026-01-05",
  body: "Felt strong.",
  markers: [],
  attachments: [],
  ...over,
})

describe("daysIn", () => {
  it("walks both ends inclusively", () => {
    const days = daysIn({ from: "2026-01-01", to: "2026-01-03", days: 3 })
    expect(days).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"])
  })

  it("crosses a month and a leap-year February without drifting", () => {
    const days = daysIn({ from: "2028-02-27", to: "2028-03-01", days: 4 })
    expect(days).toEqual(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01"])
  })

  it("returns the single day for a one-day window", () => {
    expect(daysIn({ from: "2026-01-01", to: "2026-01-01", days: 1 })).toEqual([
      "2026-01-01",
    ])
  })

  it("caps a runaway span rather than spinning", () => {
    const days = daysIn({ from: "1900-01-01", to: "2100-01-01", days: 73_000 })
    expect(days.length).toBe(3660)
  })
})

describe("weightAcross", () => {
  const points = [
    { key: "2025-12-01", kg: 100 }, // BEFORE the window
    { key: "2026-01-02", kg: 92 },
    { key: "2026-02-01", kg: 88 },
    { key: "2026-04-01", kg: 80 }, // AFTER the window
  ]

  it("anchors to readings inside the window, never to one before it", () => {
    const w = weightAcross(points, WINDOW)
    // 92 → 88, not 100 → 88: the 8 kg lost before the block began is not the
    // block's to claim.
    expect(w).toMatchObject({ from: 92, to: 88, delta: -4 })
  })

  it("clips the graph to the window", () => {
    expect(weightAcross(points, WINDOW)?.points.map((p) => p.key)).toEqual([
      "2026-01-02",
      "2026-02-01",
    ])
  })

  it("is null when nothing was logged in the window", () => {
    expect(weightAcross([{ key: "2025-01-01", kg: 90 }], WINDOW)).toBeNull()
  })

  it("reads a gain as a positive delta and states no verdict", () => {
    const w = weightAcross(
      [
        { key: "2026-01-02", kg: 80 },
        { key: "2026-02-02", kg: 86 },
      ],
      WINDOW,
    )
    expect(w?.delta).toBe(6)
  })

  it("sorts unsorted input rather than trusting the caller", () => {
    const w = weightAcross(
      [
        { key: "2026-02-01", kg: 88 },
        { key: "2026-01-02", kg: 92 },
      ],
      WINDOW,
    )
    expect(w).toMatchObject({ from: 92, to: 88 })
  })
})

describe("compoundsRunAcross", () => {
  it("counts a compound that was RUNNING, even on the days no dose fell", () => {
    const stack = [compound()]
    const logs: DayLogs = {
      "2026-01-01": { c1: {} as never },
      "2026-01-04": { c1: {} as never },
    }
    const ran = compoundsRunAcross(stack, logs, WINDOW)
    expect(ran).toHaveLength(1)
    expect(ran[0]).toMatchObject({ name: "Testosterone", doses: 2 })
  })

  it("counts only doses inside the window", () => {
    const logs: DayLogs = {
      "2025-12-30": { c1: {} as never }, // before
      "2026-01-04": { c1: {} as never },
      "2026-06-01": { c1: {} as never }, // after
    }
    expect(compoundsRunAcross([compound()], logs, WINDOW)[0].doses).toBe(1)
  })

  it("includes a compound with logged doses that never resolves as running", () => {
    // The schedule starts after the window, so nothing is "running" in it — but
    // the user can see the dose they logged, so erasing it would be a lie.
    const late = compound({
      id: "c2",
      name: "Retatrutide",
      schedule: {
        cadence: { type: "everyNDays", n: 7 },
        startDate: "2027-01-01",
        timeOfDay: "08:00",
      },
    })
    const logs: DayLogs = { "2026-01-10": { c2: {} as never } }
    const ran = compoundsRunAcross([late], logs, WINDOW)
    expect(ran).toHaveLength(1)
    expect(ran[0]).toMatchObject({ name: "Retatrutide", doses: 1 })
  })

  it("drops a log whose compound is gone entirely rather than naming it blank", () => {
    const logs: DayLogs = { "2026-01-10": { ghost: {} as never } }
    expect(compoundsRunAcross([], logs, WINDOW)).toEqual([])
  })

  it("orders by doses, then by name", () => {
    const a = compound({ id: "a", name: "Anavar" })
    const b = compound({ id: "b", name: "Boldenone" })
    const c = compound({ id: "c", name: "Cabergoline" })
    const logs: DayLogs = {
      "2026-01-02": { b: {} as never, a: {} as never, c: {} as never },
      "2026-01-03": { b: {} as never },
    }
    expect(compoundsRunAcross([a, b, c], logs, WINDOW).map((r) => r.name)).toEqual([
      "Boldenone",
      "Anavar",
      "Cabergoline",
    ])
  })

  it("does not report a compound whose protocol started after the window", () => {
    const later = compound({
      id: "c9",
      schedule: {
        cadence: { type: "everyNDays", n: 3 },
        startDate: "2026-06-01",
        timeOfDay: "08:00",
      },
    })
    expect(compoundsRunAcross([later], {}, WINDOW)).toEqual([])
  })
})

describe("photosAcross / comparePair", () => {
  it("groups the first and last SESSIONS, not the first and last photos", () => {
    const span = photosAcross(
      [
        photo({ id: "a", date: "2026-01-05", pose: "front" }),
        photo({ id: "b", date: "2026-01-05", pose: "back" }),
        photo({ id: "c", date: "2026-02-20", pose: "front" }),
      ],
      WINDOW,
    )
    expect(span?.sessions).toBe(2)
    expect(span?.first.map((p) => p.id).sort()).toEqual(["a", "b"])
    expect(span?.last.map((p) => p.id)).toEqual(["c"])
  })

  it("leaves `last` empty when there is only one session, so nothing implies a comparison", () => {
    const span = photosAcross([photo({ date: "2026-01-05" })], WINDOW)
    expect(span?.sessions).toBe(1)
    expect(span?.last).toEqual([])
    expect(comparePair(span!)).toBeNull()
  })

  it("pairs the SAME pose across the two sessions", () => {
    const span = photosAcross(
      [
        photo({ id: "a", date: "2026-01-05", pose: "back" }),
        photo({ id: "b", date: "2026-01-05", pose: "front" }),
        photo({ id: "c", date: "2026-02-20", pose: "front" }),
        photo({ id: "d", date: "2026-02-20", pose: "side" }),
      ],
      WINDOW,
    )
    // "back" comes first in the session but only "front" exists at both ends,
    // and a front beside a back is not a comparison.
    expect(comparePair(span!)).toMatchObject({
      before: { id: "b" },
      after: { id: "c" },
    })
  })

  it("falls back to each session's lead when no pose is shared", () => {
    const span = photosAcross(
      [
        photo({ id: "a", date: "2026-01-05", pose: "back" }),
        photo({ id: "c", date: "2026-02-20", pose: "front" }),
      ],
      WINDOW,
    )
    expect(comparePair(span!)).toMatchObject({ before: { id: "a" }, after: { id: "c" } })
  })

  it("excludes photos outside the window", () => {
    expect(photosAcross([photo({ date: "2025-06-01" })], WINDOW)).toBeNull()
  })
})

describe("bloodsAcross", () => {
  it("keeps panels inside the window, newest first", () => {
    const panels = [
      { id: "1", date: "2026-01-10", url: null, note: null },
      { id: "2", date: "2026-02-10", url: null, note: null },
      { id: "3", date: "2025-11-10", url: null, note: null },
    ]
    expect(bloodsAcross(panels, WINDOW).map((p) => p.id)).toEqual(["2", "1"])
  })
})

describe("journalAcross", () => {
  it("counts entries in the window only", () => {
    const span = journalAcross(
      [entry({ id: "a" }), entry({ id: "b", date: "2025-01-01" })],
      WINDOW,
    )
    expect(span.entries).toBe(1)
  })

  it("ranks the markers dialed most often", () => {
    const span = journalAcross(
      [
        entry({
          id: "a",
          date: "2026-01-05",
          markers: [
            { markerId: "m1", name: "Lethargy", tierValue: 2, word: "Mild" },
            { markerId: "m2", name: "Acne", tierValue: 1, word: "None" },
          ],
        }),
        entry({
          id: "b",
          date: "2026-01-06",
          markers: [{ markerId: "m1", name: "Lethargy", tierValue: 3, word: "Marked" }],
        }),
      ],
      WINDOW,
    )
    expect(span.topMarkers).toEqual([
      { name: "Lethargy", count: 2 },
      { name: "Acne", count: 1 },
    ])
  })

  it("counts a marker once per entry even if a row is duplicated", () => {
    const span = journalAcross(
      [
        entry({
          markers: [
            { markerId: "m1", name: "Lethargy", tierValue: 2, word: "Mild" },
            { markerId: "m1", name: "Lethargy", tierValue: 3, word: "Marked" },
          ],
        }),
      ],
      WINDOW,
    )
    expect(span.topMarkers).toEqual([{ name: "Lethargy", count: 1 }])
  })

  it("picks the newest entry that actually has text", () => {
    const span = journalAcross(
      [
        entry({ id: "new", date: "2026-02-01", body: null }),
        entry({ id: "older", date: "2026-01-05", body: "Felt strong." }),
      ],
      WINDOW,
    )
    expect(span.latest?.id).toBe("older")
  })

  it("has no latest when every entry is markers-only", () => {
    expect(journalAcross([entry({ body: "   " })], WINDOW).latest).toBeNull()
  })
})

describe("consistencyAcross", () => {
  const points = [
    { key: "2025-12-01", due: 1, logged: 0 }, // outside
    { key: "2026-01-02", due: 2, logged: 2 },
    { key: "2026-01-03", due: 0, logged: 0 }, // rest day
    { key: "2026-01-04", due: 2, logged: 1 },
  ]

  it("clips to the window and ignores rest days in the day count", () => {
    expect(consistencyAcross(points, WINDOW)).toEqual({
      pct: 75,
      logged: 3,
      due: 4,
      doseDays: 2,
    })
  })

  it("is null rather than zero when nothing was ever due", () => {
    expect(consistencyAcross([{ key: "2026-01-02", due: 0, logged: 0 }], WINDOW).pct).toBeNull()
  })
})

describe("buildRetrospective", () => {
  it("scopes every section to the same window", () => {
    const r = buildRetrospective(
      block({ status: "completed", closedOn: "2026-02-01" }),
      "2026-07-30",
      {
        weight: [
          { key: "2026-01-02", kg: 92 },
          { key: "2026-03-01", kg: 84 }, // after the CLOSE date
        ],
        stack: [compound()],
        logs: { "2026-01-04": { c1: {} as never }, "2026-03-05": { c1: {} as never } },
        adherence: [
          { key: "2026-01-04", due: 1, logged: 1 },
          { key: "2026-03-05", due: 1, logged: 0 },
        ],
        photos: [photo({ date: "2026-01-05" }), photo({ id: "x", date: "2026-03-05" })],
        bloods: [{ id: "1", date: "2026-03-05", url: null, note: null }],
        journal: [entry({ date: "2026-03-05" })],
      },
    )
    expect(r.window).toEqual({ from: "2026-01-01", to: "2026-02-01", days: 32 })
    expect(r.weight?.points).toHaveLength(1)
    expect(r.compounds[0].doses).toBe(1)
    expect(r.consistency).toMatchObject({ pct: 100, due: 1 })
    expect(r.photos?.sessions).toBe(1)
    expect(r.bloods).toEqual([])
    expect(r.journal.entries).toBe(0)
  })
})

describe("computeAdherenceOver — the window, not the last 365 days", () => {
  const daily = compound({
    id: "c1",
    schedule: {
      cadence: { type: "daily" },
      startDate: "2024-06-01",
      timeOfDay: "08:00",
    },
  })

  it("covers a block that ran long before today", () => {
    // The bug this replaced: `computeAdherence` walks back from TODAY and caps
    // at a year, so an eighteen-month-old block fell outside the series
    // entirely. Clipping it gave `due: 0` and the retrospective printed a
    // headline 0% directly beneath its own list of the doses logged in it.
    const logs: DayLogs = {
      "2024-06-01": { c1: {} as never },
      "2024-06-02": { c1: {} as never },
    }
    const pts = computeAdherenceOver([daily], logs, "2024-06-01", "2024-06-04")
    expect(pts.map((p) => p.key)).toEqual([
      "2024-06-01",
      "2024-06-02",
      "2024-06-03",
      "2024-06-04",
    ])
    expect(consistencyAcross(pts, { from: "2024-06-01", to: "2024-06-04", days: 4 })).toEqual({
      pct: 50,
      logged: 2,
      due: 4,
      doseDays: 4,
    })
  })

  it("counts a STOPPED compound up to the day it stopped, and not after", () => {
    // Deleting a compound writes a `stopped` schedule version, which is what
    // bounds it in time. Before the stop it was genuinely due; from the stop on,
    // nothing was due and nothing can be missed.
    const stopped = compound({
      id: "c1",
      archived: true,
      schedule: {
        cadence: { type: "daily" },
        startDate: "2024-06-01",
        timeOfDay: "08:00",
      },
      scheduleHistory: [
        {
          effectiveFrom: "2024-06-01",
          cadence: { type: "daily" },
          timeOfDay: "08:00",
          dose: 250,
          unit: "mg",
        },
        {
          effectiveFrom: "2024-06-03",
          cadence: { type: "daily" },
          timeOfDay: "08:00",
          dose: 250,
          unit: "mg",
          stopped: true,
        },
      ],
    })
    const pts = computeAdherenceOver([stopped], {}, "2024-06-01", "2024-06-04")
    expect(pts.map((p) => p.due)).toEqual([1, 1, 0, 0])
  })

  it("leaves out an archived compound with NO stop marker rather than inventing misses", () => {
    // The regression this replaced: `archived` carries no date, so an unbounded
    // archived compound was due EVERY day to the end of the window. A compound
    // run for four weeks of a sixteen-week block reported "25%, 28 of 112" —
    // eighty-four missed doses that never existed, printed at the user on a
    // figure that reads as a statement about them.
    const orphan = compound({
      id: "c1",
      archived: true,
      schedule: {
        cadence: { type: "daily" },
        startDate: "2024-06-01",
        timeOfDay: "08:00",
      },
    })
    expect(computeAdherenceOver([orphan], {}, "2024-06-01", "2024-06-04")).toEqual([])
  })

  it("does not lose the last day of a window that crosses spring forward", () => {
    // Local midnights an hour apart across the transition made the span come out
    // a day short, so the final day of the window was never walked — and for a
    // block that is its close date.
    const pts = computeAdherenceOver([daily], {}, "2024-09-25", "2024-10-10")
    expect(pts.length).toBe(16)
    expect(pts[pts.length - 1].key).toBe("2024-10-10")
  })

  it("is empty for an inverted range rather than throwing", () => {
    expect(computeAdherenceOver([daily], {}, "2026-02-01", "2026-01-01")).toEqual([])
  })
})
