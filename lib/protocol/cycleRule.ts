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

/**
 * The twelve approved cycle colours. Deep rather than pastel, none implying good
 * or bad, none clashing with amber or the category hues. Values live as
 * `--cycle-*` tokens in `globals.css` (the only place hex may appear) and are
 * documented in `ui-context.md`.
 */
export const CYCLE_COLOURS = [
  "slate",
  "steel",
  "teal",
  "moss",
  "olive",
  "bronze",
  "clay",
  "rosewood",
  "mauve",
  "plum",
  "indigo",
  "stone",
] as const

export type CycleColour = (typeof CYCLE_COLOURS)[number]

export const CYCLE_COLOUR_LABELS: Record<CycleColour, string> = {
  slate: "Slate",
  steel: "Steel",
  teal: "Teal",
  moss: "Moss",
  olive: "Olive",
  bronze: "Bronze",
  clay: "Clay",
  rosewood: "Rosewood",
  mauve: "Mauve",
  plum: "Plum",
  indigo: "Indigo",
  stone: "Stone",
}

export const DEFAULT_CYCLE_COLOUR: CycleColour = "slate"

/** The CSS value for a cycle colour — a token reference, never a literal. */
export function cycleColourVar(colour: CycleColour): string {
  return `var(--cycle-${colour})`
}

export function isCycleColour(value: unknown): value is CycleColour {
  return (
    typeof value === "string" && (CYCLE_COLOURS as readonly string[]).includes(value)
  )
}

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
  colour: CycleColour
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
    colour: isCycleColour(r.cycle_colour) ? r.cycle_colour : DEFAULT_CYCLE_COLOUR,
    anchor: r.cycle_anchor,
  }
}

/* --------------------------------------------------------------- resolution */

/** Whole local days since the Unix epoch for a "YYYY-MM-DD" key (DST-safe). */
function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Math.floor(d.getTime() / 86_400_000)
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

  const elapsed = day - anchor
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
      // The end date is the last day ON, so the cycle ends the day after.
      return end !== null && day > end
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
  const ends: CycleEnd["type"][] = ["never", "onDate"]
  // A round is one on-period plus one off-period — meaningless without both.
  if (pattern.type === "onOff") ends.push("afterRounds")
  if (opts.vialTracked) ends.push("whenVialEmpty")
  return ends
}
