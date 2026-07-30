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
  /** Days left including today, or `null` when open ended. Never negative. */
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

/** Is `dateKey` inside the block's window? Used to scope every look-back query. */
export function isWithinBlock(block: Block, dateKey: string): boolean {
  const d = dayNumber(dateKey)
  const start = dayNumber(block.startedOn)
  if (d == null || start == null || d < start) return false
  const endKey = block.closedOn ?? block.endsOn
  const end = endKey ? dayNumber(endKey) : null
  return end == null || d <= end
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
