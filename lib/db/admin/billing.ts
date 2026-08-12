import "server-only"

import { tally, type Tally } from "@/lib/admin/aggregate"
import { isEntitlementActive } from "@/lib/billing/access"
import { columnValues, countRows, daysAgo, type AdminClient, type IssueLog } from "./core"

/**
 * Billing aggregates — subscriptions, entitlements, and the Stripe webhook's
 * pulse.
 *
 * Reads `subscriptions` (the local MIRROR of Stripe) for the status breakdown,
 * because that is the table that knows about trials and pending cancellations.
 * It reads `entitlements` for who actually HAS access, because that is the only
 * table the app gates on. Those two are deliberately separate and this module
 * keeps them separate: if they ever disagree, the dashboard should show the
 * disagreement rather than paper over it, which is why "entitled" and "active
 * subscription" are two numbers here and never one.
 *
 * Nothing here reads a Stripe id, a customer id, or a webhook payload.
 */

const STATUS_LABELS: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  unpaid: "Unpaid",
  paused: "Paused",
}

const SOURCE_LABELS: Record<string, string> = {
  stripe: "Stripe",
  apple: "Apple",
  google: "Google",
  comp: "Comped",
}

export interface BillingMetrics {
  /** Subscription ROWS by Stripe status, ranked. */
  byStatus: Tally[]
  /** ACCOUNTS with an `active` subscription. */
  active: number
  /** ACCOUNTS with a `trialing` subscription. */
  trialing: number
  /**
   * ACCOUNTS paying or trialing — the number that matters for "is this working".
   *
   * Counted as distinct `user_id`s, not rows. `subscriptions` has `id` as its
   * primary key with `user_id` merely indexed, so one account can hold several
   * rows (a resubscribe after a cancellation is the ordinary case). This number
   * sits in the Overview grid beside "Accounts", where it reads as a count of
   * people — so it has to be one.
   */
  live: number
  /** Set to end at the period boundary: churn that has not landed yet. */
  cancelling: number
  /** Trials whose `trial_ends_at` falls in the next 7 days. */
  trialsEndingSoon: number
  /** Active entitlements by source — the table the app actually gates on. */
  entitlementsBySource: Tally[]
  /** Accounts holding any active entitlement. */
  entitledAccounts: number
  /** Rows in `billing_customers` — accounts that ever reached Stripe. */
  customers: number
}

export async function billingMetrics(
  supabase: AdminClient,
  issues: IssueLog
): Promise<BillingMetrics> {
  const soon = new Date()
  soon.setUTCDate(soon.getUTCDate() + 7)

  const [subRows, entRows, customers] = await Promise.all([
    columnValues<{
      user_id: string | null
      status: string | null
      cancel_at_period_end: boolean | null
      trial_ends_at: string | null
    }>(
      supabase,
      "subscriptions",
      "user_id, status, cancel_at_period_end, trial_ends_at",
      issues,
      "Subscriptions"
    ),
    // `active_until` is not decoration — see the filter below.
    columnValues<{
      source: string | null
      user_id: string | null
      is_active: boolean | null
      active_until: string | null
    }>(
      supabase,
      "entitlements",
      "source, user_id, is_active, active_until",
      issues,
      "Entitlements",
      (q) => q.eq("is_active", true)
    ),
    countRows(supabase, "billing_customers", issues, "Billing customers"),
  ])

  const byStatus = tally(
    subRows.map((r) => r.status),
    (k) => STATUS_LABELS[k] ?? k
  )
  /** Distinct ACCOUNTS holding a subscription in any of these statuses. */
  const accountsWith = (...statuses: string[]) =>
    new Set(
      subRows
        .filter((r) => r.status && statuses.includes(r.status))
        .map((r) => r.user_id)
        .filter((id): id is string => Boolean(id))
    ).size

  const trialing = accountsWith("trialing")
  const active = accountsWith("active")

  /** Distinct ACCOUNTS behind a set of subscription rows. */
  const accountsIn = (rows: typeof subRows) =>
    new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id))).size

  // ACCOUNTS, not rows — the same reason `active`/`trialing` count accounts.
  // These four tiles sit in one grid; three counting people and one counting
  // rows would be worse than either choice made consistently.
  const nowMs = Date.now()
  const soonMs = soon.getTime()
  const trialsEndingSoon = accountsIn(
    subRows.filter((r) => {
      if (r.status !== "trialing" || !r.trial_ends_at) return false
      const ms = Date.parse(r.trial_ends_at)
      return !Number.isNaN(ms) && ms >= nowMs && ms <= soonMs
    })
  )

  // Only counts against a subscription that is still live — a `cancel_at_period_end`
  // flag left set on an already-canceled row is history, not pending churn.
  const cancelling = accountsIn(
    subRows.filter(
      (r) =>
        r.cancel_at_period_end === true &&
        (r.status === "active" || r.status === "trialing")
    )
  )

  /**
   * `is_active` ALONE IS NOT ENTITLEMENT, and reading it as if it were made this
   * number monotonically increasing.
   *
   * `lib/billing/sync.ts` deliberately leaves `is_active = true` on cancellation
   * and lets `active_until` lapse naturally, so the user keeps what they paid
   * for to the end of the period. That means a row belonging to someone who
   * cancelled in June still has `is_active = true` today. Filtering on it alone
   * counted every user who has EVER been entitled, forever, under a heading that
   * says "Accounts with access".
   *
   * `isEntitlementActive` is the app's own gate (`lib/billing/access.ts`) — the
   * exact function `hasProAccess()` uses. Importing it rather than restating the
   * rule is the point: a dashboard that computes access differently from the
   * product is a dashboard that disagrees with the product.
   */
  const now = new Date()
  const liveEntitlements = entRows.filter((r) =>
    isEntitlementActive(
      { isActive: r.is_active ?? false, activeUntil: r.active_until },
      now
    )
  )

  const entitledAccounts = new Set(
    liveEntitlements.map((r) => r.user_id).filter((id): id is string => Boolean(id))
  ).size

  return {
    byStatus,
    trialing,
    active,
    // NOT `trialing + active`: one account can hold both (a trial row left
    // behind by a resubscribe), and adding the two would double-count them.
    live: accountsWith("trialing", "active"),
    cancelling,
    trialsEndingSoon,
    entitlementsBySource: tally(
      liveEntitlements.map((r) => r.source),
      (k) => SOURCE_LABELS[k] ?? k
    ),
    entitledAccounts,
    customers,
  }
}

export interface WebhookHealth {
  /** Every event Stripe has ever sent. */
  total: number
  /** Received but never marked processed — the number that means "broken". */
  unprocessed: number
  /** When the most recent event arrived, ISO. Null when none ever has. */
  lastReceivedAt: string | null
  /** Event types by volume, most recent 500 events. */
  byType: Tally[]
}

/**
 * The Stripe webhook's pulse.
 *
 * `unprocessed` is the one to watch: `webhook_events` is written FIRST and
 * stamped `processed_at` only after the handler succeeds, so a row that never
 * gets stamped is an event that was accepted and then dropped on the floor. A
 * silently failing webhook means entitlements stop being written while payments
 * keep succeeding, and without this number the first report of it is a paying
 * user emailing to say the app thinks they are on a free plan.
 *
 * The `payload` column is never selected. It is a full Stripe object and has no
 * business being read to render a count.
 */
export async function webhookHealth(
  supabase: AdminClient,
  issues: IssueLog
): Promise<WebhookHealth> {
  const [total, unprocessed, recent] = await Promise.all([
    countRows(supabase, "webhook_events", issues, "Webhook events"),
    countRows(supabase, "webhook_events", issues, "Unprocessed webhooks", (q) =>
      q.is("processed_at", null)
    ),
    columnValues<{ type: string | null; received_at: string | null }>(
      supabase,
      "webhook_events",
      "type, received_at",
      issues,
      "Webhook types",
      (q) => q.order("received_at", { ascending: false }).limit(500),
      true // a deliberate sample: the most recent 500, not every event ever
    ),
  ])

  return {
    total,
    unprocessed,
    lastReceivedAt: recent[0]?.received_at ?? null,
    byType: tally(recent.map((r) => r.type)),
  }
}

/** Push delivery health — how many devices are reachable, and how many are stale. */
export interface PushHealth {
  /** Subscription rows across all devices. */
  devices: number
  /** Distinct accounts with at least one device registered. */
  accounts: number
  /** Devices not seen in 30 days — candidates for pruning. */
  stale: number
}

export async function pushHealth(
  supabase: AdminClient,
  issues: IssueLog
): Promise<PushHealth> {
  const rows = await columnValues<{ user_id: string | null; last_seen_at: string | null }>(
    supabase,
    "push_subscriptions",
    "user_id, last_seen_at",
    issues,
    "Push subscriptions"
  )
  const cutoff = daysAgo(30).getTime()
  return {
    devices: rows.length,
    accounts: new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id))).size,
    stale: rows.filter((r) => {
      const ms = r.last_seen_at ? Date.parse(r.last_seen_at) : NaN
      return Number.isNaN(ms) || ms < cutoff
    }).length,
  }
}
