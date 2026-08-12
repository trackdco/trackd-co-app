import "server-only"

import { funnel, percent, seriesByDay, type FunnelStep } from "@/lib/admin/aggregate"
import {
  activeIn,
  everActiveUsers,
  recentWrites,
  writesByDay,
} from "./activity"
import {
  billingMetrics,
  pushHealth,
  webhookHealth,
  type BillingMetrics,
  type PushHealth,
  type WebhookHealth,
} from "./billing"
import {
  IssueLog,
  assertFounder,
  columnValues,
  countRows,
  daysAgo,
  serviceClient,
  type AdminIssue,
} from "./core"
import {
  consentCoverage,
  feedbackSla,
  type ConsentCoverage,
  type FeedbackSla,
} from "./ops"
import {
  attributionMetrics,
  intakeMetrics,
  peopleMetrics,
  type AttributionMetrics,
  type Demographics,
  type IntakeMetrics,
} from "./people"
import {
  compoundMetrics,
  featureAdoption,
  inventoryMetrics,
  type CompoundMetrics,
  type FeatureAdoption,
  type InventoryMetrics,
} from "./product"

/**
 * The founder dashboard's whole dataset, in one orchestrated round.
 *
 * Read `core.ts` first — the counts-only invariant it documents is the reason
 * the service role is acceptable in this directory, and every module here is
 * bound by it.
 *
 * SHAPE: one call, everything in parallel. The sections are independent
 * questions and the page renders them together, so serialising them would turn
 * a slow-ish page into an unusable one. A section whose query fails records an
 * issue and returns its zero value; the page prints the failures rather than
 * pretending the zeroes are data.
 */

export interface UserMetrics {
  totalAccounts: number
  /** Distinct users who wrote something today (UTC day). */
  activeDaily: number
  /** …in the last 7 days. */
  activeWeekly: number
  /** …in the last 30 days. */
  activeMonthly: number
  /** Active this week AND the week before — the retention number. */
  returningWeekly: number
  /** Share of last week's actives who came back this week. */
  retentionPct: number | null
  /** Accounts that have never written anything, ever. */
  neverWritten: number
  /** New accounts inside the selected range. */
  newAccounts: number
  accountsByDay: { day: string; count: number }[]
  activityByDay: { day: string; count: number }[]
}

export interface UsageMetrics {
  compoundsLogged: number
  dosesLogged: number
  usersWithActiveCompound: number
  journalEntries: number
  weightLogs: number
  progressPhotos: number
  labPanels: number
}

export interface GrowthMetrics {
  /** Waitlist signups per day across the range, zero-filled. */
  signupsByDay: { day: string; count: number }[]
  /** Waitlist rows in the range. */
  signupsInRange: number
  /** Waitlist rows all time. */
  waitlistTotal: number
}

export interface AdminMetrics {
  /** True when the service role isn't configured — the page says so rather than
   *  rendering a page of confident zeroes. */
  unavailable: boolean
  /** Sources that failed to read. Rendered, never swallowed. */
  issues: AdminIssue[]
  /** Days in the selected range; null for all time. */
  rangeDays: number | null
  users: UserMetrics
  usage: UsageMetrics
  growth: GrowthMetrics
  funnel: FunnelStep[]
  billing: BillingMetrics
  webhooks: WebhookHealth
  push: PushHealth
  compounds: CompoundMetrics
  inventory: InventoryMetrics
  adoption: FeatureAdoption[]
  demographics: Demographics
  intake: IntakeMetrics
  attribution: AttributionMetrics
  feedback: FeedbackSla
  consent: ConsentCoverage
}

const EMPTY_DEMOGRAPHICS: Demographics = {
  sex: [],
  ageBrackets: [],
  goals: [],
  units: [],
  regions: [],
  missingDob: 0,
}

const EMPTY: AdminMetrics = {
  unavailable: true,
  issues: [],
  rangeDays: null,
  users: {
    totalAccounts: 0,
    activeDaily: 0,
    activeWeekly: 0,
    activeMonthly: 0,
    returningWeekly: 0,
    retentionPct: null,
    neverWritten: 0,
    newAccounts: 0,
    accountsByDay: [],
    activityByDay: [],
  },
  usage: {
    compoundsLogged: 0,
    dosesLogged: 0,
    usersWithActiveCompound: 0,
    journalEntries: 0,
    weightLogs: 0,
    progressPhotos: 0,
    labPanels: 0,
  },
  growth: { signupsByDay: [], signupsInRange: 0, waitlistTotal: 0 },
  funnel: [],
  billing: {
    byStatus: [],
    trialing: 0,
    active: 0,
    live: 0,
    cancelling: 0,
    trialsEndingSoon: 0,
    entitlementsBySource: [],
    entitledAccounts: 0,
    customers: 0,
  },
  webhooks: { total: 0, unprocessed: 0, lastReceivedAt: null, byType: [] },
  push: { devices: 0, accounts: 0, stale: 0 },
  compounds: {
    topCompounds: [],
    categories: [],
    routes: [],
    schedules: [],
    customEntries: 0,
    activeEntries: 0,
    totalEntries: 0,
  },
  inventory: { total: 0, active: 0, accounts: 0, byType: [] },
  adoption: [],
  demographics: EMPTY_DEMOGRAPHICS,
  intake: { answered: 0, running: [], struggle: [], wroteDetail: 0, withAffiliateCode: 0 },
  attribution: { answered: 0, sources: [], codes: [] },
  feedback: {
    total: 0,
    open: 0,
    resolved: 0,
    oldestOpenDays: null,
    medianResolveHours: null,
    byPath: [],
    lastWeek: 0,
  },
  consent: {
    byVersion: [],
    accountsWithConsent: 0,
    accountsMissing: 0,
    onCurrentPct: null,
    currentVersions: [],
  },
}

/**
 * How far back the activity read goes.
 *
 * Retention needs two consecutive weeks, so 14 is the floor whatever the
 * selected range. "All time" is capped at 90 rather than reading every write
 * ever made: the activity sparkline is a recent-behaviour chart, and an
 * unbounded read here is the one query on the page that would grow without limit.
 */
function activityWindow(rangeDays: number | null): number {
  if (rangeDays === null) return 90
  return Math.min(365, Math.max(14, rangeDays))
}

/**
 * Every aggregate the dashboard needs.
 *
 * Returns {@link EMPTY} with `unavailable: true` for a non-founder or an
 * unconfigured service key — never a partial page of zeroes that reads like real
 * data. `rangeDays` is null for "All".
 */
export async function getAdminMetrics(rangeDays: number | null): Promise<AdminMetrics> {
  if (!(await assertFounder())) return EMPTY
  const supabase = serviceClient()
  if (!supabase) return EMPTY

  const issues = new IssueLog()
  const since = rangeDays === null ? null : daysAgo(rangeDays - 1)
  const window = activityWindow(rangeDays)

  const [
    people,
    writes,
    everActive,
    waitlistRows,
    waitlistTotal,
    dosesLogged,
    compoundsLogged,
    activeCompoundRows,
    journalEntries,
    weightLogs,
    progressPhotos,
    labPanels,
    billing,
    webhooks,
    push,
    compounds,
    inventory,
    intake,
    attribution,
    feedback,
  ] = await Promise.all([
    peopleMetrics(supabase, since, issues),
    recentWrites(supabase, window, issues),
    everActiveUsers(supabase, issues),
    columnValues<{ created_at: string | null }>(
      supabase,
      "waitlist",
      "created_at",
      issues,
      "Waitlist signups",
      (q) => (since ? q.gte("created_at", since.toISOString()) : q)
    ),
    countRows(supabase, "waitlist", issues, "Waitlist total"),
    countRows(supabase, "dose_logs", issues, "Dose count"),
    countRows(supabase, "protocol_compounds", issues, "Compound count"),
    columnValues<{ user_id: string | null }>(
      supabase,
      "protocol_compounds",
      "user_id",
      issues,
      "Running now",
      (q) => q.eq("is_active", true)
    ),
    countRows(supabase, "journal_entries", issues, "Journal count"),
    countRows(supabase, "weight_logs", issues, "Weight count"),
    countRows(supabase, "progress_photos", issues, "Photo count"),
    countRows(supabase, "lab_panels", issues, "Lab panel count"),
    billingMetrics(supabase, issues),
    webhookHealth(supabase, issues),
    pushHealth(supabase, issues),
    compoundMetrics(supabase, issues),
    inventoryMetrics(supabase, issues),
    intakeMetrics(supabase, issues),
    attributionMetrics(supabase, issues),
    feedbackSla(supabase, issues),
  ])

  // These two depend on the account total, so they run after `peopleMetrics`.
  const [adoption, consent] = await Promise.all([
    featureAdoption(supabase, people.totalAccounts, issues),
    consentCoverage(supabase, people.totalAccounts, issues),
  ])

  // ── Activity windows, all sliced from the one `writes` read ────────────────
  const thisWeekStart = daysAgo(6)
  const prevWeekStart = daysAgo(13)
  const activeThisWeek = activeIn(writes, thisWeekStart)
  const activePrevWeek = activeIn(writes, prevWeekStart, thisWeekStart)
  let returningWeekly = 0
  for (const id of activeThisWeek) if (activePrevWeek.has(id)) returningWeekly += 1

  const activeOwners = new Set(
    activeCompoundRows.map((r) => r.user_id).filter((id): id is string => Boolean(id))
  )

  // ── The onboarding funnel ─────────────────────────────────────────────────
  // Each step is a SUBSET of the one above it by construction (an account that
  // logged a dose necessarily has a protocol compound), so the percentages read
  // as drop-off rather than as unrelated ratios.
  const withProtocol = adoption.find((a) => a.label === "Protocol")?.users ?? 0
  const withDose = adoption.find((a) => a.label === "Dose logging")?.users ?? 0
  const steps = funnel([
    { label: "Created an account", count: people.totalAccounts },
    { label: "Finished onboarding", count: people.completedOnboarding },
    { label: "Added a compound", count: withProtocol },
    { label: "Logged a dose", count: withDose },
    { label: "Still logging (7d)", count: activeThisWeek.size },
  ])

  return {
    unavailable: false,
    issues: issues.list,
    rangeDays,
    users: {
      totalAccounts: people.totalAccounts,
      activeDaily: activeIn(writes, daysAgo(0)).size,
      activeWeekly: activeThisWeek.size,
      activeMonthly: activeIn(writes, daysAgo(29)).size,
      returningWeekly,
      retentionPct: percent(returningWeekly, activePrevWeek.size),
      // Set difference, computed and discarded here — no id is returned.
      neverWritten: Math.max(
        0,
        [...people.accountIds].filter((id) => !everActive.has(id)).length
      ),
      newAccounts: people.newAccounts,
      accountsByDay: people.accountsByDay,
      activityByDay: writesByDay(writes, daysAgo(window - 1)),
    },
    usage: {
      compoundsLogged,
      dosesLogged,
      usersWithActiveCompound: activeOwners.size,
      journalEntries,
      weightLogs,
      progressPhotos,
      labPanels,
    },
    growth: {
      signupsByDay: seriesByDay(
        waitlistRows.map((r) => r.created_at),
        since
      ),
      signupsInRange: waitlistRows.length,
      waitlistTotal,
    },
    funnel: steps,
    billing,
    webhooks,
    push,
    compounds,
    inventory,
    adoption,
    demographics: people.demographics,
    intake,
    attribution,
    feedback,
    consent,
  }
}

export type { AdminIssue } from "./core"
export type { FunnelStep } from "@/lib/admin/aggregate"
