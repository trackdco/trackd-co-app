/**
 * What needs you, in words that say what to do about it.
 *
 * This replaces a two-word status ("Check this") that Adrian correctly called
 * out as unactionable: it coloured a number red and left you to work out both
 * what was wrong and where to go. Every alert here carries three things — what
 * happened, what it means, and the next concrete step — because a dashboard
 * that can tell you something is broken can usually also tell you where to look.
 *
 * PURE. No React, no Supabase — it takes the finished metrics and returns a
 * ranked list, so the wording is unit-testable and the page just renders it.
 */

export type Severity = "critical" | "warning" | "info"

export interface Alert {
  id: string
  severity: Severity
  /** The fact, with its number. */
  title: string
  /** Why it matters, in one sentence. */
  what: string
  /** The next concrete step. */
  action: string
}

/** Only the fields alerts actually read — keeps this testable without a fixture. */
export interface AlertInput {
  unavailable: boolean
  issues: { label: string; detail: string }[]
  webhooks: { unprocessed: number; lastReceivedAt: string | null }
  feedback: { open: number; oldestOpenDays: number | null }
  billing: { cancelling: number; trialsEndingSoon: number }
  consent: { unconsentedWithData: number }
  push: { devices: number; stale: number }
  users: { totalAccounts: number; neverWritten: number }
}

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

export function buildAlerts(m: AlertInput, now: Date = new Date()): Alert[] {
  const out: Alert[] = []

  if (m.unavailable) {
    out.push({
      id: "no-service-key",
      severity: "critical",
      title: "Cross-user metrics are switched off",
      what: "Without the service key this page can only see your own rows, so every aggregate below would be wrong rather than merely empty.",
      action: "Set SUPABASE_SECRET_KEY in the Vercel project environment and redeploy.",
    })
  }

  if (m.issues.length > 0) {
    out.push({
      id: "failed-reads",
      severity: "critical",
      title: `${m.issues.length} source${m.issues.length === 1 ? "" : "s"} failed to read`,
      what: `The numbers below are missing whatever these would have contributed: ${m.issues
        .map((i) => i.label)
        .join(", ")}.`,
      action: "Check the detail under each one. A column that does not exist means a query drifted from the schema.",
    })
  }

  // This should be impossible. If it ever fires, something wrote data for an
  // account that never passed the 18+/ToS gate — which is a consent problem,
  // not a dashboard problem.
  if (m.consent.unconsentedWithData > 0) {
    out.push({
      id: "unconsented-data",
      severity: "critical",
      title: `${m.consent.unconsentedWithData} account${
        m.consent.unconsentedWithData === 1 ? " has" : "s have"
      } data but never consented`,
      what: "Every write should sit behind the 18+/ToS gate, so this should be zero. It means either the gate was bypassed or a write path exists that skips it.",
      action: "Find the accounts, work out which write path let them through, and close it before anything else on this page.",
    })
  }

  if (m.webhooks.unprocessed > 0) {
    out.push({
      id: "webhooks-stuck",
      severity: "critical",
      title: `${m.webhooks.unprocessed} Stripe event${
        m.webhooks.unprocessed === 1 ? " was" : "s were"
      } never handled`,
      what: "Events are recorded on arrival and stamped only once the handler succeeds. Unstamped means entitlements may be stale while payments keep going through — someone could be paying and see a free plan.",
      action: "Open the Vercel logs for /api/stripe/webhook and look for the failure, then replay those events from the Stripe dashboard.",
    })
  }

  // A webhook endpoint that has gone completely quiet is as bad as one that is
  // erroring, and it fails silently by definition.
  const lastMs = m.webhooks.lastReceivedAt ? Date.parse(m.webhooks.lastReceivedAt) : NaN
  if (Number.isFinite(lastMs)) {
    const days = Math.floor((now.getTime() - lastMs) / 86_400_000)
    if (days >= 14) {
      out.push({
        id: "webhooks-quiet",
        severity: "warning",
        title: `No Stripe event for ${days} days`,
        what: "Stripe sends events for far more than payments, so total silence usually means the endpoint is unreachable rather than that nothing happened.",
        action: "Send a test event from the Stripe dashboard and confirm it lands.",
      })
    }
  }

  if (m.feedback.open > 0) {
    const age = m.feedback.oldestOpenDays
    out.push({
      id: "feedback-open",
      severity: age !== null && age >= 7 ? "warning" : "info",
      title: `${m.feedback.open} piece${m.feedback.open === 1 ? "" : "s"} of feedback waiting`,
      what:
        age !== null && age > 0
          ? `The oldest has been sitting for ${age} day${age === 1 ? "" : "s"}.`
          : "All of it arrived recently.",
      action: "Read it on the System tab and tick each one off as you deal with it.",
    })
  }

  if (m.billing.cancelling > 0) {
    out.push({
      id: "cancelling",
      severity: "warning",
      title: `${m.billing.cancelling} subscription${
        m.billing.cancelling === 1 ? " is" : "s are"
      } set to end`,
      what: "They keep access until the period boundary, so this is churn that has not landed yet — and the only window in which it can still be reversed.",
      action: "Worth a message asking what went wrong while they are still customers.",
    })
  }

  if (m.billing.trialsEndingSoon > 0) {
    out.push({
      id: "trials-ending",
      severity: "info",
      title: `${m.billing.trialsEndingSoon} trial${
        m.billing.trialsEndingSoon === 1 ? "" : "s"
      } ending this week`,
      what: "These convert or churn in the next seven days.",
      action: "Nothing to do unless you want to reach out first.",
    })
  }

  if (m.push.devices > 0 && m.push.stale > 0 && m.push.stale / m.push.devices >= 0.4) {
    out.push({
      id: "push-stale",
      severity: "info",
      title: `${m.push.stale} of ${m.push.devices} push devices are stale`,
      what: "They have not checked in for 30 days, so reminders sent to them are going nowhere.",
      action: "Harmless, but worth pruning if the share keeps climbing.",
    })
  }

  // Activation, framed as the number it actually is rather than as a failure.
  if (m.users.totalAccounts >= 20 && m.users.neverWritten / m.users.totalAccounts >= 0.4) {
    const pct = Math.round((m.users.neverWritten / m.users.totalAccounts) * 100)
    out.push({
      id: "activation",
      severity: "warning",
      title: `${pct}% of accounts have never written anything`,
      what: `${m.users.neverWritten} of ${m.users.totalAccounts} signed up and then did nothing at all. That is an activation problem, not an acquisition one.`,
      action: "Check the funnel on the Users tab to see which step they stop at.",
    })
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity])
}

/** The worst severity present, for the header dot. Null when all clear. */
export function worstSeverity(alerts: Alert[]): Severity | null {
  if (alerts.length === 0) return null
  return alerts.reduce<Severity>(
    (worst, a) => (RANK[a.severity] < RANK[worst] ? a.severity : worst),
    "info"
  )
}
