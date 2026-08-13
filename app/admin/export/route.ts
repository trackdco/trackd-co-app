import { NextResponse } from "next/server"

import { isFounder } from "@/lib/admin"
import { safeFilename, toCsv } from "@/lib/admin/aggregate"
import { createClient } from "@/lib/supabase/server"

/**
 * CSV export for the two founder-visible lists: the waitlist and the feedback
 * queue.
 *
 * ── WHY THIS IS SAFE, IN THE ORDER IT MATTERS ─────────────────────────────
 *
 * 1. **It is not the service role.** Everything here reads through the caller's
 *    OWN cookie-scoped Supabase client, so the `waitlist` and `beta_feedback`
 *    RLS policies — which name the founder emails in SQL — decide what comes
 *    back. If the founder list in the database and the one in `lib/admin.ts`
 *    ever disagree, the database wins and this endpoint returns nothing. An
 *    export route holding a service-role client would have been a single
 *    misplaced check away from dumping every table.
 *
 * 2. **The application gate is checked anyway**, before any query runs, so a
 *    non-founder gets a 403 rather than an empty CSV that suggests the data is
 *    simply gone.
 *
 * 3. **`dataset` is validated against an allowlist** and used only to pick a
 *    branch — it never reaches a table name, a column list or a filename. A
 *    request for `?dataset=profiles` is a 400, not a query.
 *
 * 4. **Every field is escaped through `csvField`**, which quotes per RFC 4180
 *    AND neutralises spreadsheet formula injection. This matters more here than
 *    anywhere else in the app: the two exported columns a stranger controls are
 *    the waitlist email and the body of a feedback note, and `=HYPERLINK(...)`
 *    typed into the feedback box would otherwise become a live formula the
 *    moment the download opened in Excel or Sheets.
 *
 * 5. **`no-store`, and `robots: noindex` on the parent page.** A CSV of user
 *    emails must not sit in a CDN cache or a browser's back-forward cache.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The only two things that may be exported, and exactly how.
 *
 * `maxRows` is per-dataset because the two have very different row weights. A
 * waitlist row is three short fields; a feedback row carries a `message` capped
 * at 4,000 characters, so 10,000 of them is a ~40 MB single response. The
 * feedback cap is set so the worst case stays in the low megabytes. Only a
 * founder can trigger it, so this is a self-inflicted ceiling rather than an
 * attack surface — but an endpoint that can emit 40 MB is worth not having.
 */
const DATASETS = {
  waitlist: {
    table: "waitlist",
    columns: "email, source, created_at",
    headers: ["email", "source", "created_at"],
    filename: "trackd-waitlist.csv",
    order: "created_at",
    maxRows: 10_000,
  },
  feedback: {
    table: "beta_feedback",
    columns: "created_at, path, email, message, resolved_at",
    headers: ["created_at", "path", "email", "message", "resolved_at"],
    filename: "trackd-feedback.csv",
    order: "created_at",
    maxRows: 2_000,
  },
} as const

type DatasetKey = keyof typeof DATASETS

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !isFounder(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const requested = new URL(request.url).searchParams.get("dataset") ?? ""
  if (!Object.prototype.hasOwnProperty.call(DATASETS, requested)) {
    return NextResponse.json(
      { error: "unknown dataset", allowed: Object.keys(DATASETS) },
      { status: 400 }
    )
  }
  const spec = DATASETS[requested as DatasetKey]

  const { data, error } = await supabase
    .from(spec.table)
    .select(spec.columns)
    .order(spec.order, { ascending: false })
    .limit(spec.maxRows)

  if (error) {
    return NextResponse.json({ error: "query failed" }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as Record<string, string | null>[]
  const csv = toCsv(
    [...spec.headers],
    rows.map((row) => spec.headers.map((h) => row[h] ?? ""))
  )

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(spec.filename)}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  })
}
