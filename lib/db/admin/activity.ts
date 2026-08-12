import "server-only"

import { seriesByDay } from "@/lib/admin/aggregate"
import { columnValues, daysAgo, type AdminClient, type IssueLog } from "./core"

/**
 * "Active" users, retention, and the accounts that have never written anything.
 *
 * ACTIVE = wrote something (Adrian's call, 2026-07-29). The app has no session
 * tracking, so "opened the app" is not answerable without adding a write on
 * every page load; this counts real activity instead, and the page states the
 * definition so the number is read the same way every time. It UNDERSTATES a
 * user who only looked.
 */

/**
 * The tables an active user writes to, the column that dates the write, and the
 * column holding the user id.
 *
 * ⚠️ THE USER COLUMN IS NOT UNIFORM AND THAT HAS ALREADY COST A NUMBER.
 * `weight_logs` keys on `profile_id`; every other table here keys on `user_id`.
 * The original implementation hardcoded `user_id` for all five, so the
 * `weight_logs` read returned error 42703 ("column does not exist"), the error
 * was swallowed by a bare `continue`, and **bodyweight logging never counted
 * toward an active user from the day the dashboard shipped until 2026-08-13**.
 * Active counts were understated for anyone whose only activity that day was a
 * weigh-in. Carrying the column per-source is what stops that returning, and
 * failures are now recorded and shown rather than skipped.
 */
export const ACTIVITY_SOURCES = [
  /**
   * `created_at`, NOT `taken_at`.
   *
   * `taken_at` is when the user says the dose happened, and the app lets them
   * adjust it. Keying activity off it means back-logging a dose from five days
   * ago marks the user active five days ago rather than today — so it cannot
   * move them into the current retention week — while a future-dated dose counts
   * toward "active today" before it has happened. Activity is a question about
   * when somebody USED the app, which is what the write timestamp records.
   */
  { table: "dose_logs", dateColumn: "created_at", userColumn: "user_id", label: "Doses" },
  { table: "weight_logs", dateColumn: "created_at", userColumn: "profile_id", label: "Weight logs" },
  { table: "journal_entries", dateColumn: "created_at", userColumn: "user_id", label: "Journal" },
  { table: "progress_photos", dateColumn: "created_at", userColumn: "user_id", label: "Photos" },
  { table: "protocol_compounds", dateColumn: "created_at", userColumn: "user_id", label: "Compounds" },
] as const

/** One write, reduced to the only three things a window calculation needs. */
export interface Write {
  userId: string
  /** ISO timestamp of the write. */
  at: string
  /** Which table it came from, so a window can be narrowed to one kind of write. */
  table: string
}

/**
 * Every write across all activity sources in the last `days` days.
 *
 * Read ONCE and sliced in memory afterwards, rather than one query per window.
 * Daily / weekly / monthly / previous-week / the activity sparkline are five
 * different questions about the same rows, and asking the database five times
 * for the same rows is how a dashboard becomes slow enough that nobody opens it.
 */
export async function recentWrites(
  supabase: AdminClient,
  days: number,
  issues: IssueLog
): Promise<Write[]> {
  const since = daysAgo(days - 1).toISOString()
  const perSource = await Promise.all(
    ACTIVITY_SOURCES.map(async ({ table, dateColumn, userColumn, label }) => {
      const rows = await columnValues<Record<string, string | null>>(
        supabase,
        table,
        `${userColumn}, ${dateColumn}`,
        issues,
        `${label} activity`,
        (q) => q.gte(dateColumn, since)
      )
      const out: Write[] = []
      for (const row of rows) {
        const userId = row?.[userColumn]
        const at = row?.[dateColumn]
        if (userId && at) out.push({ userId, at, table })
      }
      return out
    })
  )
  return perSource.flat()
}

/**
 * Distinct users who wrote within the window `[from, to)`.
 *
 * `tables` narrows it to one kind of write. That exists for the funnel: its last
 * step has to be a SUBSET of "logged a dose", and "wrote anything" is not —
 * somebody can log a weight without ever logging a dose, which would put the
 * final bar above the one before it and print a percentage over 100.
 */
export function activeIn(
  writes: Write[],
  from: Date,
  to?: Date,
  tables?: readonly string[]
): Set<string> {
  const fromMs = from.getTime()
  const toMs = to ? to.getTime() : Number.POSITIVE_INFINITY
  const seen = new Set<string>()
  for (const w of writes) {
    if (tables && !tables.includes(w.table)) continue
    const ms = Date.parse(w.at)
    if (Number.isNaN(ms)) continue
    if (ms >= fromMs && ms < toMs) seen.add(w.userId)
  }
  return seen
}

/** Writes per UTC day, for the activity sparkline. */
export function writesByDay(writes: Write[], from: Date) {
  return seriesByDay(
    writes.map((w) => w.at),
    from
  )
}
