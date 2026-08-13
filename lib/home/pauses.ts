/**
 * Pausing a compound — a bounded interval, and everything derived from it.
 *
 * **A pause is an INTERVAL, and every consequence of it is computed at read
 * time.** Nothing about a pause is ever stored as a derived value: not "is this
 * compound paused", not "how many days are left", not a rewritten end date. That
 * is the same no-stored-derived rule inventory follows
 * (`supabase/trackd_schema_v0_4_2.sql:762-767`), and here it buys something
 * specific — **backdating a pause costs nothing**. There is no backfill and no
 * migration; days already recorded as missed simply stop resolving that way at
 * the next render, because "missed" is itself derived from due-and-unlogged.
 *
 * **There is no job that resumes a pause.** A pause with an end date resumes
 * because the date comparison stops matching, not because anything ran. The only
 * writes are creating a pause and ending one early.
 *
 * Pure data + pure helpers, no React and no storage (`code-standards.md`).
 * Everything here is SYNCHRONOUS, because `isDueOnFor` calls it and that
 * function is pure and synchronous by contract — the week strip, the calendar
 * grid, consistency and Next Dose all go through it.
 */
// Type-only, so this module still pulls in nothing at runtime.
import type { CycleContext } from "@/lib/protocol/cycleRule"

/**
 * One stretch during which a compound is not being taken.
 *
 * **Both ends are INCLUSIVE**: `startedOn` is the first paused day and `endsOn`
 * is the last. Resuming today therefore writes `endsOn` as YESTERDAY, so today
 * is due again. Undefined inclusivity is the single most likely source of an
 * off-by-one here, and an off-by-one shows up as a phantom missed day.
 */
export interface Pause {
  id: string
  /** First paused day, "YYYY-MM-DD", inclusive. */
  startedOn: string
  /** Last paused day, inclusive. Null = indefinite, until ended by hand. */
  endsOn: string | null
  /**
   * Shared by the pauses one "pause whole stack" action created
   * (`supabase/protocol/018`). It is what lets Resume restore only what THAT
   * action paused, leaving a member paused separately still paused.
   */
  groupId?: string | null
}

/** `YYYY-MM-DD` → a day index, counted in UTC so no local offset applies. The
 *  same arithmetic `cycleRule.ts` uses, kept identical on purpose. */
function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return Math.floor(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
  )
}

/** A day index back to `YYYY-MM-DD`. */
export function dayKeyFromNumber(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10)
}

/** The day before `key`. What Resume writes as `endsOn` so today is due again. */
export function dayBefore(key: string): string {
  const n = dayNumber(key)
  return n === null ? key : dayKeyFromNumber(n - 1)
}

/** Half-open `[start, end)` day ranges, merged and sorted. `end` is exclusive so
 *  a length is a subtraction; `Infinity` is an indefinite pause. */
type Span = { start: number; end: number }

/**
 * The pauses as merged, non-overlapping spans.
 *
 * Merging is not decoration: overlapping pauses would otherwise be counted
 * twice, and a double-counted day subtracts two days from the cycle clock for
 * one day of rest. App logic prevents overlaps on the way in — a new pause
 * covering an existing one extends it rather than inserting a second — but this
 * function is what the ARITHMETIC depends on, and it must be right even if a
 * stale device record or a hand-edited row gets through.
 */
function spansOf(pauses: readonly Pause[] | undefined): Span[] {
  if (!pauses || pauses.length === 0) return []
  const raw: Span[] = []
  for (const p of pauses) {
    const start = dayNumber(p.startedOn)
    if (start === null) continue
    // `endsOn` is the LAST paused day, so the exclusive end is the day after.
    const end = p.endsOn === null ? Number.POSITIVE_INFINITY : (dayNumber(p.endsOn) ?? null)
    if (end === null) continue
    // `end` is EXCLUSIVE (the day after `endsOn`), so a one-day pause has
    // `end === start + 1` and a zero-length one would have `end === start`.
    // This guard was `<=`, which threw away single-day pauses — and a single day
    // is the SHORTEST the sheet offers, so the compound showed as paused in one
    // place and due in another on the same day.
    if (end < start) continue // a pause that ends before it starts is not one
    raw.push({ start, end: end === Number.POSITIVE_INFINITY ? end : end + 1 })
  }
  if (raw.length === 0) return []
  raw.sort((a, b) => a.start - b.start)
  const out: Span[] = [raw[0]]
  for (const s of raw.slice(1)) {
    const last = out[out.length - 1]
    if (s.start <= last.end) last.end = Math.max(last.end, s.end)
    else out.push(s)
  }
  return out
}

/**
 * Is the compound paused on this day?
 *
 * The gate `isDueOnFor` uses. A paused day returns `none` rather than `missed`,
 * because nothing was due — which is the whole reason a pause is invisible to
 * adherence rather than being compensated for after the fact.
 */
export function isPausedOn(
  pauses: readonly Pause[] | undefined,
  dateKey: string
): boolean {
  const day = dayNumber(dateKey)
  if (day === null) return false
  for (const s of spansOf(pauses)) {
    if (day >= s.start && day < s.end) return true
  }
  return false
}

/**
 * How many paused days fall in `[fromKey, toKey)` — **inclusive of `from`,
 * EXCLUSIVE of `to`**.
 *
 * Half-open because of what it is subtracted from. The cycle clock reads
 * `elapsed = day - anchor`, which counts the days BEFORE `day`, so the paused
 * days to remove from it are likewise the ones before `day`. Counting `to`
 * itself would take one day too many off every cycle and shift the whole
 * on/off pattern by a day.
 *
 * An indefinite pause is counted up to `to`, not to infinity: "how many days of
 * this window were paused" has a finite answer even when the pause does not.
 */
export function pausedDaysBetween(
  pauses: readonly Pause[] | undefined,
  fromKey: string,
  toKey: string
): number {
  const from = dayNumber(fromKey)
  const to = dayNumber(toKey)
  if (from === null || to === null || to <= from) return 0
  let total = 0
  for (const s of spansOf(pauses)) {
    const start = Math.max(s.start, from)
    const end = Math.min(s.end, to)
    if (end > start) total += end - start
  }
  return total
}

/**
 * The cycle context a set of pauses produces on a day — the paused-day counts
 * `isOnCycle` subtracts so a pause does not advance the cycle clock.
 *
 * Takes the PAUSES rather than a compound, so the push runner can build the same
 * context from Postgres rows. It lived on `StackCompound` and only ever read
 * `c.pauses`, and the mirror consequently called `isOnCycle` with no context at
 * all: a cycled compound that had been paused was announced as due on days the
 * app greyed out as off-cycle, and then nagged for missing them. Same shape of
 * failure as the cycle gate before it existed, one layer down.
 *
 * Cheap on the common path: no pauses or no cycle returns the caller's own
 * context untouched.
 */
export function cyclePauseContext(
  pauses: readonly Pause[] | undefined,
  cycle: { anchor: string; end: { type: string; date?: string } } | undefined,
  dateKey: string,
  base?: CycleContext
): CycleContext | undefined {
  if (!pauses || pauses.length === 0 || !cycle) return base
  const pausedDays = pausedDaysBetween(pauses, cycle.anchor, dateKey)
  const pausedBeforeEnd =
    cycle.end.type === "onDate" && cycle.end.date
      ? pausedDaysBetween(pauses, cycle.anchor, cycle.end.date)
      : 0
  return { ...base, pausedDays, pausedBeforeEnd }
}

/** The pause covering this day, if any — what the sheet opens on when the user
 *  taps Pause on something already paused. */
export function activePause(
  pauses: readonly Pause[] | undefined,
  dateKey: string
): Pause | null {
  const day = dayNumber(dateKey)
  if (day === null) return null
  for (const p of pauses ?? []) {
    const start = dayNumber(p.startedOn)
    if (start === null || day < start) continue
    if (p.endsOn === null) return p
    const end = dayNumber(p.endsOn)
    if (end !== null && day <= end) return p
  }
  return null
}

/**
 * The day the compound comes back, or null when nothing says.
 *
 * Null covers both "not paused" and "paused indefinitely", and the caller has to
 * tell them apart itself — an indefinite pause has no resume date, and inventing
 * one would be exactly the guess this module exists to avoid.
 */
export function resumesOn(
  pauses: readonly Pause[] | undefined,
  dateKey: string
): string | null {
  const p = activePause(pauses, dateKey)
  if (!p || p.endsOn === null) return null
  const end = dayNumber(p.endsOn)
  return end === null ? null : dayKeyFromNumber(end + 1)
}

/** How many days of an active pause are still to come, counting from `dateKey`.
 *  Null for an indefinite pause — there is no answer — and 0 when not paused. */
export function pausedDaysRemaining(
  pauses: readonly Pause[] | undefined,
  dateKey: string
): number | null {
  const p = activePause(pauses, dateKey)
  if (!p) return 0
  if (p.endsOn === null) return null
  const day = dayNumber(dateKey)
  const end = dayNumber(p.endsOn)
  if (day === null || end === null) return 0
  return Math.max(0, end - day + 1)
}

/** Guard a stored pause on the way out of storage or off the wire. */
export function normalizePause(raw: unknown): Pause | null {
  if (!raw || typeof raw !== "object") return null
  const p = raw as Record<string, unknown>
  if (typeof p.id !== "string" || !p.id) return null
  if (typeof p.startedOn !== "string" || dayNumber(p.startedOn) === null) return null
  const endsOn =
    typeof p.endsOn === "string" && dayNumber(p.endsOn) !== null ? p.endsOn : null
  // An end before the start is not a shorter pause, it is a corrupt one — and
  // treating it as indefinite would silently pause the compound forever.
  if (endsOn !== null && endsOn < p.startedOn) return null
  return {
    id: p.id,
    startedOn: p.startedOn,
    endsOn,
    ...(typeof p.groupId === "string" && p.groupId ? { groupId: p.groupId } : {}),
  }
}

/**
 * The day a compound's cadence should count from, given its pauses.
 *
 * **After a pause, the grid RE-ANCHORS to the resume day** (Adrian, 2026-08-07,
 * overturning the earlier call). An every-third-day compound paused for a week
 * is due on the day it comes back, then every third day from there — rather than
 * picking up the grid it would have been on had it never stopped.
 *
 * The trade this accepts, stated because it is real: a pause now shifts every
 * FUTURE dose date, not just the ones inside it. Two pauses in a run will drift
 * the calendar further from the original start date each time. That was the
 * argument for the other behaviour; landing the next dose on the day you
 * actually resume was judged worth it.
 *
 * Returns the compound's own start date when no pause has ENDED on or before
 * this day — an open pause has no resume day to anchor to yet.
 */
export function effectiveCadenceStart(
  startDate: string,
  pauses: readonly Pause[] | undefined,
  dateKey: string
): string {
  const day = dayNumber(dateKey)
  if (day === null || !pauses || pauses.length === 0) return startDate
  let latestResume: number | null = null
  for (const s of spansOf(pauses)) {
    // An open-ended span has no resume day; `s.end` is the exclusive end, which
    // IS the resume day for a closed one.
    if (!Number.isFinite(s.end)) continue
    if (s.end > day) continue
    if (latestResume === null || s.end > latestResume) latestResume = s.end
  }
  if (latestResume === null) return startDate
  const resumeKey = dayKeyFromNumber(latestResume)
  // Never move the anchor EARLIER than the compound's own start.
  return resumeKey > startDate ? resumeKey : startDate
}

/**
 * How a paused compound's return reads on the dashboard: a DATE when it is far
 * off, a COUNTDOWN once it is close (Adrian, 2026-08-07).
 *
 * The crossover is a week, matching `RUNS_DRY_AMBER_DAYS` — the point at which
 * the app already decides something is imminent enough to say so in days. The
 * cycle card crosses over at fourteen instead; that is deliberate and unrelated,
 * because a cycle phase is a longer thing than a break.
 *
 * Returns null when there is nothing to say (not paused). An indefinite pause
 * has no return to name and yields "Indefinite" rather than an invented date.
 */
export function resumeLabel(
  pauses: readonly Pause[] | undefined,
  dateKey: string,
  formatDate: (key: string) => string
): string | null {
  const p = activePause(pauses, dateKey)
  if (!p) return null
  if (p.endsOn === null) return "Indefinite"
  const back = resumesOn(pauses, dateKey)
  if (!back) return "Indefinite"
  const from = dayNumber(dateKey)
  const to = dayNumber(back)
  if (from === null || to === null) return formatDate(back)
  const days = to - from
  if (days <= 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days <= RESUME_COUNTDOWN_DAYS) return `${days} days`
  return formatDate(back)
}

/** Within this many days, the return reads as a countdown rather than a date. */
export const RESUME_COUNTDOWN_DAYS = 7
