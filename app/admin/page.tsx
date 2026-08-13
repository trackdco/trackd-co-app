import type { Metadata } from "next"
import Link from "next/link"

import { Dashboard } from "@/components/admin/Dashboard"
import type { AdminFeedback } from "@/components/admin/FeedbackList"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import { isFounder } from "@/lib/admin"
import { safeLabel } from "@/lib/admin/aggregate"
import { getAdminMetrics } from "@/lib/db/admin"
import { createClient } from "@/lib/supabase/server"
import { CARD_EYEBROW, PAGE_TITLE } from "@/lib/ui-presets"

export const metadata: Metadata = {
  title: "Admin · Trackd Co",
  robots: { index: false, follow: false },
}

/**
 * The range control. `null` days = all time.
 *
 * Unlike the first cut of this page, the selected range drives EVERY section
 * that has a time dimension — signups, new accounts, the activity curve — rather
 * than only the one chart it sat above. A control that visibly changes one card
 * and silently ignores the rest reads as a bug, because it is one.
 */
const RANGES = [
  { key: "7", label: "7D", days: 7 },
  { key: "30", label: "30D", days: 30 },
  { key: "90", label: "90D", days: 90 },
  { key: "all", label: "All", days: null },
] as const

/**
 * Founder-only operational dashboard (Spec 06, rebuilt 2026-08-13).
 *
 * ACCESS: enforced SERVER-SIDE, in three layers.
 *  1. This is a Server Component: it calls the verified `getUser()` and returns
 *     a blocked view BEFORE any query runs, so a non-founder's request never
 *     fetches and nothing reaches the client bundle.
 *  2. RLS: `waitlist` SELECT and `beta_feedback` SELECT ("own OR founder") both
 *     gate on the founder email list in the database — so even without (1), a
 *     non-founder reads zero rows.
 *  3. `getAdminMetrics` re-checks the caller against the session independently,
 *     and `lib/db/admin/` is `server-only` so none of it can be reached from a
 *     browser at all.
 *
 * Self-contained so it works on desktop (exempt from the phone-only gate): a
 * logged-out visitor gets a Google sign-in here rather than a bounce to the
 * phone-only /login.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Logged out → sign in right here (no bounce to the phone-only /login).
  if (!user) {
    return (
      <Shell>
        <p className={CARD_EYEBROW}>Trackd · Admin</p>
        <h1 className={`mt-3 ${PAGE_TITLE}`}>Founder access</h1>
        <p className="mt-3 text-sm text-text-muted">
          Sign in with a founder account to continue.
        </p>
        <div className="mx-auto mt-8 w-full max-w-[20rem]">
          <GoogleSignInButton next="/admin" />
        </div>
      </Shell>
    )
  }

  // Signed in but not a founder → blocked (no data fetched, nothing leaked).
  if (!isFounder(user.email)) {
    return (
      <Shell>
        <h1 className={PAGE_TITLE}>Founders only</h1>
        <p className="mt-3 text-sm text-text-muted">
          This area is restricted. You&apos;re signed in as {user.email}.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-block text-sm text-text-muted transition-colors hover:text-foreground"
        >
          Go to the app →
        </Link>
      </Shell>
    )
  }

  const sp = await searchParams
  const rawRange = typeof sp.range === "string" ? sp.range : "30"
  const range = RANGES.find((r) => r.key === rawRange) ?? RANGES[1]

  // ── Founder: load the numbers ─────────────────────────────────────────────
  // The waitlist + feedback ROW reads stay on the founder's OWN RLS-scoped
  // client (they're the two places rows are legitimately shown). Every
  // cross-user AGGREGATE goes through `getAdminMetrics`, which never returns a
  // row — see `lib/db/admin/core.ts`.
  const [metrics, recentRes, feedbackRes, bySourceRes] = await Promise.all([
    getAdminMetrics(range.days),
    supabase
      .from("waitlist")
      .select("email, source, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("beta_feedback")
      .select("id, message, email, path, created_at, resolved_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("v_waitlist_by_source")
      .select("source, signups")
      .order("signups", { ascending: false }),
  ])

  const recent = (recentRes.data ?? []) as {
    email: string
    source: string | null
    created_at: string
  }[]
  const feedback = (feedbackRes.data ?? []) as AdminFeedback[]
  // `waitlist.source` is the ONE user-controlled string on this page written by
  // someone who is not even logged in: `anon` holds `insert … with check (true)`
  // on that table, and the column is free `text` up to 120 chars. Sanitised
  // before it becomes a chart label.
  const channels = ((bySourceRes.data ?? []) as { source: string; signups: number }[])
    .map((c) => ({
      key: c.source,
      label: safeLabel(c.source) ?? "(direct)",
      count: c.signups,
    }))

  /**
   * The page's OWN three reads get the same treatment as the aggregate layer's.
   *
   * `getAdminMetrics` collects its failures and the dashboard prints them, but
   * these three queries live here, not in there, and were doing `data ?? []`
   * with the error dropped on the floor — the exact pattern this work removed,
   * surviving one file away from where it was removed. They are folded into the
   * same issue list the alert strip reads.
   */
  const pageIssues = [
    { label: "Email list", error: recentRes.error },
    { label: "Feedback queue rows", error: feedbackRes.error },
    { label: "Email channels", error: bySourceRes.error },
  ]
    .filter((i) => i.error)
    .map((i) => ({
      label: i.label,
      detail: String(i.error?.message ?? "unknown error").slice(0, 200),
    }))

  const withPageIssues = { ...metrics, issues: [...metrics.issues, ...pageIssues] }

  return (
    <Dashboard
      metrics={withPageIssues}
      feedback={feedback}
      emails={recent}
      channels={channels}
      rangeKey={range.key}
      signedInAs={user.email ?? ""}
    />
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg-base px-6 text-center">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  )
}
