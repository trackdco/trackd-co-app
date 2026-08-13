import "server-only"

import {
  dayKey,
  funnel,
  intersect,
  percent,
  seriesByDay,
  type FunnelStep,
} from "@/lib/admin/aggregate"
import { cohortGrid, type CohortGrid } from "@/lib/admin/cohorts"
import { delta, pointsDelta, type Delta } from "@/lib/admin/deltas"
import {
  buildRecords,
  headline,
  rankMovers,
  type Mover,
  type Records,
} from "@/lib/admin/insights"
import { activeIn, doseHistoryByDay, recentWrites, writesByDay } from "./activity"
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
  everWrittenAnything,
  featureAdoption,
  featureUserSets,
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

/**
 * Every headline number, against the period immediately before it.
 *
 * ── HOW THESE ARE READ, AND WHY THERE IS NO SECOND ROUND OF QUERIES ────────
 * Not one extra query. `peopleMetrics` already reads every profile and filters
 * in memory, so the previous window is another filter over rows in hand; the
 * activity read is WIDENED to twice the window it displays and sliced; the
 * waitlist read drops its `since` filter and is split the same way. Asking the
 * database for each window separately would double the query count on a page
 * that already fans out twenty ways, to compute numbers that are already sitting
 * in the arrays.
 *
 * ── WHY SO MANY OF THESE ARE NULLABLE ─────────────────────────────────────
 * Null means "there is no previous period", which is a real state and not a
 * failure: the All-time range has nothing before it, and comparing all of
 * history to the void would print "+100%" on every card forever. The page prints
 * nothing for a null, exactly as it prints "—" for a null percentage.
 */
export interface MetricDeltas {
  /** Total accounts now, against the total at the start of the range. */
  totalAccounts: Delta | null
  /** Accounts created in the range, against the range before it. */
  newAccounts: Delta | null
  /** Waitlist signups in the range, against the range before it. */
  waitlistSignups: Delta | null
  /** Doses logged in the range, against the range before it. */
  dosesLogged: Delta | null
  /** Active today, against yesterday. */
  activeDaily: Delta | null
  /** Active in 7 days, against the 7 before those. */
  activeWeekly: Delta | null
  /** Active in 30 days, against the 30 before those. */
  activeMonthly: Delta | null
  /**
   * Weekly retention, against the week before — in percentage POINTS.
   *
   * `pointsDelta`, never `delta`: retention going 30% → 40% is ten points, and
   * calling that "+33%" is a claim about a different quantity. See
   * `lib/admin/deltas.ts`.
   */
  retentionPct: Delta | null
  /**
   * Days on each side of the range-scoped comparisons. Null for All-time.
   *
   * The fixed-window deltas above (daily/weekly/monthly/retention) do NOT use
   * this — they always compare like for like against their own window, whatever
   * the range control says.
   */
  comparedDays: number | null
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
  /** Period-over-period movement for every headline number. */
  deltas: MetricDeltas
  /** Biggest movers, ranked. Significant ones first — see `rankMovers`. */
  movers: Mover[]
  /**
   * ONE plain-English sentence naming the most significant change, or null when
   * nothing moved enough to be worth saying. Null is the common case on a quiet
   * week and the page must render nothing rather than reach for a filler line.
   */
  headline: string | null
  /** All-time bests and the streak running right now. */
  records: Records
  /** Signup week × weeks-since-signup retention. Counts and percentages only. */
  cohorts: CohortGrid
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
    dosesLogged: 0,
    usersWithActiveCompound: 0,
    journalEntries: 0,
    weightLogs: 0,
    progressPhotos: 0,
    labPanels: 0,
  },
  growth: { signupsByDay: [], signupsInRange: 0, waitlistTotal: 0 },
  deltas: {
    totalAccounts: null,
    newAccounts: null,
    waitlistSignups: null,
    dosesLogged: null,
    activeDaily: null,
    activeWeekly: null,
    activeMonthly: null,
    retentionPct: null,
    comparedDays: null,
  },
  movers: [],
  headline: null,
  records: {
    bestSignupDay: null,
    bestDoseDay: null,
    biggestAccountDay: null,
    activityStreak: 0,
    streakWindowDays: 0,
  },
  cohorts: { weeks: [], rows: [], observedDays: 0 },
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
    revenue: {
      mrr: 0,
      arr: 0,
      currency: null,
      subscriptions: 0,
      payingAccounts: 0,
      arpu: null,
      byPlan: [],
      unpriced: 0,
      otherCurrency: 0,
    },
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
    consented: 0,
    withAuditTrail: 0,
    preAuditTrail: 0,
    neverReachedGate: 0,
    unconsentedWithData: 0,
    onCurrentPct: null,
    currentVersions: [],
  },
}

/**
 * How far back the activity read goes — the window the page DISPLAYS.
 *
 * THE FLOOR IS 30, AND IT HAS TO BE. Every activity window on the page is sliced
 * from this one read, and the widest of them is `activeMonthly` at 30 days. A
 * floor of 14 (retention's requirement) meant that selecting 7D quietly gave
 * "Active 30 days" only 14 days of writes to count — a smaller range control
 * silently shrinking an all-time-shaped number.
 *
 * "All time" is capped at 90 rather than reading every write ever made: the
 * activity sparkline is a recent-behaviour chart, and an unbounded read here is
 * the one query on this page that would grow without limit.
 *
 * The read that actually goes to the database is TWICE this — see
 * {@link activityReadWindow}. The extra half exists to be compared against, and
 * nothing drawn on the page comes from it.
 */
const WIDEST_ACTIVITY_WINDOW_DAYS = 30

function activityWindow(rangeDays: number | null): number {
  if (rangeDays === null) return 90
  return Math.min(365, Math.max(WIDEST_ACTIVITY_WINDOW_DAYS, rangeDays))
}

/**
 * How far back the activity read ACTUALLY goes: twice what the page displays.
 *
 * Every "vs the previous period" figure on the page is the second half of this
 * one read, sliced in memory. The alternative — a second query per window — is
 * five more round-trips for rows the first query could have brought back in the
 * same request, on a page that already fans out twenty ways.
 *
 * The doubling is what makes the comparisons possible at all: "active in the
 * last 30 days" needs 60 days of writes to have a previous 30 to compare
 * against, and the retention pair needs three whole weeks. The floor of 30 on
 * `activityWindow` therefore becomes a floor of 60 here, which covers both.
 *
 * Capped so a hypothetical year-long range cannot ask for two years of writes.
 * When the cap bites, `dosesComparable` in `getAdminMetrics` returns a null
 * delta rather than comparing a full period against a clipped one — which would
 * report the clipping as a fall.
 */
const MAX_ACTIVITY_READ_DAYS = 400

function activityReadWindow(displayWindow: number): number {
  return Math.min(MAX_ACTIVITY_READ_DAYS, displayWindow * 2)
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
  // The range immediately before the selected one, of the same length. Null for
  // All-time, where there is nothing before the beginning.
  const previousSince = rangeDays === null ? null : daysAgo(rangeDays * 2 - 1)
  const window = activityWindow(rangeDays)
  const readWindow = activityReadWindow(window)

  const [
    people,
    writes,
    featureSets,
    waitlistRows,
    waitlistTotal,
    dosesLogged,
    doseDays,
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
    peopleMetrics(supabase, since, previousSince, issues),
    recentWrites(supabase, readWindow, issues),
    featureUserSets(supabase, issues),
    columnValues<{ created_at: string | null }>(
      supabase,
      "waitlist",
      "created_at",
      issues,
      "Waitlist signups",
      // NO `since` FILTER ANY MORE, and that is the widening rather than an
      // oversight. One read now answers three questions — the in-range series,
      // the previous period it is compared against, and the best signup day
      // there has ever been — where the filtered version could only answer the
      // first and would have needed two more queries for the other two. The
      // in-range split happens in memory below.
      undefined
    ),
    countRows(supabase, "waitlist", issues, "Waitlist total"),
    countRows(supabase, "dose_logs", issues, "Dose count"),
    doseHistoryByDay(supabase, issues),
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

  // Depends on the account total, so it runs after `peopleMetrics`.
  const consent = await consentCoverage(supabase, people.totalAccounts, people.gatedIds, issues)
  const adoption = featureAdoption(featureSets, people.totalAccounts)
  const everWritten = everWrittenAnything(featureSets)

  // ── Activity windows, all sliced from the one `writes` read ────────────────
  //
  // Each window now comes in a pair — the current one and the one immediately
  // before it — because `readWindow` is twice `window`. Nothing here queries
  // again; every previous-period figure below is a second slice of the same
  // array.
  const today = daysAgo(0)
  const yesterday = daysAgo(1)
  const thisWeekStart = daysAgo(6)
  const prevWeekStart = daysAgo(13)
  // Three weeks back, so LAST week's retention has a week to be measured against.
  const weekBeforeStart = daysAgo(20)
  const thisMonthStart = daysAgo(29)
  const prevMonthStart = daysAgo(59)

  const activeToday = activeIn(writes, today)
  const activeYesterday = activeIn(writes, yesterday, today)
  const activeThisWeek = activeIn(writes, thisWeekStart)
  const activePrevWeek = activeIn(writes, prevWeekStart, thisWeekStart)
  const activeWeekBefore = activeIn(writes, weekBeforeStart, prevWeekStart)
  const activeThisMonth = activeIn(writes, thisMonthStart)
  const activePrevMonth = activeIn(writes, prevMonthStart, thisMonthStart)

  // `intersect` rather than a hand-rolled loop, so both retention figures are
  // computed by the same code and cannot drift apart.
  const returningWeekly = intersect(activeThisWeek, activePrevWeek).size
  const retentionPct = percent(returningWeekly, activePrevWeek.size)
  const previousRetentionPct = percent(
    intersect(activePrevWeek, activeWeekBefore).size,
    activeWeekBefore.size
  )

  const activeOwners = new Set(
    activeCompoundRows.map((r) => r.user_id).filter((id): id is string => Boolean(id))
  )

  // ── The onboarding funnel ─────────────────────────────────────────────────
  //
  // BUILT BY SET INTERSECTION, NOT BY COMPARING INDEPENDENT COUNTS. Each step is
  // the previous step's members who also did the next thing, so the funnel
  // decreases monotonically because of how it is constructed rather than because
  // the data happened to cooperate. Two things made the naive version wrong:
  //
  //  - The live data is NOT naturally nested. Two accounts hold a protocol
  //    compound with no consent record at all (they predate the gate), which
  //    made "% of the step above" exceed 100 — a funnel bar longer than the one
  //    it descends from.
  //  - The last step counts a DOSE this week, not "wrote anything" this week.
  //    Somebody can log a weight without ever logging a dose.
  //
  // "Passed the legal gate" replaces what was going to be `onboarding_completed_at`.
  // THAT COLUMN IS DEAD: it exists in `profiles`, nothing in the codebase writes
  // it, and all 90 live accounts have it null. A funnel step reading it would
  // have printed a confident 0 forever. `consent_records` is the real signal —
  // `app/welcome/actions.ts` writes it and only then grants app access, so a
  // consent record is what "got through onboarding" actually means.
  // `consent.userIds` rather than a second read of `consent_records` — two
  // unordered reads of one table can also disagree with each other.
  const consentIds = consent.userIds
  const dosedThisWeek = activeIn(writes, thisWeekStart, undefined, ["dose_logs"])

  // Reuses the sets already read for adoption rather than re-reading
  // `protocol_compounds` and `dose_logs` all-time a second time.
  const reachedGate = intersect(people.accountIds, consentIds)
  const reachedProtocol = intersect(
    reachedGate,
    featureSets.get("Protocol") ?? new Set<string>()
  )
  const reachedDose = intersect(
    reachedProtocol,
    featureSets.get("Dose logging") ?? new Set<string>()
  )
  const stillDosing = intersect(reachedDose, dosedThisWeek)

  const steps = funnel([
    { label: "Created an account", count: people.accountIds.size },
    { label: "Passed the legal gate", count: reachedGate.size },
    { label: "Added a compound", count: reachedProtocol.size },
    { label: "Logged a dose", count: reachedDose.size },
    { label: "Still dosing (7d)", count: stillDosing.size },
  ])

  // ── The waitlist, split in memory from the one unfiltered read ─────────────
  //
  // An undated row counts as neither period. It cannot be placed, and dropping
  // it from both sides is the only treatment that leaves the comparison honest;
  // putting it in the baseline would manufacture a fall.
  const sinceMs = since?.getTime() ?? Number.NEGATIVE_INFINITY
  const previousSinceMs = previousSince?.getTime() ?? null
  const signupMs = waitlistRows
    .map((r) => (r.created_at ? Date.parse(r.created_at) : Number.NaN))
    .filter((ms) => !Number.isNaN(ms))
  const signupsInRange = signupMs.filter((ms) => ms >= sinceMs).length
  const signupsPrevious =
    previousSinceMs === null
      ? null
      : signupMs.filter((ms) => ms >= previousSinceMs && ms < sinceMs).length

  // ── Doses inside the range, and inside the range before it ────────────────
  //
  // ROWS, not distinct users — `activeIn` answers a different question. Counted
  // off `writes` rather than off a new query, which is only possible because the
  // activity read is twice as wide as the window it draws.
  const doseCount = (from: number, to: number): number =>
    writes.filter((w) => {
      if (w.table !== "dose_logs") return false
      const ms = Date.parse(w.at)
      return !Number.isNaN(ms) && ms >= from && ms < to
    }).length
  const nowMs = Date.now()
  // Only claimable when the widened read actually covers BOTH periods. A range
  // wider than half the read would compare a full period against a clipped one
  // and report the clipping as a fall.
  const dosesComparable = rangeDays !== null && readWindow >= rangeDays * 2
  const dosesDelta = dosesComparable
    ? delta(doseCount(sinceMs, nowMs), doseCount(previousSinceMs ?? 0, sinceMs))
    : null

  const deltas: MetricDeltas = {
    totalAccounts:
      rangeDays === null ? null : delta(people.totalAccounts, people.accountsBefore),
    newAccounts:
      people.newAccountsPrevious === null
        ? null
        : delta(people.newAccounts, people.newAccountsPrevious),
    waitlistSignups:
      signupsPrevious === null ? null : delta(signupsInRange, signupsPrevious),
    dosesLogged: dosesDelta,
    activeDaily: delta(activeToday.size, activeYesterday.size),
    activeWeekly: delta(activeThisWeek.size, activePrevWeek.size),
    activeMonthly: delta(activeThisMonth.size, activePrevMonth.size),
    // POINTS, not percent — see `pointsDelta`.
    retentionPct: pointsDelta(retentionPct, previousRetentionPct),
    comparedDays: rangeDays,
  }

  // ── The headline sentence ─────────────────────────────────────────────────
  //
  // Each mover names its OWN comparison window. The range control moves the
  // range-scoped ones; the active-user and retention windows are fixed at a
  // day/week/month whatever the control says, and captioning those with the
  // selected range would be a false statement rather than a loose one.
  const rangeLabel =
    rangeDays === null ? "the previous period" : `the previous ${rangeDays} days`
  const movers = rankMovers([
    { key: "accounts", label: "Accounts", delta: deltas.totalAccounts, previousLabel: rangeLabel },
    { key: "newAccounts", label: "New accounts", delta: deltas.newAccounts, previousLabel: rangeLabel },
    { key: "signups", label: "Waitlist signups", delta: deltas.waitlistSignups, previousLabel: rangeLabel },
    { key: "doses", label: "Doses logged", delta: deltas.dosesLogged, previousLabel: rangeLabel },
    { key: "activeDaily", label: "Active today", delta: deltas.activeDaily, previousLabel: "yesterday" },
    { key: "activeWeekly", label: "Weekly actives", delta: deltas.activeWeekly, previousLabel: "the previous week" },
    { key: "activeMonthly", label: "Monthly actives", delta: deltas.activeMonthly, previousLabel: "the previous 30 days" },
    {
      key: "retention",
      label: "Weekly retention",
      delta: deltas.retentionPct,
      unit: "points",
      previousLabel: "the previous week",
    },
  ])

  // ── Records, and the cohort grid ──────────────────────────────────────────
  const activityByDayWide = writesByDay(writes, daysAgo(readWindow - 1))
  const records = buildRecords({
    // All-time series for the three "ever" records; the range-scoped ones on the
    // page would reset a record every time somebody clicked 7D.
    signupsByDay: seriesByDay(
      waitlistRows.map((r) => r.created_at),
      null
    ),
    dosesByDay: doseDays,
    accountsByDay: people.accountsByDayAllTime,
    activityByDay: activityByDayWide,
    streakWindowDays: readWindow,
    today: dayKey(new Date()),
  })

  // Per-user signup and write dates go IN; cohort sizes and percentages come
  // out. `observedFrom` is the honest edge of the activity read — without it the
  // grid would print 0% for every week older than the window rather than null.
  const cohorts = cohortGrid({
    signups: people.signups,
    activity: writes.map((w) => ({ userId: w.userId, at: w.at })),
    observedFrom: daysAgo(readWindow - 1),
  })

  return {
    unavailable: false,
    issues: issues.list,
    rangeDays,
    users: {
      totalAccounts: people.totalAccounts,
      activeDaily: activeToday.size,
      activeWeekly: activeThisWeek.size,
      activeMonthly: activeThisMonth.size,
      returningWeekly,
      retentionPct,
      // Set difference, computed and discarded here — no id is returned.
      // Measured against EVERY feature surface, not just the five "activity"
      // tables, so this cannot contradict the adoption chart beside it.
      neverWritten: [...people.accountIds].filter(
        (id) => !everWritten.has(id)
      ).length,
      newAccounts: people.newAccounts,
      accountsByDay: people.accountsByDay,
      // The DISPLAY window, not the read window: the sparkline still shows what
      // the range control asked for. The extra history behind it exists to be
      // compared against, not to be drawn.
      activityByDay: writesByDay(writes, daysAgo(window - 1)),
    },
    usage: {
      dosesLogged,
      usersWithActiveCompound: activeOwners.size,
      journalEntries,
      weightLogs,
      progressPhotos,
      labPanels,
    },
    growth: {
      // `seriesByDay` only EMITS days from `since` onward, so handing it the
      // now-unfiltered read still produces exactly the range the page asked for.
      signupsByDay: seriesByDay(
        waitlistRows.map((r) => r.created_at),
        since
      ),
      // …but the COUNT has to be the filtered one now that the read is all-time.
      signupsInRange,
      waitlistTotal,
    },
    deltas,
    movers,
    headline: headline(movers, rangeLabel),
    records,
    cohorts,
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
    consent: {
      ...consent.coverage,
      // Computed here because this is where the written-users set lives. Should
      // be 0 forever: data belonging to somebody who never consented would mean
      // the gate was bypassed or a write path exists that skips it.
      unconsentedWithData: [...everWritten].filter((id) => !consent.userIds.has(id))
        .length,
    },
  }
}

export type { AdminIssue } from "./core"
export type { FunnelStep } from "@/lib/admin/aggregate"
