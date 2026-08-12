import "server-only"

import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js"

import { isFounder } from "@/lib/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Shared plumbing for the founder-only /admin aggregates.
 *
 * ── THE INVARIANT ──────────────────────────────────────────────────────────
 * **Nothing in `lib/db/admin/` may RETURN a row.** Every exported function
 * returns counts, buckets, ranked label/count pairs or dates. Where a query has
 * to read a column to aggregate it (a `user_id` to de-duplicate, a `sex` to
 * bucket, a `compound_id` to rank), the values are tallied and thrown away
 * INSIDE the module — they never cross the boundary to the page. No dose,
 * weight, marker, photo, journal entry, feedback message or free-text answer is
 * ever read by anything here.
 *
 * That invariant is the entire reason the service role is acceptable in this
 * directory. Every user table is RLS'd to own-rows, so a founder's own client
 * can see exactly one user's data — correct, and precisely why these counts
 * cannot be read the normal way. The alternative (granting founders SELECT on
 * `dose_logs`, `weight_logs`, `journal_entries`, …) would hand two accounts
 * permanent read access to every user's health data in order to render some
 * numbers. That trade is not worth making. So: the service role reads, and
 * nothing it reads leaves in row form.
 *
 * The two places rows ARE legitimately shown — the waitlist email list and the
 * feedback queue — do not go through here. They read through the founder's OWN
 * RLS-scoped client on the page, gated by SQL policies that name the founder
 * emails, exactly as they did before this module existed.
 *
 * ── WHY `server-only` AND NOT `"use server"` ───────────────────────────────
 * This module used to carry `"use server"`, which made every export a *server
 * action* — a publicly reachable POST endpoint that anyone on the internet may
 * invoke by id. The founder re-check below was the only thing standing in front
 * of it. Nothing calls these from the browser (the page is a Server Component),
 * so `server-only` is strictly better: the functions are now unreachable from
 * the client rather than reachable-but-guarded, and importing them into a client
 * bundle fails the BUILD instead of shipping a new endpoint.
 *
 * The founder re-check stays anyway. Defence in depth: the gate should not
 * depend on nobody ever adding `"use server"` back.
 */

/** A source that failed to read, named so the page can say which one. */
export interface AdminIssue {
  /** What was being read, in words that mean something on the page. */
  label: string
  /**
   * The database's complaint, truncated to 200 characters.
   *
   * NOT guaranteed to be free of user data, and an earlier draft of this comment
   * claimed it was. Postgres and PostgREST echo offending VALUES in some error
   * text (a failed cast, an out-of-range number), so a message can carry a
   * fragment of a row. It is acceptable here for one specific reason: this
   * string is only ever rendered on /admin, behind the founder gate, to the same
   * two people who are already authorised to see the aggregates. It must not be
   * logged, forwarded, or surfaced anywhere less restricted.
   */
  detail: string
}

/**
 * Collects per-query failures instead of letting them vanish.
 *
 * The previous implementation did `if (error) continue`, which silently dropped
 * a broken source — and did exactly that for over a month, because
 * `weight_logs` was queried on `user_id` when its column is `profile_id`. Every
 * active-user number on the dashboard was quietly too low and nothing said so.
 * A failure now has to be rendered, so the next one is visible the same day.
 */
export class IssueLog {
  private readonly issues: AdminIssue[] = []

  /** Record a failed read. Returns true when there WAS an error. */
  record(label: string, error: { message?: string | null } | null | undefined): boolean {
    if (!error) return false
    const detail = (error.message ?? "unknown error").toString().slice(0, 200)
    this.issues.push({ label, detail })
    return true
  }

  get list(): AdminIssue[] {
    return [...this.issues]
  }
}

/** Confirm the CALLER is a founder, from the verified session — never a flag. */
export async function assertFounder(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return isFounder(user?.email)
}

/** A service-role client, or null when the key isn't configured. */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  if (!url || !key) return null
  return createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type AdminClient = SupabaseClient

/** N days ago at 00:00 UTC. */
export function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

/**
 * The row ceiling on any aggregate read.
 *
 * ⚠️ SCALE: PostgREST cannot express `count(distinct user_id)` or `group by`, so
 * the distinct-user and ranked-tally reads below pull one narrow column and
 * reduce it in TypeScript. At beta size that is a few thousand rows. Past
 * roughly this ceiling the numbers would silently start UNDERSTATING, which is
 * the failure mode this whole file exists to avoid — so a read that comes back
 * exactly at the cap records an issue and the page says the number is capped,
 * rather than printing a confident wrong total. The fix when that day arrives is
 * a SQL view or an RPC per aggregate, and nothing on the page has to change.
 */
export const ROW_CAP = 20000

/**
 * The only shape of a PostgREST query this module needs.
 *
 * Declared explicitly rather than inferred off `supabase.from().select()`. That
 * inferred type is generic over the table name AND the column string, and
 * threading it through a `refine` callback made the compiler give up with
 * TS2589 ("type instantiation is excessively deep"). This is the narrow
 * boundary type instead: the five filters actually used, each returning the
 * builder so calls chain. The cast to it happens once, here, rather than an
 * `any` at every call site.
 */
export interface AdminQuery {
  eq(column: string, value: unknown): AdminQuery
  gte(column: string, value: unknown): AdminQuery
  is(column: string, value: unknown): AdminQuery
  order(column: string, options?: { ascending?: boolean }): AdminQuery
  limit(count: number): AdminQuery
}

/** How a PostgREST read comes back once it is awaited. */
interface QueryResult<T> {
  data: T[] | null
  count: number | null
  error: { message?: string | null } | null
}

/** Refine a query with filters — `(q) => q.eq("is_active", true)`. */
export type Refine = (query: AdminQuery) => AdminQuery

async function run<T>(query: AdminQuery): Promise<QueryResult<T>> {
  return (await (query as unknown as PromiseLike<QueryResult<T>>)) ?? {
    data: null,
    count: null,
    error: { message: "no response" },
  }
}

/** An exact count with `head: true` — the COUNT only, no rows travel. */
export async function countRows(
  supabase: AdminClient,
  table: string,
  issues: IssueLog,
  label: string,
  refine?: Refine
): Promise<number> {
  let query = supabase
    .from(table)
    .select("*", { count: "exact", head: true }) as unknown as AdminQuery
  if (refine) query = refine(query)
  const { count, error } = await run<never>(query)
  if (issues.record(label, error)) return 0
  return count ?? 0
}

/**
 * Read ONE narrow column and hand back the raw values for tallying.
 *
 * The values stay inside `lib/db/admin/`; callers reduce them to counts before
 * returning. Never point this at a free-text or health column — see the
 * invariant at the top of this file.
 */
export async function columnValues<T>(
  supabase: AdminClient,
  table: string,
  columns: string,
  issues: IssueLog,
  label: string,
  refine?: Refine,
  /**
   * This read is a DELIBERATE sample (e.g. "the most recent 500 events"), so
   * returning fewer rows than exist is the intent rather than a fault. Suppresses
   * the truncation issue only; a query error is still reported.
   */
  sample = false
): Promise<T[]> {
  // `count: "exact"` returns the TOTAL matching rows in `Content-Range`,
  // independent of whatever limit actually applied. That is what makes the
  // truncation check below trustworthy.
  let query = supabase
    .from(table)
    .select(columns, { count: "exact" })
    .limit(ROW_CAP) as unknown as AdminQuery
  if (refine) query = refine(query)
  const { data, count, error } = await run<T>(query)
  if (issues.record(label, error)) return []
  const rows = data ?? []

  /**
   * TRUNCATION IS DETECTED AGAINST THE SERVER'S COUNT, NOT AGAINST `ROW_CAP`.
   *
   * The obvious check — `rows.length >= ROW_CAP` — cannot see the failure it is
   * meant to catch. PostgREST applies its OWN `max-rows` ceiling on top of the
   * client limit, and Supabase's hosted default for that is 1,000. With a
   * client limit of 20,000 and a server ceiling of 1,000, every read would
   * silently return 1,000 rows, `rows.length >= 20000` would be false, and the
   * dashboard would report confidently wrong numbers with no issue raised —
   * exactly the class of failure this module exists to prevent.
   *
   * Comparing against `count` catches truncation from ANY source: the client
   * limit, the server ceiling, or a `refine` that set its own smaller limit.
   * A deliberate sample passes `sample: true` and is exempt, because "I asked
   * for 500 and got 500" is not a fault.
   */
  if (!sample && typeof count === "number" && count > rows.length) {
    issues.record(label, {
      message: `read ${rows.length.toLocaleString()} of ${count.toLocaleString()} rows — this figure is a floor, not a total`,
    })
  }
  return rows
}

/** The set of distinct user ids in a table — for cross-table set maths only. */
export async function userIdSet(
  supabase: AdminClient,
  table: string,
  column: string,
  issues: IssueLog,
  label: string,
  refine?: Refine
): Promise<Set<string>> {
  const rows = await columnValues<Record<string, string | null>>(
    supabase,
    table,
    column,
    issues,
    label,
    refine
  )
  const seen = new Set<string>()
  for (const row of rows) {
    const id = row?.[column]
    if (id) seen.add(id)
  }
  return seen
}
