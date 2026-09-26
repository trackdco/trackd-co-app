import { describe, expect, it } from "vitest"

import {
  cycleDraftIssue,
  cycleFromDraft,
  draftEndType,
  draftEnds,
  draftFromCycle,
  patternMeaning,
  roundWords,
  type CycleDraft,
} from "@/lib/protocol/cycleForm"
import { cycleRuleFromColumns, cycleRuleToColumns, type CycleRule } from "@/lib/protocol/cycleRule"

const T = "2026-09-26"
const opts = { vialTracked: false }
const fresh = (patch: Partial<CycleDraft> = {}): CycleDraft => ({ ...draftFromCycle(null, T), ...patch })

describe("W47: a new Continuous cycle can be saved, and Save always says what is missing", () => {
  it("reproduces the bug: a new cycle switched to Continuous has no end date and nothing else to pick", () => {
    const d = fresh({ repeats: false })
    // Continuous offers one end, a date, and the new cycle's date starts empty.
    expect(draftEnds(d, opts)).toEqual(["onDate"])
    expect(draftEndType(d, opts)).toBe("onDate")
    expect(d.endDate).toBe("")
    // The old sheet disabled Save here with no words. Now the reason is named,
    // and it points at the end date so the sheet can open its calendar.
    expect(cycleDraftIssue(d, opts)).toEqual({ field: "endDate", reason: "Pick an end date." })
    expect(cycleFromDraft(d, opts)).toBeNull()
  })

  it("saves the Continuous cycle once an end date is picked", () => {
    const d = fresh({ repeats: false, endDate: "2026-12-18" })
    expect(cycleDraftIssue(d, opts)).toBeNull()
    expect(cycleFromDraft(d, opts)).toEqual({
      pattern: { type: "continuous" },
      end: { type: "onDate", date: "2026-12-18" },
      colour: d.colour,
      anchor: T,
    })
  })

  it("a Continuous cycle may end on the day it starts, never before", () => {
    expect(cycleDraftIssue(fresh({ repeats: false, endDate: T }), opts)).toBeNull()
    expect(cycleDraftIssue(fresh({ repeats: false, endDate: "2026-09-25" }), opts)).toEqual({
      field: "endDate",
      reason: "The end is before the start.",
    })
  })

  it("a start moved past the end date is caught at Save, not saved as an ended cycle", () => {
    const d = fresh({ repeats: false, endDate: "2026-10-01", anchor: "2026-10-05" })
    expect(cycleDraftIssue(d, opts)?.field).toBe("endDate")
    expect(cycleFromDraft(d, opts)).toBeNull()
  })

  it("a cleared start is named before the end", () => {
    expect(cycleDraftIssue(fresh({ anchor: "" }), opts)).toEqual({ field: "anchor", reason: "Pick a start date." })
  })
})

describe("the other paths through the sheet", () => {
  it("W47: a new cycle opens On / off (7 on, 7 off, no end) and saves as it opens, never with Save dead", () => {
    const d = fresh()
    expect(d.repeats).toBe(true)
    expect(draftEndType(d, opts)).toBe("never")
    expect(cycleFromDraft(d, opts)).toEqual({
      pattern: { type: "onOff", onDays: 7, offDays: 7 },
      end: { type: "never" },
      colour: d.colour,
      anchor: T,
    })
  })

  it("On / off: days on must be 1 or more, days off may be 0 but not empty", () => {
    expect(cycleDraftIssue(fresh({ onDays: "" }), opts)).toEqual({ field: "onDays", reason: "Enter at least 1 day on." })
    expect(cycleDraftIssue(fresh({ onDays: "0" }), opts)?.field).toBe("onDays")
    expect(cycleDraftIssue(fresh({ offDays: "" }), opts)).toEqual({ field: "offDays", reason: "Enter the days off." })
    expect(cycleFromDraft(fresh({ offDays: "0" }), opts)?.pattern).toEqual({ type: "onOff", onDays: 7, offDays: 0 })
  })

  it("days on are only asked of an On / off pattern", () => {
    expect(cycleDraftIssue(fresh({ repeats: false, onDays: "", endDate: "2026-11-01" }), opts)).toBeNull()
  })

  it("after rounds: needs 1 or more, and writes the number typed", () => {
    expect(cycleDraftIssue(fresh({ endType: "afterRounds", rounds: "" }), opts)).toEqual({
      field: "rounds",
      reason: "Enter at least 1 round.",
    })
    expect(cycleDraftIssue(fresh({ endType: "afterRounds", rounds: "0" }), opts)?.field).toBe("rounds")
    expect(cycleFromDraft(fresh({ endType: "afterRounds", rounds: "3" }), opts)?.end).toEqual({
      type: "afterRounds",
      rounds: 3,
    })
  })

  it("On / off with an end date checks the date the same way", () => {
    expect(cycleDraftIssue(fresh({ endType: "onDate" }), opts)?.field).toBe("endDate")
    expect(cycleFromDraft(fresh({ endType: "onDate", endDate: "2026-11-30" }), opts)?.end).toEqual({
      type: "onDate",
      date: "2026-11-30",
    })
  })

  it("switching to Continuous drops rounds and no-end for the date, and back again restores them", () => {
    const rounds = fresh({ endType: "afterRounds", rounds: "3" })
    expect(draftEndType({ ...rounds, repeats: false }, opts)).toBe("onDate")
    expect(draftEndType(rounds, opts)).toBe("afterRounds")
  })

  it("the fields asked for come first: the days, then the start, then the end", () => {
    const d = fresh({ onDays: "", anchor: "", endType: "onDate", endDate: "" })
    expect(cycleDraftIssue(d, opts)?.field).toBe("onDays")
    expect(cycleDraftIssue({ ...d, onDays: "5" }, opts)?.field).toBe("anchor")
    expect(cycleDraftIssue({ ...d, onDays: "5", anchor: T }, opts)?.field).toBe("endDate")
  })

  it("the vial end is never offered while nothing can resolve it (ruling 10)", () => {
    expect(draftEnds(fresh(), { vialTracked: true })).not.toContain("whenVialEmpty")
    expect(draftEnds(fresh({ repeats: false }), { vialTracked: true })).not.toContain("whenVialEmpty")
  })
})

describe("editing a saved cycle", () => {
  const saved: CycleRule[] = [
    { pattern: { type: "onOff", onDays: 5, offDays: 2 }, end: { type: "never" }, colour: "teal", anchor: "2026-09-01" },
    { pattern: { type: "onOff", onDays: 42, offDays: 14 }, end: { type: "afterRounds", rounds: 3 }, colour: "indigo", anchor: "2026-08-10" },
    { pattern: { type: "onOff", onDays: 14, offDays: 7 }, end: { type: "onDate", date: "2026-12-01" }, colour: "rosewood", anchor: "2026-09-10" },
    { pattern: { type: "continuous" }, end: { type: "onDate", date: "2026-11-15" }, colour: "bronze", anchor: "2026-09-20" },
  ]

  it("opens on the rule as saved and saves it back unchanged", () => {
    for (const rule of saved) {
      const d = draftFromCycle(rule, T)
      expect(cycleDraftIssue(d, opts)).toBeNull()
      expect(cycleFromDraft(d, opts)).toEqual(rule)
    }
  })

  it("what it saves survives the database's columns", () => {
    for (const rule of saved) {
      const out = cycleFromDraft(draftFromCycle(rule, T), opts)!
      expect(cycleRuleFromColumns(cycleRuleToColumns(out))).toEqual(rule)
    }
  })

  it("an old Continuous cycle with no end asks for an end date rather than saving what is no longer offered", () => {
    const legacy: CycleRule = { pattern: { type: "continuous" }, end: { type: "never" }, colour: "teal", anchor: "2026-09-01" }
    const d = draftFromCycle(legacy, T)
    expect(cycleDraftIssue(d, opts)).toEqual({ field: "endDate", reason: "Pick an end date." })
  })
})

describe("the words (W28)", () => {
  it("says what each pattern means in one line", () => {
    expect(patternMeaning(false)).toBe("Every scheduled day, until the end date.")
    expect(patternMeaning(true)).toBe("Days on, then days off, repeating.")
  })

  it("says what one round is", () => {
    expect(roundWords(fresh({ onDays: "5", offDays: "2" }))).toBe("One round is 5 days on and 2 off.")
    expect(roundWords(fresh({ onDays: "1", offDays: "0" }))).toBe("One round is 1 day on and 0 off.")
    expect(roundWords(fresh({ repeats: false }))).toBeNull()
  })

  it("no em dashes and no exclamation marks in anything the form says", () => {
    const words = [
      patternMeaning(true),
      patternMeaning(false),
      roundWords(fresh())!,
      ...(["onDays", "offDays", "anchor", "endDate", "rounds"] as const).map(
        (f) =>
          cycleDraftIssue(
            {
              onDays: { ...fresh(), onDays: "" },
              offDays: { ...fresh(), offDays: "" },
              anchor: { ...fresh(), anchor: "" },
              endDate: { ...fresh(), repeats: false },
              rounds: { ...fresh(), endType: "afterRounds" as const, rounds: "" },
            }[f],
            opts,
          )!.reason,
      ),
    ]
    for (const w of words) expect(w).not.toMatch(/[—!]/)
  })
})
