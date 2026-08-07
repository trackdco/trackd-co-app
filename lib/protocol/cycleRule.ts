/**
 * Cycles — an on/off pattern sitting ABOVE a compound's existing schedule
 * (Spec 06 · part two).
 *
 * A cycle is not a thing you log and it does not replace a schedule. It is a
 * gate: the schedule still decides which days a dose falls on, and the cycle
 * decides whether the compound is being run at all that day. One cycle governs
 * exactly one compound, and cycles are never named — a cycle is just its
 * compound.
 *
 * **Naming.** The Postgres `cycles` table is a different concept entirely (the
 * user's overall protocol run — the "Week 3 of 12" header and the cycle-ID stamp
 * on journal/weight/bloodwork). "Cycle" stays the user-facing word for BOTH, but
 * in code this one is a `CycleRule` so the two can never be confused. See
 * `lib/protocol/cycle.ts` for the other.
 *
 * Pure data + pure helpers; no React, no storage, no side effects
 * (`code-standards.md`).
 */

/* ------------------------------------------------------------------ palette */

// The twelve colours are shared with stacks (Spec 05), so they live in
// `lib/palette.ts` under neutral names. Re-exported here under the cycle-facing
// aliases so existing call sites keep reading naturally.
export {
  PALETTE_COLOURS as CYCLE_COLOURS,
  PALETTE_LABELS as CYCLE_COLOUR_LABELS,
  DEFAULT_PALETTE_COLOUR as DEFAULT_CYCLE_COLOUR,
  paletteColourVar as cycleColourVar,
  isPaletteColour as isCycleColour,
  type PaletteColour as CycleColour,
} from "@/lib/palette"

import {
  DEFAULT_PALETTE_COLOUR,
  isPaletteColour,
  type PaletteColour,
} from "@/lib/palette"

/* -------------------------------------------------------------------- model */

/**
 * How the compound alternates. `continuous` is a cycle with no off-period — it
 * exists so end conditions 2, 3 and 5 can apply to a compound that simply runs
 * until something stops it.
 */
export type CyclePattern =
  | { type: "continuous" }
  | { type: "onOff"; onDays: number; offDays: number }

/**
 * The five end conditions, and no others.
 *
 * `afterRounds` requires an `onOff` pattern — a round is one on-period plus one
 * off-period, which is meaningless without an off-period. `whenVialEmpty` is
 * offered only where storage is actually tracked (vials), gated by
 * {@link canEndOnVialEmpty}.
 */
export type CycleEnd =
  | { type: "never" }
  | { type: "onDate"; date: string }
  | { type: "afterRounds"; rounds: number }
  | { type: "whenVialEmpty" }

export interface CycleRule {
  pattern: CyclePattern
  end: CycleEnd
  colour: PaletteColour
  /** Local "YYYY-MM-DD" the on/off phase counts from. Before this, nothing is on. */
  anchor: string
}

/**
 * Resolution context for the one end condition that is not pure date maths.
 *
 * `vialEmptyOn` is the day the backing vial ACTUALLY ran dry, derived from dose
 * logs — a historical fact, not `est_empty_date`. The projection moves every time
 * a dose is logged, so using it would let past days silently rewrite themselves;
 * the fact does not move. Absent/null means the vial has not run out.
 */
export interface CycleContext {
  vialEmptyOn?: string | null
  /**
   * How many days between the cycle's anchor and the day being asked about were
   * PAUSED (Spec w2b-13, Step 6).
   *
   * Subtracted from the day offset before the on/off modulo, so paused days do
   * not advance the cycle clock: a twelve-week run paused for ten days is still
   * twelve weeks of dosing, finishing ten days later. This is arithmetic at read
   * time and never a write — see the pause module's header for why.
   */
  pausedDays?: number
  /**
   * How many paused days fall BEFORE a fixed end date, for a cycle whose end is
   * `onDate`.
   *
   * The effective end is the stored date plus this. Without it, pausing near the
   * end of a run just eats the tail. **`cycle_end_date` in the database never
   * moves** — writing it from a past day would destroy future schedule versions,
   * because `recordScheduleVersion` deletes every version dated after the one it
   * writes.
   */
  pausedBeforeEnd?: number
}

/** Whether "ends when the vial runs out" may be offered for this compound. Reuses
 *  the single vial test shared with the container artwork and the stock step. */
export { isVialForm as canEndOnVialEmpty } from "@/lib/containers/form"

/* ------------------------------------------------------------ db mapping */

/**
 * The seven cycle column names, in one place — used to strip them from a write
 * when `supabase/protocol/006` has not been applied yet (Postgres `42703`).
 *
 * This mapping lives HERE rather than in `lib/db/types.ts` because `stack.ts`
 * needs it for schedule VERSION rows and `types.ts` already imports `stack.ts` —
 * putting it there would close an import cycle.
 */
export const CYCLE_COLUMNS = [
  "cycle_anchor",
  "cycle_on_days",
  "cycle_off_days",
  "cycle_end_type",
  "cycle_end_date",
  "cycle_end_rounds",
  "cycle_colour",
] as const

export interface CycleColumns {
  cycle_anchor: string | null
  cycle_on_days: number | null
  cycle_off_days: number | null
  cycle_end_type: string | null
  cycle_end_date: string | null
  cycle_end_rounds: number | null
  cycle_colour: string | null
}

const CYCLE_END_TO_DB: Record<CycleEnd["type"], string> = {
  never: "never",
  onDate: "on_date",
  afterRounds: "after_rounds",
  whenVialEmpty: "when_vial_empty",
}

const EMPTY_CYCLE_COLUMNS: CycleColumns = {
  cycle_anchor: null,
  cycle_on_days: null,
  cycle_off_days: null,
  cycle_end_type: null,
  cycle_end_date: null,
  cycle_end_rounds: null,
  cycle_colour: null,
}

/** Local `CycleRule` → the seven cycle columns. The single mapping place, so a
 *  compound row and its version rows cannot drift apart. */
export function cycleRuleToColumns(
  cycle: CycleRule | undefined | null
): CycleColumns {
  if (!cycle) return { ...EMPTY_CYCLE_COLUMNS }
  const onOff = cycle.pattern.type === "onOff" ? cycle.pattern : null
  return {
    cycle_anchor: cycle.anchor,
    cycle_on_days: onOff ? onOff.onDays : null,
    cycle_off_days: onOff ? onOff.offDays : null,
    cycle_end_type: CYCLE_END_TO_DB[cycle.end.type],
    cycle_end_date: cycle.end.type === "onDate" ? cycle.end.date : null,
    cycle_end_rounds: cycle.end.type === "afterRounds" ? cycle.end.rounds : null,
    cycle_colour: cycle.colour,
  }
}

/** The inverse — cycle columns back into a `CycleRule`, or undefined when the
 *  row carries no cycle. */
export function cycleRuleFromColumns(r: Partial<CycleColumns>): CycleRule | undefined {
  if (!r.cycle_anchor) return undefined

  const pattern: CyclePattern =
    r.cycle_on_days && r.cycle_on_days > 0
      ? { type: "onOff", onDays: r.cycle_on_days, offDays: r.cycle_off_days ?? 0 }
      : { type: "continuous" }

  let end: CycleEnd = { type: "never" }
  if (r.cycle_end_type === "on_date" && r.cycle_end_date) {
    end = { type: "onDate", date: r.cycle_end_date }
  } else if (
    r.cycle_end_type === "after_rounds" &&
    r.cycle_end_rounds &&
    pattern.type === "onOff"
  ) {
    end = { type: "afterRounds", rounds: r.cycle_end_rounds }
  } else if (r.cycle_end_type === "when_vial_empty") {
    end = { type: "whenVialEmpty" }
  }

  return {
    pattern,
    end,
    colour: isPaletteColour(r.cycle_colour) ? r.cycle_colour : DEFAULT_PALETTE_COLOUR,
    anchor: r.cycle_anchor,
  }
}

/* --------------------------------------------------------------- resolution */

/**
 * Whole days since the epoch for a "YYYY-MM-DD" key.
 *
 * Built through `Date.UTC`, NOT a local `new Date(y, m, d)`. Dividing a LOCAL
 * midnight by a UTC day length only holds where the offset never crosses zero:
 * in Europe/London two calendar days collapse onto one number on 29–30 March,
 * and a number is skipped on 26 October — so a cycle's on/off phase flips a day
 * early and an on-period runs eight days. The key is a calendar date with no
 * time in it, so UTC is the correct frame to count it in.
 */
function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return Math.floor(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
  )
}

/** Length of one round: an on-period plus its off-period. */
export function cyclePeriod(pattern: CyclePattern): number | null {
  if (pattern.type !== "onOff") return null
  const period = pattern.onDays + pattern.offDays
  return period > 0 ? period : null
}

export interface CycleStatus {
  /** Is the compound being run on this day? */
  on: boolean
  /** Has the cycle finished for good by this day? */
  ended: boolean
  /** Not started yet — the day precedes the anchor. */
  pending: boolean
  /** 0-based round (one on-period + one off-period), null when continuous. */
  round: number | null
  /** Days remaining in the current on- or off-stretch, null when continuous. */
  daysLeftInPhase: number | null
}

const OFF: CycleStatus = {
  on: false,
  ended: false,
  pending: false,
  round: null,
  daysLeftInPhase: null,
}

/**
 * Where a date falls in the cycle.
 *
 * **No cycle means always on** — a compound without one behaves exactly as it did
 * before cycles existed, so the feature costs nothing until it is used.
 */
export function cycleStatusOn(
  cycle: CycleRule | undefined | null,
  dateKey: string,
  ctx?: CycleContext
): CycleStatus {
  if (!cycle) {
    return { on: true, ended: false, pending: false, round: null, daysLeftInPhase: null }
  }

  const day = dayNumber(dateKey)
  const anchor = dayNumber(cycle.anchor)
  if (day === null || anchor === null) return OFF

  // Before the cycle begins nothing is due — but it has not ended either.
  if (day < anchor) return { ...OFF, pending: true }

  // Paused days do not advance the cycle clock (Spec w2b-13, Step 6). Clamped
  // at 0 so a nonsense count can only ever leave the cycle where it was, never
  // push it backwards before its own anchor.
  const elapsed = Math.max(0, day - anchor - Math.max(0, ctx?.pausedDays ?? 0))
  const period = cyclePeriod(cycle.pattern)
  const round = period ? Math.floor(elapsed / period) : null

  if (hasEndedBy(cycle, dateKey, day, anchor, round, ctx)) {
    return { ...OFF, ended: true, round }
  }

  // Continuous: on every day the schedule says so, until an end condition bites.
  if (cycle.pattern.type !== "onOff" || period === null) {
    return { on: true, ended: false, pending: false, round, daysLeftInPhase: null }
  }

  const phase = elapsed % period
  const on = phase < cycle.pattern.onDays
  const daysLeftInPhase = on
    ? cycle.pattern.onDays - phase
    : period - phase

  return { on, ended: false, pending: false, round, daysLeftInPhase }
}

/** Is the compound being run on this day? The predicate `isDueOnFor` gates on. */
export function isOnCycle(
  cycle: CycleRule | undefined | null,
  dateKey: string,
  ctx?: CycleContext
): boolean {
  return cycleStatusOn(cycle, dateKey, ctx).on
}

function hasEndedBy(
  cycle: CycleRule,
  dateKey: string,
  day: number,
  anchor: number,
  round: number | null,
  ctx?: CycleContext
): boolean {
  switch (cycle.end.type) {
    case "never":
      return false
    case "onDate": {
      const end = dayNumber(cycle.end.date)
      // The end date is the last day ON, so the cycle ends the day after — and
      // it MOVES OUT by however many days were paused before it, so pausing near
      // the end of a run does not simply eat the tail. Read-time only; the
      // stored `cycle_end_date` is never rewritten (see `CycleContext`).
      return end !== null && day > end + Math.max(0, ctx?.pausedBeforeEnd ?? 0)
    }
    case "afterRounds":
      // Rounds are 0-based, so round N means N complete rounds have passed.
      return round !== null && round >= cycle.end.rounds
    case "whenVialEmpty": {
      const empty = ctx?.vialEmptyOn ? dayNumber(ctx.vialEmptyOn) : null
      // The vial running dry ends the cycle the day AFTER the last dose it gave.
      return empty !== null && day > empty
    }
  }
}

/* ------------------------------------------------------------------ display */

/**
 * Are these the same rule? Used to tell an edit that actually changed the cycle
 * from one that merely re-saved it — only a real change should write a new
 * version, or every save would litter the trail with identical entries.
 */
export function sameCycle(
  a: CycleRule | null | undefined,
  b: CycleRule | null | undefined
): boolean {
  if (!a || !b) return !a && !b
  if (a.anchor !== b.anchor || a.colour !== b.colour) return false
  if (a.pattern.type !== b.pattern.type) return false
  if (a.pattern.type === "onOff" && b.pattern.type === "onOff") {
    if (
      a.pattern.onDays !== b.pattern.onDays ||
      a.pattern.offDays !== b.pattern.offDays
    ) {
      return false
    }
  }
  if (a.end.type !== b.end.type) return false
  if (a.end.type === "onDate" && b.end.type === "onDate") {
    return a.end.date === b.end.date
  }
  if (a.end.type === "afterRounds" && b.end.type === "afterRounds") {
    return a.end.rounds === b.end.rounds
  }
  return true
}

/** The cycle's pattern in the calendar key's words — "7 on / 7 off". */
export function formatCyclePattern(pattern: CyclePattern): string {
  if (pattern.type !== "onOff") return "Continuous"
  return `${pattern.onDays} on / ${pattern.offDays} off`
}



/** Whether an end condition is offerable for a given pattern and compound. */
export function availableCycleEnds(
  pattern: CyclePattern,
  opts: { vialTracked: boolean }
): CycleEnd["type"][] {
  // "No end" is offered only for an ON/OFF pattern. A CONTINUOUS cycle that
  // never ends is measurably identical to having no cycle at all — it runs every
  // scheduled day forever — so offering it invites the user to configure
  // something that does nothing, and then shows them a cycle card for it. The
  // one behaviour it does add is a second, hidden start date, which the
  // compound's own "Starts" field already does properly. (Adrian, 2026-07-31.)
  //
  // Only the OFFER changes: `isOnCycle` still resolves an existing
  // continuous + never rule exactly as before, so nothing already saved moves.
  const ends: CycleEnd["type"][] = pattern.type === "onOff" ? ["never", "onDate"] : ["onDate"]
  // A round is one on-period plus one off-period — meaningless without both.
  if (pattern.type === "onOff") ends.push("afterRounds")
  if (opts.vialTracked && VIAL_END_SUPPORTED) ends.push("whenVialEmpty")
  return ends
}

/**
 * **"Ends when the vial runs out" is NOT offered yet.**
 *
 * The rule itself is implemented and tested (`hasEndedBy` → `when_vial_empty`),
 * and it resolves correctly the moment a caller supplies
 * {@link CycleContext.vialEmptyOn}. What does not exist is the PRODUCER of that
 * date: nothing derives "the day this compound's vial actually ran dry" from
 * `dose_logs` + `v_inventory_math` and threads it into the gate.
 *
 * Until it does, `ctx` is always undefined at every call site, so the condition
 * would resolve as "never ends" — a user could pick it and it would silently do
 * nothing. Offering a control that does nothing is worse than not offering it,
 * so the option is withheld rather than left dead.
 *
 * Wiring it is not a small change: `isDueOnFor` is a pure SYNCHRONOUS function
 * called by the week strip, the calendar grid, consistency and Next Dose, and
 * the empty date needs a Postgres read. It wants a per-compound map resolved
 * once per screen and threaded down, which is its own pass.
 */
export const VIAL_END_SUPPORTED = false
