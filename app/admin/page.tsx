import type { Metadata } from "next"
import Link from "next/link"

import { AutoRefresh } from "@/components/admin/AutoRefresh"
import { Funnel, RankedBars, Sparkline, SplitBar } from "@/components/admin/charts"
import { FeedbackList, type AdminFeedback } from "@/components/admin/FeedbackList"
import { Card, Empty, KeyRow, Note, Section, Stat, StatGrid } from "@/components/admin/ui"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import { isFounder } from "@/lib/admin"
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

/** Anchors for the sticky section nav. */
const NAV = [
  { id: "overview", label: "Overview" },
  { id: "growth", label: "Growth" },
  { id: "funnel", label: "Funnel" },
  { id: "retention", label: "Retention" },
  { id: "revenue", label: "Revenue" },
  { id: "product", label: "Product" },
  { id: "adoption", label: "Adoption" },
  { id: "answers", label: "Answers" },
  { id: "people", label: "People" },
  { id: "health", label: "Health" },
  { id: "feedback", label: "Feedback" },
  { id: "legal", label: "Legal" },
  { id: "emails", label: "Emails" },
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
  const channels = ((bySourceRes.data ?? []) as { source: string; signups: number }[]).map(
    (c) => ({ key: c.source, label: c.source, count: c.signups })
  )

  /**
   * The page's OWN three reads get the same treatment as the aggregate layer's.
   *
   * `getAdminMetrics` collects its failures and this page prints them — but these
   * three queries live here, not in there, and were still doing `data ?? []`
   * with the error dropped on the floor. That is precisely the pattern this work
   * set out to remove, surviving one file away from where it was removed. If
   * `v_waitlist_by_source` were never applied, or the `beta_feedback` founder
   * policy drifted from `FOUNDER_EMAILS`, those cards would sit empty forever
   * and look like "no data" rather than "broken".
   */
  const pageIssues = [
    { label: "Waitlist emails", error: recentRes.error },
    { label: "Feedback queue rows", error: feedbackRes.error },
    { label: "Waitlist channels", error: bySourceRes.error },
  ]
    .filter((i) => i.error)
    .map((i) => ({ label: i.label, detail: String(i.error?.message ?? "unknown error").slice(0, 200) }))

  const issues = [...metrics.issues, ...pageIssues]

  const { users, usage, growth, billing, webhooks, push, compounds, inventory } = metrics
  const rangeLabel = range.label === "All" ? "all time" : `last ${range.label.toLowerCase()}`

  return (
    <main className="min-h-dvh bg-bg-base">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-6xl px-6 pt-10">
        <div className="flex items-baseline justify-between gap-4">
          <p className={CARD_EYEBROW}>Trackd</p>
          <div className="flex items-center gap-4">
            <AutoRefresh />
            <Link
              href="/dashboard"
              className="text-xs text-text-muted transition-colors hover:text-foreground"
            >
              ← App
            </Link>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className={PAGE_TITLE}>Admin</h1>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/admin?range=${r.key}`}
                scroll={false}
                // Without this a screen reader hears four identical links and
                // cannot tell which range is showing — the selected state is
                // otherwise carried by background colour alone.
                aria-current={r.key === range.key ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  r.key === range.key
                    ? "bg-bg-surface-raised text-foreground"
                    : "text-text-muted hover:text-foreground"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Sticky section nav — the page is long enough to need one. */}
      <nav
        aria-label="Dashboard sections"
        className="sticky top-0 z-10 mt-6 border-b border-border-default bg-bg-base/90 backdrop-blur"
      >
        {/* Scrollbars are hidden app-wide, so on a phone the 13 items give no
            hint that more exist past the edge. The right-hand mask does. */}
        <div
          className="mx-auto flex w-full max-w-6xl gap-4 overflow-x-auto px-6 py-3 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] lg:[mask-image:none]"
        >
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className="shrink-0 text-xs text-text-muted transition-colors hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto w-full max-w-6xl space-y-12 px-6 py-8">
        {metrics.unavailable && (
          <Card>
            <p className="font-medium text-foreground">Metrics unavailable</p>
            <p className="mt-2 text-sm text-text-muted">
              Cross-user counts need{" "}
              <code className="text-foreground">SUPABASE_SECRET_KEY</code> set in this
              environment. The lists at the bottom still work.
            </p>
          </Card>
        )}

        {/* A source that failed to read is SHOWN. The predecessor swallowed
            these, and hid a broken weight-logs query for over a month. */}
        {issues.length > 0 && (
          <Card>
            <p className="font-medium text-admin-negative">
              {issues.length} source{issues.length === 1 ? "" : "s"} failed to read
            </p>
            <p className="mt-1.5 text-xs text-text-muted">
              The numbers below are missing whatever these would have contributed.
            </p>
            {/* `text-text-muted`, not `text-text-subtle`. The whole point of
                showing a failure is that it cannot hide, and subtle measures
                1.92:1 against this surface. */}
            <div className="mt-3 space-y-1.5">
              {issues.map((issue, i) => (
                <p key={`${issue.label}-${i}`} className="font-mono text-[11px] text-text-muted">
                  <span className="text-foreground">{issue.label}</span> · {issue.detail}
                </p>
              ))}
            </div>
          </Card>
        )}

        {/* ── 1. Overview ─────────────────────────────────────────────────── */}
        <Section id="overview" title="Overview">
          <StatGrid>
            <Stat label="Accounts" value={users.totalAccounts} />
            <Stat label="Active today" value={users.activeDaily} />
            <Stat label="Active 7 days" value={users.activeWeekly} />
            <Stat
              label="Paying or trialing"
              value={billing.live}
              hint={`${billing.entitledAccounts.toLocaleString()} hold an entitlement`}
            />
          </StatGrid>
          {/* The UTC caveat is stated rather than hidden. Days here start at
              00:00 UTC, which is 10:00 in Sydney, so between local midnight and
              10am "today" still means yesterday. Fixing that properly means
              choosing a reporting timezone, which is a decision, not a tweak. */}
          <Note>
            Active = wrote something that period: a dose, weight, journal entry, photo
            or compound. It does not count opening the app to look. Days start at
            00:00 UTC, not local midnight.
          </Note>
        </Section>

        {/* ── 2. Growth ───────────────────────────────────────────────────── */}
        <Section id="growth" title="Growth" hint={`Waitlist and accounts, ${rangeLabel}.`}>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <p className={CARD_EYEBROW}>Waitlist signups</p>
              <p className="mt-2 font-mono text-2xl font-light tabular-nums text-foreground">
                {growth.signupsInRange.toLocaleString()}
                <span className="ml-2 text-xs text-text-muted">
                  of {growth.waitlistTotal.toLocaleString()} all time
                </span>
              </p>
              <div className="mt-4">
                <Sparkline id="spark-signups" points={growth.signupsByDay} />
              </div>
              <RangeAxis points={growth.signupsByDay} />
            </Card>

            <Card>
              <p className={CARD_EYEBROW}>New accounts</p>
              <p className="mt-2 font-mono text-2xl font-light tabular-nums text-foreground">
                {users.newAccounts.toLocaleString()}
                <span className="ml-2 text-xs text-text-muted">
                  of {users.totalAccounts.toLocaleString()} all time
                </span>
              </p>
              <div className="mt-4">
                <Sparkline
                  id="spark-accounts"
                  points={users.accountsByDay}
                  color="var(--admin-series-2)"
                />
              </div>
              <RangeAxis points={users.accountsByDay} />
            </Card>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Waitlist by channel</p>
              <RankedBars items={channels} showPct />
            </Card>
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Where accounts say they came from</p>
              {metrics.attribution.answered === 0 ? (
                <Empty>Nobody has answered the attribution screen yet.</Empty>
              ) : (
                <>
                  <RankedBars
                    items={metrics.attribution.sources}
                    total={metrics.attribution.answered}
                    showPct
                  />
                  {metrics.attribution.codes.length > 0 && (
                    <>
                      <p className={`mt-6 mb-3 ${CARD_EYEBROW}`}>Creator codes</p>
                      <RankedBars items={metrics.attribution.codes} limit={6} />
                    </>
                  )}
                </>
              )}
            </Card>
          </div>
        </Section>

        {/* ── 3. Funnel ───────────────────────────────────────────────────── */}
        <Section
          id="funnel"
          title="Onboarding funnel"
          hint="All time, not the selected range. A funnel over a window would drop everyone who signed up before it."
        >
          <Card>
            <Funnel steps={metrics.funnel} />
          </Card>
        </Section>

        {/* ── 4. Retention ────────────────────────────────────────────────── */}
        <Section id="retention" title="Retention & engagement">
          <StatGrid>
            <Stat label="Active 30 days" value={users.activeMonthly} />
            <Stat
              label="Came back"
              value={users.returningWeekly}
              hint="Active this week and last week"
            />
            <Stat
              label="Weekly retention"
              value={users.retentionPct}
              suffix="%"
              tone={
                users.retentionPct === null
                  ? "neutral"
                  : users.retentionPct >= 50
                    ? "positive"
                    : "negative"
              }
              hint="Of last week's actives"
            />
            <Stat
              label="Never written"
              value={users.neverWritten}
              tone={users.neverWritten > 0 ? "negative" : "neutral"}
              hint="Accounts that have logged nothing, ever"
            />
          </StatGrid>
          <div className="mt-3">
            <Card>
              <p className={CARD_EYEBROW}>Writes per day</p>
              <div className="mt-4">
                <Sparkline
                  id="spark-activity"
                  points={users.activityByDay}
                  color="var(--admin-series-2)"
                />
              </div>
              <RangeAxis points={users.activityByDay} />
            </Card>
          </div>
        </Section>

        {/* ── 5. Revenue ──────────────────────────────────────────────────── */}
        <Section
          id="revenue"
          title="Revenue"
          hint="`subscriptions` mirrors Stripe; `entitlements` is what the app actually gates on. They are shown separately on purpose: if they disagree, that is the thing to see."
        >
          <StatGrid>
            <Stat label="Active" value={billing.active} />
            <Stat label="Trialing" value={billing.trialing} />
            <Stat
              label="Trials ending 7d"
              value={billing.trialsEndingSoon}
              hint="Convert or churn this week"
            />
            <Stat
              label="Cancelling"
              value={billing.cancelling}
              tone={billing.cancelling > 0 ? "negative" : "neutral"}
              hint="Set to end at the period boundary"
            />
          </StatGrid>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Subscriptions by status</p>
              <RankedBars items={billing.byStatus} showPct />
            </Card>
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Active entitlements by source</p>
              {billing.entitlementsBySource.length === 0 ? (
                <Empty>No active entitlements.</Empty>
              ) : (
                <SplitBar items={billing.entitlementsBySource} />
              )}
              <div className="mt-5 hairline-t pt-3">
                <KeyRow
                  label="Accounts with access"
                  value={billing.entitledAccounts.toLocaleString()}
                />
                <KeyRow
                  label="Reached Stripe checkout"
                  value={billing.customers.toLocaleString()}
                  muted
                />
              </div>
            </Card>
          </div>
        </Section>

        {/* ── 6. Product ──────────────────────────────────────────────────── */}
        <Section id="product" title="What people run">
          <StatGrid cols={4}>
            <Stat label="Protocol entries" value={compounds.totalEntries} />
            <Stat label="Running now" value={compounds.activeEntries} />
            <Stat label="Doses logged" value={usage.dosesLogged} />
            <Stat
              label="Custom compounds"
              value={compounds.customEntries}
              hint="Not in the catalogue"
            />
          </StatGrid>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Top compounds</p>
              <RankedBars items={compounds.topCompounds} limit={12} />
            </Card>
            <div className="space-y-3">
              <Card>
                <p className={`mb-4 ${CARD_EYEBROW}`}>By category</p>
                <SplitBar items={compounds.categories} />
              </Card>
              <Card>
                <p className={`mb-4 ${CARD_EYEBROW}`}>By route</p>
                <SplitBar items={compounds.routes} />
              </Card>
              <Card>
                <p className={`mb-4 ${CARD_EYEBROW}`}>By schedule</p>
                <SplitBar items={compounds.schedules} />
              </Card>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Inventory</p>
              <KeyRow label="Items tracked" value={inventory.total.toLocaleString()} />
              <KeyRow label="Still active" value={inventory.active.toLocaleString()} muted />
              <KeyRow
                label="Accounts tracking stock"
                value={inventory.accounts.toLocaleString()}
                muted
              />
              <div className="mt-4">
                <SplitBar items={inventory.byType} />
              </div>
            </Card>
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Everything else logged</p>
              <KeyRow label="Journal entries" value={usage.journalEntries.toLocaleString()} />
              <KeyRow label="Weight logs" value={usage.weightLogs.toLocaleString()} />
              <KeyRow label="Progress photos" value={usage.progressPhotos.toLocaleString()} />
              <KeyRow label="Lab panels" value={usage.labPanels.toLocaleString()} />
              <KeyRow
                label="Accounts with an active compound"
                value={usage.usersWithActiveCompound.toLocaleString()}
                muted
              />
            </Card>
          </div>
        </Section>

        {/* ── 7. Feature adoption ─────────────────────────────────────────── */}
        <Section
          id="adoption"
          title="Feature adoption"
          hint="Distinct accounts that have touched each feature, as a share of all accounts. The point of this list is finding the dead ones."
        >
          <Card>
            {metrics.adoption.length === 0 ? (
              <Empty>No accounts yet.</Empty>
            ) : (
              <RankedBars
                items={metrics.adoption.map((a) => ({
                  key: a.label,
                  label: a.label,
                  count: a.users,
                }))}
                limit={20}
                total={users.totalAccounts}
                showPct
              />
            )}
          </Card>
        </Section>

        {/* ── 8. Onboarding answers ───────────────────────────────────────── */}
        <Section
          id="answers"
          title="What they told us on the way in"
          hint="Counts only. The free-text 'Something else' box is deliberately never read here."
        >
          {metrics.intake.answered === 0 ? (
            <Card>
              <Empty>No onboarding answers claimed onto an account yet.</Empty>
            </Card>
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                  <p className={`mb-4 ${CARD_EYEBROW}`}>What they&apos;re running</p>
                  <RankedBars
                    items={metrics.intake.running}
                    limit={10}
                    total={metrics.intake.answered}
                    showPct
                  />
                </Card>
                <Card>
                  <p className={`mb-4 ${CARD_EYEBROW}`}>What they struggle with</p>
                  <RankedBars
                    items={metrics.intake.struggle}
                    limit={10}
                    total={metrics.intake.answered}
                    showPct
                  />
                </Card>
              </div>
              <div className="mt-3">
                <Card>
                  <KeyRow
                    label="Answered onboarding"
                    value={metrics.intake.answered.toLocaleString()}
                  />
                  <KeyRow
                    label="Typed something in 'Something else'"
                    value={metrics.intake.wroteDetail.toLocaleString()}
                    muted
                  />
                  <KeyRow
                    label="Arrived with a creator code"
                    value={metrics.intake.withAffiliateCode.toLocaleString()}
                    muted
                  />
                </Card>
              </div>
            </>
          )}
        </Section>

        {/* ── 9. Demographics ─────────────────────────────────────────────── */}
        <Section
          id="people"
          title="Who they are"
          hint="Bucketed counts. No date of birth or individual age is ever read out of the database into this page."
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Sex</p>
              <SplitBar items={metrics.demographics.sex} />
              <p className={`mt-6 mb-4 ${CARD_EYEBROW}`}>Units</p>
              <SplitBar items={metrics.demographics.units} />
            </Card>
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Age</p>
              <RankedBars items={metrics.demographics.ageBrackets} showPct />
              {metrics.demographics.missingDob > 0 && (
                <p className="mt-3 text-xs text-text-subtle">
                  {metrics.demographics.missingDob.toLocaleString()} account
                  {metrics.demographics.missingDob === 1 ? "" : "s"} with no date of birth
                  recorded.
                </p>
              )}
            </Card>
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Goal</p>
              <RankedBars items={metrics.demographics.goals} showPct />
            </Card>
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Region</p>
              <RankedBars items={metrics.demographics.regions} showPct />
            </Card>
          </div>
        </Section>

        {/* ── 10. System health ───────────────────────────────────────────── */}
        <Section id="health" title="System health">
          <StatGrid>
            <Stat
              label="Unprocessed webhooks"
              value={webhooks.unprocessed}
              tone={webhooks.unprocessed > 0 ? "negative" : "positive"}
              hint="Accepted but never handled"
            />
            <Stat label="Webhook events" value={webhooks.total} />
            <Stat label="Push devices" value={push.devices} hint={`${push.accounts} accounts`} />
            <Stat
              label="Stale devices"
              value={push.stale}
              hint="Not seen in 30 days"
              tone={push.stale > 0 ? "negative" : "neutral"}
            />
          </StatGrid>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Last Stripe event</p>
              <p className="font-mono text-sm tabular-nums text-foreground">
                {webhooks.lastReceivedAt ? fmtDateTime(webhooks.lastReceivedAt) : "—"}
              </p>
              <p className="mt-2 text-xs text-text-subtle">
                A webhook that stops arriving means entitlements stop being written while
                payments keep succeeding.
              </p>
            </Card>
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Event types</p>
              <RankedBars items={webhooks.byType} limit={6} />
            </Card>
          </div>
        </Section>

        {/* ── 11. Feedback ────────────────────────────────────────────────── */}
        <Section
          id="feedback"
          title={`Feedback${metrics.feedback.total > 0 ? ` · ${metrics.feedback.total}` : ""}`}
          action={
            feedback.length > 0 ? <ExportLink dataset="feedback" /> : undefined
          }
        >
          <StatGrid>
            <Stat
              label="Open"
              value={metrics.feedback.open}
              tone={metrics.feedback.open > 0 ? "negative" : "positive"}
            />
            <Stat label="Resolved" value={metrics.feedback.resolved} />
            <Stat
              label="Oldest open"
              value={metrics.feedback.oldestOpenDays}
              suffix="d"
              hint="Age of the longest-waiting note"
            />
            <Stat
              label="Median fix time"
              value={metrics.feedback.medianResolveHours}
              suffix="h"
              hint={`${metrics.feedback.lastWeek} arrived this week`}
            />
          </StatGrid>
          {metrics.feedback.byPath.length > 0 && (
            <div className="mt-3">
              <Card>
                <p className={`mb-4 ${CARD_EYEBROW}`}>Which screens generate it</p>
                <RankedBars items={metrics.feedback.byPath} limit={8} showPct />
              </Card>
            </div>
          )}
          <div className="mt-3">
            <FeedbackList items={feedback} />
          </div>
        </Section>

        {/* ── 12. Legal ───────────────────────────────────────────────────── */}
        <Section
          id="legal"
          title="Consent & legal"
          hint="Republishing a document does not re-prompt anyone. This is how you see the size of the stale cohort."
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Accepted versions</p>
              <RankedBars items={metrics.consent.byVersion} limit={10} />
            </Card>
            <Card>
              <p className={`mb-4 ${CARD_EYEBROW}`}>Coverage</p>
              <KeyRow
                label="Accounts with a consent record"
                value={metrics.consent.accountsWithConsent.toLocaleString()}
              />
              <KeyRow
                label="Accounts with none"
                value={metrics.consent.accountsMissing.toLocaleString()}
                muted
              />
              <KeyRow
                label="On every current version"
                value={
                  metrics.consent.onCurrentPct === null
                    ? "—"
                    : `${metrics.consent.onCurrentPct}%`
                }
                muted
              />
              {metrics.consent.currentVersions.length > 0 && (
                <div className="mt-4 hairline-t pt-3">
                  <p className="mb-2 text-[11px] text-text-subtle">Live versions</p>
                  {metrics.consent.currentVersions.map((d) => (
                    <KeyRow key={d.document} label={d.label} value={`v${d.version}`} muted />
                  ))}
                </div>
              )}
            </Card>
          </div>
        </Section>

        {/* ── 13. Email list — a reference list, so it sits last. ──────────── */}
        <Section
          id="emails"
          title={`Emails${growth.waitlistTotal > 0 ? ` · ${growth.waitlistTotal}` : ""}`}
          action={recent.length > 0 ? <ExportLink dataset="waitlist" /> : undefined}
        >
          {recent.length === 0 ? (
            <Empty>
              No signups yet. Share{" "}
              <span className="text-foreground">trackdco.app/waitlist?ref=…</span> to start
              filling this up.
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-bg-surface">
              {recent.map((r, i) => (
                <div
                  key={`${r.email}-${i}`}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${
                    i > 0 ? "hairline-t" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {r.email}
                  </span>
                  {/* `source` is arbitrary user-supplied text up to 120 chars,
                      captured from `?ref=`. Left unbounded and `shrink-0` it
                      pushed the row past its container, and the wrapper's
                      `overflow-hidden` silently clipped the date column off
                      the end. */}
                  <span className="min-w-0 max-w-[10rem] shrink truncate text-xs text-text-muted">
                    {(r.source ?? "").trim() || "(direct)"}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-text-subtle">
                    {fmtDate(r.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <p className="pt-4 text-center text-xs text-text-subtle">
          Founder-only · signed in as {user.email}
        </p>
      </div>
    </main>
  )
}

/** The first and last day under a sparkline, so the curve has a scale. */
function RangeAxis({ points }: { points: { day: string; count: number }[] }) {
  if (points.length === 0) return null
  return (
    <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-text-subtle">
      <span>{points[0]?.day ?? ""}</span>
      <span>{points.at(-1)?.day ?? ""}</span>
    </div>
  )
}

/**
 * A CSV download.
 *
 * A plain link, not a fetch: the route sets `Content-Disposition: attachment`
 * and the browser handles it. Nothing about the export needs client JavaScript,
 * and the founder gate lives at the route, not here.
 */
function ExportLink({ dataset }: { dataset: "waitlist" | "feedback" }) {
  return (
    <a
      href={`/admin/export?dataset=${dataset}`}
      className="text-xs text-text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
    >
      Export CSV
    </a>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg-base px-6 text-center">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
}
