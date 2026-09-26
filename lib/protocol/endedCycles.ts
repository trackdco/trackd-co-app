/**
 * Ended cycles — the Cycles page's "Ended" group (build-brief-final §3.10),
 * DERIVED from the schedule trail. No new storage and no schema change.
 *
 * A compound's cycle is recorded as a schedule VERSION (`setCompoundCycle`
 * writes one with or without `cycle`, effective from a day), and those versions
 * already sync to Postgres (`protocol_compound_schedules`). So the trail already
 * says which cycles are over, and how:
 *  - ENDED by the user: a run of versions carrying a cycle, followed by a version
 *    with none. End writes exactly that (`setCompoundCycle(null)`), and so does a
 *    compound Delete (a `stopped` version). It ended on that version's day.
 *    A cycle begun and ENDED ON THE SAME DAY has no version of its own left (End
 *    replaced it), so End keeps its rule on its own version as `endedCycle`, and
 *    that reads as a run that began and ended that day.
 *  - FINISHED on its own: the run's rule reached its end (an end date, or its
 *    rounds) before anything replaced it. It ended on its LAST day, the day the
 *    end tile named ("Ends 30 Nov" becomes "ended 30 Nov", not 1 Dec).
 *
 * ONE ROW PER COMPOUND, at most: the compound's latest cycle run, when that run
 * is over. A compound currently on a cycle (running, off-period or not yet
 * begun) has no Ended row at all, so Restart can never be offered over a cycle
 * that is running; an older run superseded by a later cycle is not listed
 * beside it; and Delete for good does not surface an older run in its place.
 *
 * Deleted (archived) compounds are left out. Nothing here writes; the actions
 * live in `lib/home/endedCycleActions.ts`.
 *
 * Pure: no React, no storage, no side effects (`code-standards.md`).
 */
import type { CompoundCategory } from "@/lib/compound-categories"
import type { StackCompound } from "@/lib/home/stack"
import { cyclePauseContext, dayBefore, dayKeyFromNumber } from "@/lib/home/pauses"
import { cyclePatternText } from "@/lib/protocol/cyclePage"
import { cycleStatusOn, sameCycle, type CycleRule } from "@/lib/protocol/cycleRule"

export type EndedCycleReason =
  /** The user ended it (End, or deleting the compound). */
  | "ended"
  /** It reached its own end date or its last round. */
  | "finished"

export interface EndedCycle {
  /** Stable id for this run: compound id + the day the run began. What Delete
   *  for good hides, and what Restart checks the row is still current by. */
  key: string
  compoundId: string
  compoundName: string
  category: CompoundCategory
  /** The rule in force when the run ended (its last edit, if it was edited). */
  rule: CycleRule
  /** "5 days on, 2 off". */
  pattern: string
  /** Local "YYYY-MM-DD": the day the user ended it, or the last day it ran. */
  endedOn: string
  reason: EndedCycleReason
}

/** One unbroken stretch of versions carrying a cycle. */
interface CycleRun {
  /** The first version's `effectiveFrom`: the day this run began. */
  start: string
  /** The rule of the run's LAST version: what was in force when it ended. */
  rule: CycleRule
  /** The day {@link rule} took effect: the first version carrying it unchanged. */
  ruleFrom: string
  /** EXCLUSIVE: the `effectiveFrom` of the version that replaced it, if any. */
  endsAt?: string
}

/** The key of the run that began on `runStart`. */
export function endedCycleKey(compoundId: string, runStart: string): string {
  return `${compoundId}|${runStart}`
}

/**
 * Every ended cycle, newest first (by `endedOn`, then key, so the order never
 * flickers between two reads).
 *
 * `hidden` is the Delete-for-good list (`hiddenEndedCycles` in
 * `lib/home/endedCycleActions.ts`); its keys are filtered out.
 */
export function endedCycles(
  stack: readonly StackCompound[],
  todayKey: string,
  hidden?: ReadonlySet<string>
): EndedCycle[] {
  const out: EndedCycle[] = []
  for (const c of stack) {
    if (c.archived) continue
    const run = cycleRuns(c, todayKey).at(-1)
    if (!run) continue
    const end = endOf(c, run, todayKey)
    // Still running (or not begun): it belongs on the Cycles list, not here.
    if (!end) continue
    const key = endedCycleKey(c.id, run.start)
    if (hidden?.has(key)) continue
    out.push({
      key,
      compoundId: c.id,
      compoundName: c.name,
      category: c.category,
      rule: run.rule,
      pattern: cyclePatternText(run.rule.pattern),
      endedOn: end.endedOn,
      reason: end.reason,
    })
  }
  return out.sort((a, b) => b.endedOn.localeCompare(a.endedOn) || a.key.localeCompare(b.key))
}

/**
 * The rule Restart applies from `todayKey`.
 *
 * A FRESH RUN, anchored today: the pattern, colour and length stay, the clock
 * starts again. Rounds count from the anchor, so "after 3 rounds" is three new
 * rounds. An end DATE is absolute, so it moves with the anchor and keeps the
 * same length (a run of 30 Sep to 30 Nov restarted on 5 Dec ends 4 Feb);
 * keeping the old date would restart a finished cycle already over.
 *
 * Two cases re-apply the rule UNCHANGED instead:
 *  - Ended by the user TODAY. `recordScheduleVersion` replaces today's End
 *    version in place, so the run carries on exactly where it was, as if never
 *    ended, rather than jumping back to day one of a round.
 *  - Its anchor is today or later: it had not begun, so there is nothing to
 *    restart and the start the user chose still stands.
 */
export function restartRule(ended: EndedCycle, todayKey: string): CycleRule {
  const rule = ended.rule
  if (ended.reason === "ended" && ended.endedOn === todayKey) return rule
  if (rule.anchor >= todayKey) return rule
  const today = dayNumber(todayKey)
  if (today === null) return rule
  if (rule.end.type === "onDate") {
    const end = dayNumber(rule.end.date)
    const anchor = dayNumber(rule.anchor)
    const span = end !== null && anchor !== null ? Math.max(0, end - anchor) : 0
    return {
      ...rule,
      anchor: todayKey,
      end: { type: "onDate", date: dayKeyFromNumber(today + span) },
    }
  }
  return { ...rule, anchor: todayKey }
}

/* ---------------------------------------------------------------- internals */

/**
 * The compound's cycle runs as of `todayKey`, oldest first.
 *
 * A version with a cycle CONTINUES the run before it (an Edit of a running
 * cycle is the same cycle, not an end and a start), unless that run had already
 * finished by the day this version took effect and the rule is a different one
 * (a Restart, or a new cycle added after one finished). A version without a
 * cycle, or a `stopped` one, closes the run.
 *
 * Versions dated after today have not taken effect and are ignored, so a run
 * whose replacement is still in the future is the current one.
 *
 * A version with no cycle but an `endedCycle` is read as two steps on its day:
 * the cycle it ended, then the End. Walked through the same rules, that is a
 * run that began and ended that day when nothing was running, and just the End
 * of the run already open when it was the same cycle (or an edit of it).
 */
function cycleRuns(c: StackCompound, todayKey: string): CycleRun[] {
  const steps: { day: string; rule?: CycleRule }[] = []
  for (const v of trail(c)) {
    if (v.effectiveFrom > todayKey) break
    const rule = v.stopped ? undefined : v.cycle
    if (!rule && v.endedCycle) steps.push({ day: v.effectiveFrom, rule: v.endedCycle })
    steps.push({ day: v.effectiveFrom, rule })
  }
  const runs: CycleRun[] = []
  let open: CycleRun | null = null
  for (const { day, rule } of steps) {
    if (open && rule && sameCycle(open.rule, rule)) continue
    if (open && rule && !endedOnDay(c, open.rule, day)) {
      open.rule = rule
      open.ruleFrom = day
      continue
    }
    if (open) {
      runs.push({ ...open, endsAt: day })
      open = null
    }
    if (rule) open = { start: day, rule, ruleFrom: day }
  }
  if (open) runs.push(open)
  return runs
}

/**
 * The versions to walk, sorted. A compound never edited has no trail: its
 * current `cycle` (the add form writes it straight onto the record) is then one
 * run from the start date, which is also the day `recordScheduleVersion` seeds
 * the baseline from, so the key does not change once a version is written.
 */
function trail(
  c: StackCompound
): { effectiveFrom: string; cycle?: CycleRule; stopped?: boolean; endedCycle?: CycleRule }[] {
  const history = c.scheduleHistory ?? []
  if (history.length === 0) {
    return c.cycle ? [{ effectiveFrom: c.schedule.startDate, cycle: c.cycle }] : []
  }
  return [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
}

/**
 * How and when a run ended, or null while it still runs.
 *
 * FINISHED wins when the rule reached its own end on or before the day it was
 * replaced: the cycle had already run its course, and whatever came after (an
 * End on its last day, a dose edit) did not end it.
 */
function endOf(
  c: StackCompound,
  run: CycleRun,
  todayKey: string
): { endedOn: string; reason: EndedCycleReason } | null {
  // Searched from the day the FINAL rule took effect: before it, an earlier rule
  // governed, and asking this one about those days would answer for nothing.
  const first = firstEndedDay(c, run.rule, run.ruleFrom, run.endsAt ?? todayKey)
  if (first !== null) {
    // The last day it ran, never before the run itself began.
    return { endedOn: first > run.start ? dayBefore(first) : run.start, reason: "finished" }
  }
  if (run.endsAt) return { endedOn: run.endsAt, reason: "ended" }
  return null
}

/** Had `rule` reached its end by `dateKey`, with this compound's pauses held? */
function endedOnDay(c: StackCompound, rule: CycleRule, dateKey: string): boolean {
  return cycleStatusOn(rule, dateKey, cyclePauseContext(c.pauses, rule, dateKey)).ended
}

/**
 * The first day in `[from, until]` on which `rule` reads as ended, or null.
 *
 * A binary search, because "ended" never switches back off as days pass: an end
 * date is fixed (pauses move it out by a count that does not depend on the day
 * asked about), and the rounds clock only ever advances or holds still while
 * paused. `whenVialEmpty` has no producer yet (`VIAL_END_SUPPORTED`), so it never
 * finishes here either, the same as everywhere else in the app.
 */
function firstEndedDay(
  c: StackCompound,
  rule: CycleRule,
  from: string,
  until: string
): string | null {
  let lo = dayNumber(from)
  let hi = dayNumber(until)
  if (lo === null || hi === null || hi < lo) return null
  if (!endedOnDay(c, rule, dayKeyFromNumber(hi))) return null
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (endedOnDay(c, rule, dayKeyFromNumber(mid))) hi = mid
    else lo = mid + 1
  }
  return dayKeyFromNumber(lo)
}

/** `YYYY-MM-DD` → a day index in UTC, the arithmetic `cycleRule.ts` uses. */
function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}
