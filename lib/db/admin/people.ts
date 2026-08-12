import "server-only"

import {
  AGE_BRACKETS,
  ageBracket,
  seriesByDay,
  tally,
  timezoneRegion,
  type Tally,
} from "@/lib/admin/aggregate"
import {
  ATTRIBUTION_LABELS,
  GOAL_LABELS,
  RUNNING_LABELS,
  STRUGGLE_LABELS,
  labelFor,
} from "@/lib/admin/labels"
import { columnValues, type AdminClient, type IssueLog } from "./core"

/**
 * Who the accounts are, and what they said on the way in.
 *
 * Reads `profiles` ONCE and derives the demographic split, the signup curve and
 * the onboarding-completion step from the same rows, rather than asking the same
 * question five ways.
 *
 * ON DATE OF BIRTH: the raw date is read here, bucketed by `ageBracket`, and
 * dropped. Only bracket COUNTS leave this module — never an age, never a date.
 * The schema's own rule is "derive age; never store age"; this is the read-side
 * of the same rule.
 */

/** One account, reduced to the non-identifying fields the dashboard buckets. */
interface ProfileRow {
  id: string | null
  sex: string | null
  date_of_birth: string | null
  goal: string | null
  units_preference: string | null
  timezone: string | null
  onboarding_completed_at: string | null
  created_at: string | null
}

export interface Demographics {
  sex: Tally[]
  ageBrackets: Tally[]
  goals: Tally[]
  units: Tally[]
  regions: Tally[]
  /** Accounts with no date of birth recorded — the 18+ gate's blind spot. */
  missingDob: number
}

export interface PeopleMetrics {
  /** Rows in `profiles` — every registered account. */
  totalAccounts: number
  /** Accounts created inside the selected range. */
  newAccounts: number
  /** Accounts with `onboarding_completed_at` set. */
  completedOnboarding: number
  /** Account creations per UTC day across the range, for the sparkline. */
  accountsByDay: { day: string; count: number }[]
  demographics: Demographics
  /** Every account id, for cross-table set maths. Never leaves the module. */
  accountIds: Set<string>
}

export async function peopleMetrics(
  supabase: AdminClient,
  since: Date | null,
  issues: IssueLog
): Promise<PeopleMetrics> {
  const rows = await columnValues<ProfileRow>(
    supabase,
    "profiles",
    "id, sex, date_of_birth, goal, units_preference, timezone, onboarding_completed_at, created_at",
    issues,
    "Accounts"
  )

  const now = new Date()
  const sinceMs = since ? since.getTime() : Number.NEGATIVE_INFINITY
  const inRange = rows.filter((r) => {
    if (!r.created_at) return false
    const ms = Date.parse(r.created_at)
    return !Number.isNaN(ms) && ms >= sinceMs
  })

  // Bucket every DOB, then throw the dates away.
  const brackets = rows.map((r) => ageBracket(r.date_of_birth, now))
  const bracketTally = tally(brackets.filter((b): b is NonNullable<typeof b> => b !== null))
  // Hold the canonical bracket order rather than ranking by size: an age axis
  // that reorders itself between refreshes is unreadable.
  const ageOrdered = AGE_BRACKETS.map((b) => ({
    key: b,
    label: b,
    count: bracketTally.find((t) => t.key === b)?.count ?? 0,
  })).filter((b) => b.count > 0)

  return {
    totalAccounts: rows.length,
    newAccounts: inRange.length,
    completedOnboarding: rows.filter((r) => Boolean(r.onboarding_completed_at)).length,
    accountsByDay: seriesByDay(
      inRange.map((r) => r.created_at),
      since
    ),
    demographics: {
      sex: tally(
        rows.map((r) => r.sex),
        (k) => (k === "male" ? "Male" : k === "female" ? "Female" : k)
      ),
      ageBrackets: ageOrdered,
      goals: tally(
        rows.map((r) => r.goal),
        (k) => labelFor(GOAL_LABELS, k)
      ),
      units: tally(
        rows.map((r) => r.units_preference),
        (k) => (k === "metric" ? "Metric" : k === "imperial" ? "Imperial" : k)
      ),
      regions: tally(rows.map((r) => timezoneRegion(r.timezone))),
      missingDob: rows.filter((r) => !r.date_of_birth).length,
    },
    accountIds: new Set(rows.map((r) => r.id).filter((id): id is string => Boolean(id))),
  }
}

export interface IntakeMetrics {
  /** Accounts that claimed their onboarding answers onto an account. */
  answered: number
  running: Tally[]
  struggle: Tally[]
  /**
   * How many people typed something into the "Something else" box.
   *
   * The COUNT only. The text itself (`struggle_detail`) is deliberately never
   * read by this module — Adrian's call, 2026-08-13, keeping the counts-only
   * invariant intact. To read the text, add a founder-scoped RLS policy on
   * `signup_intake` and read it through the founder's own client on the page,
   * the way the waitlist and feedback lists already work. Do not widen this.
   */
  wroteDetail: number
  /** Accounts that arrived carrying a creator code. */
  withAffiliateCode: number
}

export async function intakeMetrics(
  supabase: AdminClient,
  issues: IssueLog
): Promise<IntakeMetrics> {
  const rows = await columnValues<{
    running: string[] | null
    struggle: string[] | null
    struggle_detail: string | null
    affiliate_code: string | null
  }>(
    supabase,
    "signup_intake",
    // `struggle_detail` is selected as a PRESENCE test only and is reduced to a
    // count three lines below. It is never returned, rendered or logged.
    "running, struggle, struggle_detail, affiliate_code",
    issues,
    "Onboarding answers"
  )

  return {
    answered: rows.length,
    running: tally(
      rows.flatMap((r) => r.running ?? []),
      (k) => labelFor(RUNNING_LABELS, k)
    ),
    struggle: tally(
      rows.flatMap((r) => r.struggle ?? []),
      (k) => labelFor(STRUGGLE_LABELS, k)
    ),
    wroteDetail: rows.filter((r) => Boolean(r.struggle_detail)).length,
    withAffiliateCode: rows.filter((r) => Boolean(r.affiliate_code)).length,
  }
}

export interface AttributionMetrics {
  /** Accounts that answered the post-paywall "where did you hear about us". */
  answered: number
  sources: Tally[]
  /** Creator codes by volume — the only hard attribution there is. */
  codes: Tally[]
}

export async function attributionMetrics(
  supabase: AdminClient,
  issues: IssueLog
): Promise<AttributionMetrics> {
  const rows = await columnValues<{ source: string | null; affiliate_code: string | null }>(
    supabase,
    "signup_attribution",
    "source, affiliate_code",
    issues,
    "Attribution"
  )
  return {
    answered: rows.length,
    sources: tally(
      rows.map((r) => r.source),
      (k) => labelFor(ATTRIBUTION_LABELS, k)
    ),
    codes: tally(rows.map((r) => r.affiliate_code)),
  }
}
