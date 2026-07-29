"use server"

import { createClient as createServiceClient } from "@supabase/supabase-js"

import { isFounder } from "@/lib/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Aggregate metrics for the founder-only /admin page (Spec 06).
 *
 * **Why the service role.** Every user table is RLS'd to own-rows, so a founder's
 * own client can see exactly one user's data — which is correct, and is why these
 * counts cannot be read the normal way. The alternative (granting founders SELECT
 * on `dose_logs`, `weight_logs`, …) would hand two accounts read access to every
 * user's health data, permanently, to render five numbers. That trade is not
 * worth making, so the reads run as the service role here instead.
 *
 * **The rule that keeps that safe: nothing in this file may RETURN a row.** Every
 * function returns counts and dates. Where a distinct-user count needs ids, the
 * ids are counted into a `Set` and thrown away inside the function — they never
 * cross the boundary. No message, email, dose, weight, marker, photo or journal
 * text is read by any query here. The only personal data on the page is the
 * waitlist email list, which pre-dates this spec and still reads through the
 * founder's OWN RLS-scoped client, not this one.
 *
 * **Every export re-checks the caller is a founder** against the verified session
 * (`getUser()`), not a passed-in flag — a server action is a public endpoint, so
 * the page's own gate is not enough on its own.
 */

/** Everything the Users + Usage sections need, in one round of queries. */
export interface AdminMetrics {
  /** Distinct users who wrote something today (local to the server's UTC day). */
  activeDaily: number
  /** …and in the last 7 days, today inclusive. */
  activeWeekly: number
  /** Rows in `profiles` — every registered account. */
  totalAccounts: number
  /** Rows in `protocol_compounds` — compounds ever added, across all users. */
  compoundsLogged: number
  /** Rows in `dose_logs` — doses ever logged, across all users. */
  dosesLogged: number
  /** Users holding at least one `is_active` protocol compound right now. */
  usersWithActiveCompound: number
  /** Signups per day for the range, oldest first. */
  signupsByDay: { day: string; count: number }[]
  /** True when the service role isn't configured — the page says so rather than
   *  rendering a page of confident zeroes. */
  unavailable: boolean
}

const EMPTY: AdminMetrics = {
  activeDaily: 0,
  activeWeekly: 0,
  totalAccounts: 0,
  compoundsLogged: 0,
  dosesLogged: 0,
  usersWithActiveCompound: 0,
  signupsByDay: [],
  unavailable: true,
}

/** Confirm the CALLER is a founder, from the verified session. */
async function assertFounder(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return isFounder(user?.email)
}

/** A service-role client, or null when the key isn't configured. */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  if (!url || !key) return null
  return createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** "YYYY-MM-DD" for a Date, in UTC — the day boundary the DB timestamps use. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** N days ago at 00:00 UTC. */
function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

/**
 * The tables an "active" user writes to, and the column that dates the write.
 *
 * ACTIVE = wrote something (Adrian's call, 2026-07-29). The app has no session
 * tracking, so "opened the app" is not answerable without adding a write on every
 * page load; this counts real activity instead and is stated on the page so the
 * number is read the same way every time. It UNDERSTATES a user who only looked.
 */
const ACTIVITY_SOURCES = [
  { table: "dose_logs", column: "taken_at" },
  { table: "weight_logs", column: "created_at" },
  { table: "journal_entries", column: "created_at" },
  { table: "progress_photos", column: "created_at" },
  { table: "protocol_compounds", column: "created_at" },
] as const

/**
 * Distinct active users for the last `days` days.
 *
 * ⚠️ SCALE: this reads one `user_id` per qualifying row and de-duplicates in TS,
 * because PostgREST cannot express `count(distinct user_id)`. At beta size that is
 * a few hundred rows; past roughly ten thousand writes a week it should become a
 * SQL view or an RPC (`select count(distinct user_id) …`) rather than a client-side
 * Set. Flagged rather than pre-optimised — the view is trivial to add later and
 * nothing else has to change.
 */
async function activeUsers(
  supabase: NonNullable<ReturnType<typeof serviceClient>>,
  days: number
): Promise<number> {
  const since = daysAgo(days - 1).toISOString()
  const seen = new Set<string>()
  const results = await Promise.all(
    ACTIVITY_SOURCES.map(({ table, column }) =>
      supabase.from(table).select("user_id").gte(column, since).limit(20000)
    )
  )
  for (const { data, error } of results) {
    if (error || !data) continue
    for (const row of data as { user_id: string | null }[]) {
      if (row.user_id) seen.add(row.user_id)
    }
  }
  return seen.size
}

/** Signups per day over `days`, zero-filled so the chart has no gaps. */
async function signupsPerDay(
  supabase: NonNullable<ReturnType<typeof serviceClient>>,
  days: number | null
): Promise<{ day: string; count: number }[]> {
  let query = supabase.from("waitlist").select("created_at").limit(20000)
  if (days !== null) query = query.gte("created_at", daysAgo(days - 1).toISOString())
  const { data, error } = await query
  if (error || !data) return []

  const counts = new Map<string, number>()
  for (const row of data as { created_at: string | null }[]) {
    if (!row.created_at) continue
    const key = row.created_at.slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (counts.size === 0) return []

  // Zero-fill from the range start (or the first signup, for "All") to today, so
  // a quiet week reads as a flat line rather than as missing data.
  const keys = [...counts.keys()].sort()
  const start =
    days !== null ? dayKey(daysAgo(days - 1)) : (keys[0] ?? dayKey(new Date()))
  const out: { day: string; count: number }[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  // Hard stop so a bad date can't spin here.
  for (let i = 0; cursor <= end && i < 2000; i++) {
    const key = dayKey(cursor)
    out.push({ day: key, count: counts.get(key) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

/**
 * Every aggregate the page needs. Returns {@link EMPTY} with `unavailable: true`
 * for a non-founder or an unconfigured service key — never a partial page of
 * zeroes that reads like real data.
 *
 * `signupDays` is null for "All".
 */
export async function getAdminMetrics(
  signupDays: number | null
): Promise<AdminMetrics> {
  if (!(await assertFounder())) return EMPTY
  const supabase = serviceClient()
  if (!supabase) return EMPTY

  // `head: true` with an exact count returns the COUNT ONLY — no rows travel.
  const [
    accounts,
    compounds,
    doses,
    activeCompoundRows,
    activeDaily,
    activeWeekly,
    signupsByDay,
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("protocol_compounds").select("*", { count: "exact", head: true }),
    supabase.from("dose_logs").select("*", { count: "exact", head: true }),
    // Distinct users again — same PostgREST limitation, same scale caveat.
    supabase
      .from("protocol_compounds")
      .select("user_id")
      .eq("is_active", true)
      .limit(20000),
    activeUsers(supabase, 1),
    activeUsers(supabase, 7),
    signupsPerDay(supabase, signupDays),
  ])

  const activeOwners = new Set<string>()
  for (const row of (activeCompoundRows.data ?? []) as { user_id: string | null }[]) {
    if (row.user_id) activeOwners.add(row.user_id)
  }

  return {
    activeDaily,
    activeWeekly,
    totalAccounts: accounts.count ?? 0,
    compoundsLogged: compounds.count ?? 0,
    dosesLogged: doses.count ?? 0,
    usersWithActiveCompound: activeOwners.size,
    signupsByDay,
    unavailable: false,
  }
}
