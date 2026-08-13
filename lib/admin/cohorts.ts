import { dayKey, percent } from "./aggregate"

/**
 * The cohort retention grid: signup week down the side, weeks-since-signup
 * across, each cell the share of that cohort still active in that week.
 *
 * Pure. Takes per-user signup and activity dates, joins them by id INSIDE this
 * module, and hands back nothing but counts and percentages — the same
 * arrangement `funnel()` and `intersect()` already use, and the reason the
 * counts-only invariant in `lib/db/admin/core.ts` survives a chart that is
 * fundamentally per-user underneath.
 *
 * ── THE MISTAKE THIS FILE IS BUILT TO AVOID ────────────────────────────────
 * Activity is read over a BOUNDED window (see `activityWindow` in
 * `lib/db/admin/index.ts`); signups are read all-time. Join those two naively
 * and every cohort older than the activity window reports 0% retention in its
 * early weeks — a grid of confident zeroes describing weeks nobody looked at,
 * drawn in the same ink as the real ones. So a cell is only filled in when its
 * whole week falls inside the observed range, and is `null` otherwise. Null
 * means "not measured"; 0 means "measured, and nobody came back". The dashboard
 * must be able to tell those apart.
 */

/** One person's dated event. Ids are joined on here and never returned. */
export interface CohortEvent {
  userId: string
  /** ISO timestamp. */
  at: string
}

export interface CohortCell {
  /** Weeks since signup. 0 is the signup week itself. */
  week: number
  /** Cohort members who wrote something during that week. 0 when unobserved. */
  active: number
  /** Share of the cohort, or null when the week could not be measured. */
  pct: number | null
  /**
   * The week is fully inside the range activity was actually read for, and has
   * begun. False → the cell is unknowable and `pct` is null.
   */
  observed: boolean
  /**
   * The week is observed but still RUNNING — "so far", not "in total".
   *
   * Carried separately because a partial week always looks like a collapse in
   * retention, and a grid that cannot say "this column is two days old" invites
   * exactly that misreading on every single refresh.
   */
  partial: boolean
}

export interface CohortRow {
  /** UTC Monday that opens the cohort week, "YYYY-MM-DD". */
  week: string
  /** Accounts created that week. */
  size: number
  cells: CohortCell[]
}

export interface CohortGrid {
  /** Column headers: 0, 1, 2… weeks since signup. */
  weeks: number[]
  /** One row per signup week, oldest first. */
  rows: CohortRow[]
  /** Days of activity history the grid could see — why some cells are null. */
  observedDays: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/**
 * The UTC Monday that opens the week containing `ms`.
 *
 * Monday rather than Sunday: ISO-8601, and the product's own dosing week is a
 * Monday week (`lib/schedule.ts`), so a retention week that started on a Sunday
 * would slice every user's protocol in half.
 *
 * Plain millisecond arithmetic is safe here ONLY because everything is UTC —
 * UTC has no daylight saving, so every week is exactly 7×24h. The same code in
 * local time would silently produce a 167-hour week twice a year.
 */
function startOfWeek(ms: number): number {
  const d = new Date(ms)
  d.setUTCHours(0, 0, 0, 0)
  // getUTCDay: 0 = Sunday. Shift so Monday is 0.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.getTime()
}

export interface CohortInput {
  /** Per-user signup timestamps — `profiles.created_at`. */
  signups: CohortEvent[]
  /** Per-user write timestamps, across every activity table. */
  activity: CohortEvent[]
  /**
   * The earliest instant the activity read actually covers.
   *
   * NOT optional and NOT inferred from the earliest event in `activity`: an
   * empty week at the start of the window is indistinguishable from a window
   * that starts later, and guessing wrong here is precisely how the grid starts
   * printing zeroes for weeks it never looked at.
   */
  observedFrom: Date
  now?: Date
  /** Columns to compute. */
  maxWeeks?: number
  /** Rows to keep, most recent cohorts first. */
  maxCohorts?: number
}

/** Twelve weeks of columns — a quarter, which is the horizon that matters. */
const DEFAULT_MAX_WEEKS = 12
/** Half a year of rows. Older cohorts exist; a readable grid does not. */
const DEFAULT_MAX_COHORTS = 26

export function cohortGrid(input: CohortInput): CohortGrid {
  const now = (input.now ?? new Date()).getTime()
  const observedFrom = input.observedFrom.getTime()
  const maxWeeks = Math.max(1, input.maxWeeks ?? DEFAULT_MAX_WEEKS)
  const maxCohorts = Math.max(1, input.maxCohorts ?? DEFAULT_MAX_COHORTS)
  const observedDays = Math.max(0, Math.round((now - observedFrom) / DAY_MS))
  const weeks = Array.from({ length: maxWeeks }, (_, i) => i)

  // ── Cohorts: signup week → the accounts created in it ─────────────────────
  const cohorts = new Map<number, Set<string>>()
  for (const signup of input.signups) {
    if (!signup.userId) continue
    const ms = Date.parse(signup.at)
    if (Number.isNaN(ms) || ms > now) continue
    const week = startOfWeek(ms)
    const members = cohorts.get(week) ?? new Set<string>()
    members.add(signup.userId)
    cohorts.set(week, members)
  }
  if (cohorts.size === 0) return { weeks, rows: [], observedDays }

  // ── Activity, indexed per user as a SET OF WEEKS ──────────────────────────
  //
  // Every cell's window is Monday-aligned by construction: a cohort opens on a
  // Monday and each column adds exactly 7×24h to it, so `from` is always a
  // Monday too. That makes "was this user active in this cell" a single set
  // lookup rather than a scan of their writes, and turns the grid from
  // cohorts × weeks × members × writes into one pass over the writes plus one
  // lookup per member per cell.
  const weeksByUser = new Map<string, Set<number>>()
  for (const event of input.activity) {
    if (!event.userId) continue
    const ms = Date.parse(event.at)
    if (Number.isNaN(ms)) continue
    const weeks = weeksByUser.get(event.userId)
    if (weeks) weeks.add(startOfWeek(ms))
    else weeksByUser.set(event.userId, new Set([startOfWeek(ms)]))
  }

  const ordered = [...cohorts.entries()]
    .sort((a, b) => a[0] - b[0])
    // Keep the most recent cohorts when there are more than the grid holds, then
    // restore oldest-first so the grid reads top-down through time.
    .slice(-maxCohorts)

  const rows: CohortRow[] = ordered.map(([weekStart, members]) => {
    const cells = weeks.map((week) => {
      const from = weekStart + week * WEEK_MS
      const to = from + WEEK_MS

      // A week is measurable only if it has STARTED and its whole span sits
      // inside the activity read. A week that began before `observedFrom` is
      // half-read at best, and a half-read week is a wrong number, not a low one.
      const observed = from <= now && from >= observedFrom
      if (!observed) {
        return { week, active: 0, pct: null, observed: false, partial: false }
      }

      let active = 0
      for (const userId of members) {
        if (weeksByUser.get(userId)?.has(from)) active += 1
      }

      return {
        week,
        active,
        pct: percent(active, members.size),
        observed: true,
        partial: to > now,
      }
    })

    return { week: dayKey(new Date(weekStart)), size: members.size, cells }
  })

  return { weeks, rows, observedDays }
}
