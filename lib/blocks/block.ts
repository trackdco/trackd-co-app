/**
 * Blocks — a named stretch of training with a start and an end (Adrian,
 * 2026-07-30). A prep, an off-season, a cut. Pure types + maths, no React
 * (`code-standards.md`).
 *
 * The naming was his call and it changed the feature rather than renaming it: a
 * GOAL is a target you hit or miss, a BLOCK is a period you ran. That makes the
 * look-back the centre of the thing and the progress figure a secondary reading,
 * which is the right way round — Trackd already holds every dated thing a
 * retrospective needs, so a block is a lens over data that exists rather than
 * anything new to capture.
 *
 * Two rules this module exists to hold:
 *
 * 1. **Dates are the model; weeks are a reading of them.** A block is bounded by
 *    real dates. "Week 7 of 16" is derived on every read and never stored.
 * 2. **State the fact, never the verdict.** `architecture.md`'s invariant is that
 *    health data is categorical and never evaluative. A block is the user's own
 *    plan so a progress figure is fine, but nothing here computes "on track",
 *    "behind", or a projected outcome, and nothing returns a value whose only
 *    use would be to colour something red. If a future caller wants that, the
 *    answer is no.
 */

export type BlockStatus = "active" | "completed" | "abandoned"

/**
 * The variables a block may target.
 *
 * Bloodwork is DELIBERATELY ABSENT and must stay absent (Adrian, 2026-07-30:
 * "I'm not doing targets for blood work. No way."). A target turns a reading
 * into a pass or a fail, and a biomarker is exactly the kind of reading the
 * categorical-never-evaluative invariant protects. Weight and consistency are
 * both facts about the user's own behaviour, not about their health.
 */
export type BlockTargetVariable = "weight" | "consistency"

export interface BlockTarget {
  variable: BlockTargetVariable
  /** kg for weight, percent (0-100) for consistency. */
  value: number
  /**
   * Which way the user is heading. Stored rather than inferred, because a
   * bodyweight target of 84 kg means the opposite thing to someone bulking than
   * to someone cutting, and guessing from the starting weight gets it wrong the
   * moment they cross it.
   */
  direction: "up" | "down"
}

export interface Block {
  id: string
  /** "First bodybuilding prep". */
  name: string
  /** Local "YYYY-MM-DD". */
  startedOn: string
  /** Local "YYYY-MM-DD". `null` = open ended, so there is no "of 16". */
  endsOn: string | null
  targets: BlockTarget[]
  status: BlockStatus
  /** Set when it stops being active. */
  closedOn: string | null
  /** Written at close. The retrospective's own voice. */
  reflection: string | null
}

const DAY_MS = 86_400_000

/** Local date key → days since epoch, ignoring time of day and DST. */
function dayNumber(key: string): number | null {
  const [y, m, d] = key.split("-").map(Number)
  if (!y || !m || !d) return null
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

export interface BlockProgress {
  /** 1-based, so the first day of a block is "week 1". */
  week: number
  /** Total weeks the block spans, or `null` when it is open ended. */
  totalWeeks: number | null
  /** Whole days from the start to `today`, inclusive of the first day. */
  daysElapsed: number
  /**
   * Days left AFTER today, or `null` when open ended. Never negative, so `0`
   * means "today is the end date, or past it" — which is exactly the test the
   * end-date prompt uses. On the final day the UI reads "0 days left".
   */
  daysRemaining: number | null
  /** 0…1 of the window elapsed, or `null` when open ended. */
  fraction: number | null
  /** `today` is past `endsOn`. The block is over even if nobody closed it. */
  overrun: boolean
}

/**
 * How far through a block a given day is.
 *
 * Time is the primary measure because it is the only one that always exists.
 * MacroFactor can show a percentage because its goals are numeric; "prepping for
 * a comp" has no number to divide. A target adds a SECOND, separately labelled
 * reading (see `targetProgress`) and the two are never blended into one figure,
 * because a combined "68% complete" would be inventing a fact.
 */
export function blockProgress(block: Block, todayKey: string): BlockProgress {
  const start = dayNumber(block.startedOn)
  const today = dayNumber(todayKey)
  const end = block.endsOn ? dayNumber(block.endsOn) : null

  if (start == null || today == null) {
    return {
      week: 1,
      totalWeeks: null,
      daysElapsed: 0,
      daysRemaining: null,
      fraction: null,
      overrun: false,
    }
  }

  // Inclusive of the first day: the day you start is day 1, not day 0.
  const daysElapsed = Math.max(1, today - start + 1)
  const week = Math.floor((daysElapsed - 1) / 7) + 1

  if (end == null) {
    return {
      week,
      totalWeeks: null,
      daysElapsed,
      daysRemaining: null,
      fraction: null,
      overrun: false,
    }
  }

  const totalDays = Math.max(1, end - start + 1)
  return {
    week,
    totalWeeks: Math.ceil(totalDays / 7),
    daysElapsed,
    daysRemaining: Math.max(0, end - today),
    // Clamped: a block left open past its end reads as full, never as 112%.
    fraction: Math.min(1, Math.max(0, daysElapsed / totalDays)),
    overrun: today > end,
  }
}

export interface TargetProgress {
  variable: BlockTargetVariable
  /** Where they started. */
  from: number
  /** Where they are now. */
  current: number
  /** Where they are heading. */
  target: number
  /**
   * 0…1 of the distance covered, or `null` when the start already equalled the
   * target and there is no distance to be a fraction of.
   */
  fraction: number | null
  /** Signed remaining distance in the target's own unit. */
  remaining: number
}

/**
 * How far a numeric target has come. Separate from `blockProgress` on purpose:
 * these are two different facts and the UI shows them as two figures.
 *
 * Returns the distance covered, never a judgement about it. Moving away from the
 * target simply reads as a fraction of 0 and a larger `remaining`; there is no
 * "off track" here and there must not be.
 */
export function targetProgress(
  target: BlockTarget,
  from: number,
  current: number,
): TargetProgress {
  const distance = Math.abs(target.value - from)
  const covered =
    target.direction === "down" ? from - current : current - from
  return {
    variable: target.variable,
    from,
    current,
    target: target.value,
    fraction: distance === 0 ? null : Math.min(1, Math.max(0, covered / distance)),
    remaining:
      target.direction === "down"
        ? Math.max(0, current - target.value)
        : Math.max(0, target.value - current),
  }
}

/**
 * The banner's headline reading: a number and the words after it.
 *
 * ONCE A BLOCK RUNS PAST ITS END, THE DENOMINATOR IS DROPPED. "Week 31 of 9" is
 * not a reading, it is a broken one, and it is not an edge case — "leave
 * running" is a first-class supported answer whose entire purpose is to produce
 * exactly this state. Past the end the honest sentence is how long it has run,
 * with the "Ran past …" line beneath carrying the rest.
 *
 * Shared so the Progress banner and the Blocks page cannot word it differently.
 */
export function weekLabel(p: BlockProgress): { value: number; suffix: string } {
  if (p.totalWeeks == null || p.overrun) {
    // "Week N of M" is an INDEX — day one is week 1 — and an index cannot be
    // read out as a duration. Doing so said "1 week in" on a block two days old
    // and "31 weeks in" at thirty weeks elapsed. Past the end the sentence is
    // how long it has actually run, so it counts COMPLETED time, and under a
    // week it counts days rather than reporting a confident "0 weeks in".
    // NEVER BELOW THE LENGTH THE BLOCK ALREADY RAN. In-window the reading is a
    // POSITION ("week 17 of 17"); past the end it is a DURATION ("17 weeks in").
    // Those measure different things and differ by up to one, so switching
    // between them at the end date made the headline number go BACKWARDS on the
    // day a block overran — 17 of 17 weeks, then 16 weeks in. Measured on 145 of
    // 204 block lengths. A block that ran its full seventeen weeks and kept
    // going has been running for at least seventeen weeks, so that is the floor.
    const weeks = Math.max(Math.floor(p.daysElapsed / 7), p.totalWeeks ?? 0)
    if (weeks < 1) {
      return {
        value: p.daysElapsed,
        suffix: p.daysElapsed === 1 ? "day in" : "days in",
      }
    }
    return { value: weeks, suffix: weeks === 1 ? "week in" : "weeks in" }
  }
  return { value: p.week, suffix: `of ${p.totalWeeks} weeks` }
}

/** One decimal at most, trailing zero dropped: "4", "3.5". */
function trimNum(n: number): string {
  return String(Number(n.toFixed(1)))
}

/**
 * A weight target's reading: how far along, and what is left.
 *
 * Shared so the banner and the Blocks page cannot word it differently, and
 * because both had the same bug — the percentage and the remainder were
 * concatenated with a hard-coded " · " on the SECOND half, so a target with no
 * distance to cover (already at it when the block began) rendered an empty
 * percentage and left the separator dangling: "Weight    · reached".
 */
export function targetReading(p: TargetProgress): string {
  const rest = p.remaining > 0 ? `${trimNum(p.remaining)} kg to go` : "reached"
  return p.fraction != null ? `${Math.round(p.fraction * 100)}% · ${rest}` : rest
}

export interface BlockWindow {
  /** Local "YYYY-MM-DD", inclusive. */
  from: string
  /** Local "YYYY-MM-DD", inclusive. */
  to: string
  /** Whole days the window covers, both ends included. Never below 1. */
  days: number
}

/**
 * The window every look-back query is scoped to. ONE rule, so no two sections of
 * the retrospective can disagree about which days belong to a block.
 *
 * A finished block ends on the day it was CLOSED, not the day it was planned to
 * end: a prep cut short covers the days it actually ran. A live block ends
 * TODAY, because `endsOn` is an intention and nothing after today has happened
 * yet — reading a live block's retrospective as if it already spanned sixteen
 * weeks would state a fact that is not true until it is.
 *
 * `to` is clamped to `from`, so a block someone starts tomorrow reads as one day
 * rather than as a negative span.
 */
export function blockWindow(block: Block, todayKey: string): BlockWindow {
  const from = block.startedOn
  const rawTo = block.closedOn ?? todayKey
  const start = dayNumber(from)
  const end = dayNumber(rawTo)
  if (start == null || end == null) return { from, to: from, days: 1 }
  if (end < start) return { from, to: from, days: 1 }
  return { from, to: rawTo, days: end - start + 1 }
}

/** Is `dateKey` inside `window`? Keys are zero-padded, so a string compare is a
 *  date compare and needs no parsing. */
export function isWithinWindow(window: BlockWindow, dateKey: string): boolean {
  return dateKey >= window.from && dateKey <= window.to
}

/**
 * The block a screen should frame itself with, or `null`. One is live at a time
 * (Adrian), so this is a find rather than a filter; the most recently started
 * wins if data ever contains two, which is a repair rather than a rule.
 */
export function activeBlock(blocks: Block[]): Block | null {
  const live = blocks.filter((b) => b.status === "active")
  if (live.length === 0) return null
  return live.reduce((a, b) => (a.startedOn >= b.startedOn ? a : b))
}

/** Past blocks, newest first — the look-back list. */
export function pastBlocks(blocks: Block[]): Block[] {
  return blocks
    .filter((b) => b.status !== "active")
    .sort((a, b) => b.startedOn.localeCompare(a.startedOn))
}

/**
 * "16 weeks", "16 weeks, 2 days", "5 days". The retrospective's headline figure.
 * Weeks only past a fortnight: "2 weeks, 3 days" is a useful reading of 17 days,
 * "0 weeks, 5 days" is not a useful reading of 5.
 */
export function formatDuration(days: number): string {
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`
  const weeks = Math.floor(days / 7)
  const rem = days % 7
  const w = `${weeks} weeks`
  return rem === 0 ? w : `${w}, ${rem} ${rem === 1 ? "day" : "days"}`
}

/**
 * TODAY, as the user's LOCAL date key — read in the browser, never on the
 * server.
 *
 * This exists because `blocks` carries date CHECK constraints and the server
 * runs in UTC. `new Date().toISOString().slice(0,10)` on the server is
 * yesterday for a Sydney user before 10am and tomorrow for a Californian after
 * 5pm, and `blocks_closed_after_start` rejects a `closed_on` earlier than the
 * start — which left the user unable to close the block OR start another, since
 * only one may be active. The same hazard is documented in
 * `lib/home/protocolSync.ts`; here the constraints turn it into a lockout.
 */
export function localToday(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
