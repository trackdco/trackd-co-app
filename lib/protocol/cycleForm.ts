/**
 * THE CYCLE SHEET'S FORM (`components/protocol/CycleRuleSheet.tsx`), as pure
 * data: what the fields hold, which end conditions are on offer, what is
 * missing, and the rule a Save writes.
 *
 * ## Save is never dead (W47, Adrian 2026-09-26)
 *
 * "Cycles will not save a cycle." A Continuous pattern offers one end, a date,
 * and a new cycle's end date starts empty, so the sheet's Save sat disabled
 * with nothing on screen saying why. The sheet now keeps Save live and, when
 * something is missing, says what ({@link cycleDraftIssue}) and takes the user
 * to it. The first issue in the order the fields are drawn wins, so the sheet
 * always points at the highest field that needs a hand.
 *
 * Pure: no React, no storage (`code-standards.md`).
 */
import {
  availableCycleEnds,
  DEFAULT_CYCLE_COLOUR,
  type CycleColour,
  type CycleEnd,
  type CyclePattern,
  type CycleRule,
} from "@/lib/protocol/cycleRule"

/** The sheet's fields as typed: numbers are the pad's strings. */
export interface CycleDraft {
  /** On / off (true) or Continuous (false). */
  repeats: boolean
  onDays: string
  offDays: string
  /** The end the user last chose. Read through {@link draftEndType}: it may not
   *  be on offer for the pattern now chosen. */
  endType: CycleEnd["type"]
  /** "YYYY-MM-DD", or "" while none is picked. */
  endDate: string
  rounds: string
  colour: CycleColour
  /** The start, "YYYY-MM-DD". */
  anchor: string
}

/** A field the sheet can point at. The number fields are the pad's ids. */
export type CycleField = "onDays" | "offDays" | "anchor" | "endDate" | "rounds"

export interface CycleIssue {
  field: CycleField
  /** What to do, in a few words, shown under the field. */
  reason: string
}

export interface CycleFormOptions {
  /** Whether the compound's stock is tracked in vials (the vial end). */
  vialTracked: boolean
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** A whole number of days or rounds from the pad, or null when empty. */
function count(raw: string): number | null {
  const t = raw.trim()
  if (!/^\d+$/.test(t)) return null
  return Number(t)
}

/**
 * The sheet's opening values: the rule being edited, or a new cycle from today.
 *
 * A NEW cycle opens On / off (7 on, 7 off, no end), which saves as it stands.
 * It used to open Continuous, whose only end is a date the new cycle did not
 * have: the sheet opened with Save already dead (W47).
 */
export function draftFromCycle(cycle: CycleRule | null, todayKey: string): CycleDraft {
  const onOff = cycle?.pattern.type === "onOff" ? cycle.pattern : null
  return {
    repeats: cycle ? onOff !== null : true,
    onDays: String(onOff?.onDays ?? 7),
    offDays: String(onOff?.offDays ?? 7),
    endType: cycle?.end.type ?? "never",
    endDate: cycle?.end.type === "onDate" ? cycle.end.date : "",
    rounds: cycle?.end.type === "afterRounds" ? String(cycle.end.rounds) : "4",
    colour: cycle?.colour ?? DEFAULT_CYCLE_COLOUR,
    anchor: cycle?.anchor ?? todayKey,
  }
}

/** The pattern as the draft reads now. An empty "Days on" reads as 1 here; the
 *  issue check stops a Save before it can be written. */
export function draftPattern(d: CycleDraft): CyclePattern {
  if (!d.repeats) return { type: "continuous" }
  return {
    type: "onOff",
    onDays: Math.max(1, count(d.onDays) ?? 0),
    offDays: Math.max(0, count(d.offDays) ?? 0),
  }
}

/** The ends on offer for the draft's pattern, in the order they are drawn. */
export function draftEnds(d: CycleDraft, opts: CycleFormOptions): CycleEnd["type"][] {
  return availableCycleEnds(draftPattern(d), opts)
}

/**
 * The end in force: the one chosen when it is on offer, else the first that
 * is. Turning the repeat off takes "No end" and "After rounds" with it (a
 * continuous cycle that never ends is no cycle, and a round needs an off
 * period), so a Continuous pattern always lands on "On a date".
 */
export function draftEndType(d: CycleDraft, opts: CycleFormOptions): CycleEnd["type"] {
  const offered = draftEnds(d, opts)
  return offered.includes(d.endType) ? d.endType : offered[0]
}

/**
 * The first thing stopping a Save, in the order the fields are drawn (the
 * pattern's days, the start, the end), or null when the draft can be saved.
 *
 * - "Days on" empty or 0: a cycle has to be on at some point.
 * - "Days off" empty: 0 is allowed (it saves and runs every day in rounds),
 *   but an empty field is a question left unanswered.
 * - A start that is not a day: the cycle would be off on every date and the
 *   compound would vanish from the log with nothing to explain it.
 * - An end date missing, or before the start: saving one before the start
 *   ended the cycle the instant it was written.
 * - "After rounds" with no rounds.
 */
export function cycleDraftIssue(d: CycleDraft, opts: CycleFormOptions): CycleIssue | null {
  if (d.repeats) {
    const on = count(d.onDays)
    if (on === null || on < 1) return { field: "onDays", reason: "Enter at least 1 day on." }
    if (count(d.offDays) === null) return { field: "offDays", reason: "Enter the days off." }
  }
  if (!DATE_KEY.test(d.anchor)) return { field: "anchor", reason: "Pick a start date." }
  const end = draftEndType(d, opts)
  if (end === "onDate") {
    if (!DATE_KEY.test(d.endDate)) return { field: "endDate", reason: "Pick an end date." }
    if (d.endDate < d.anchor) return { field: "endDate", reason: "The end is before the start." }
  }
  if (end === "afterRounds") {
    const rounds = count(d.rounds)
    if (rounds === null || rounds < 1) return { field: "rounds", reason: "Enter at least 1 round." }
  }
  return null
}

/** The rule a Save writes, or null while {@link cycleDraftIssue} has something to say. */
export function cycleFromDraft(d: CycleDraft, opts: CycleFormOptions): CycleRule | null {
  if (cycleDraftIssue(d, opts)) return null
  const endType = draftEndType(d, opts)
  let end: CycleEnd
  switch (endType) {
    case "onDate":
      end = { type: "onDate", date: d.endDate }
      break
    case "afterRounds":
      end = { type: "afterRounds", rounds: count(d.rounds) ?? 1 }
      break
    case "whenVialEmpty":
      end = { type: "whenVialEmpty" }
      break
    default:
      end = { type: "never" }
  }
  return { pattern: draftPattern(d), end, colour: d.colour, anchor: d.anchor }
}

/** What a pattern means, in one line under its switch (W28). */
export function patternMeaning(repeats: boolean): string {
  return repeats ? "Days on, then days off, repeating." : "Every scheduled day, until the end date."
}

/** "One round is 5 days on and 2 off." Null when the pattern has no rounds. */
export function roundWords(d: CycleDraft): string | null {
  const p = draftPattern(d)
  if (p.type !== "onOff") return null
  return `One round is ${p.onDays} ${p.onDays === 1 ? "day" : "days"} on and ${p.offDays} off.`
}
