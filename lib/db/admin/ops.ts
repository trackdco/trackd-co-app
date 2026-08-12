import "server-only"

import { median, percent, tally, type Tally } from "@/lib/admin/aggregate"
import { CONSENT_DOC_LABELS, labelFor } from "@/lib/admin/labels"
import { columnValues, type AdminClient, type IssueLog } from "./core"

/**
 * Operational health — the feedback queue's pulse, and legal-consent coverage.
 *
 * The feedback MESSAGES are not read here. The queue on the page renders them
 * through the founder's own RLS-scoped client, gated by the "own OR founder"
 * SELECT policy, exactly as it did before. This module reads only the three
 * columns that answer "is the queue being worked": when it arrived, whether it
 * was resolved, and which screen it came from.
 */

const DAY_MS = 86_400_000

export interface FeedbackSla {
  total: number
  open: number
  resolved: number
  /** Age in days of the oldest unresolved note. Null when the queue is clear. */
  oldestOpenDays: number | null
  /** Median hours from arrival to resolution, across everything ever resolved. */
  medianResolveHours: number | null
  /** Which screens generate feedback, ranked. */
  byPath: Tally[]
  /** Notes that arrived in the last 7 days. */
  lastWeek: number
}

export async function feedbackSla(
  supabase: AdminClient,
  issues: IssueLog
): Promise<FeedbackSla> {
  const rows = await columnValues<{
    created_at: string | null
    resolved_at: string | null
    path: string | null
  }>(
    supabase,
    "beta_feedback",
    "created_at, resolved_at, path",
    issues,
    "Feedback queue"
  )

  const now = Date.now()
  const open = rows.filter((r) => !r.resolved_at)
  const resolved = rows.filter((r) => Boolean(r.resolved_at))

  const openAges = open
    .map((r) => (r.created_at ? Date.parse(r.created_at) : NaN))
    .filter((ms) => !Number.isNaN(ms))
  const oldestOpenMs = openAges.length > 0 ? Math.min(...openAges) : null

  const resolveDurations = resolved
    .map((r) => {
      const from = r.created_at ? Date.parse(r.created_at) : NaN
      const to = r.resolved_at ? Date.parse(r.resolved_at) : NaN
      return Number.isNaN(from) || Number.isNaN(to) ? NaN : to - from
    })
    // A negative duration means the timestamps disagree; it is bad data, not a
    // fast fix, and averaging it in would flatter the number.
    .filter((ms) => Number.isFinite(ms) && ms >= 0)

  const medianMs = median(resolveDurations)
  const weekAgo = now - 7 * DAY_MS

  return {
    total: rows.length,
    open: open.length,
    resolved: resolved.length,
    oldestOpenDays:
      oldestOpenMs === null ? null : Math.floor((now - oldestOpenMs) / DAY_MS),
    medianResolveHours: medianMs === null ? null : Math.round(medianMs / 3_600_000),
    byPath: tally(rows.map((r) => r.path)),
    lastWeek: rows.filter((r) => {
      const ms = r.created_at ? Date.parse(r.created_at) : NaN
      return !Number.isNaN(ms) && ms >= weekAgo
    }).length,
  }
}

export interface ConsentCoverage {
  /** Document + version, ranked by how many accounts accepted it. */
  byVersion: Tally[]
  /** Accounts holding at least one consent record. */
  accountsWithConsent: number
  /** Accounts with none at all. */
  accountsMissing: number
  /** Share of accounts on the CURRENT version of every current document. */
  onCurrentPct: number | null
  /** The live version of each document, from `legal_documents`. */
  currentVersions: { document: string; version: string }[]
}

/**
 * Who has accepted what, and who is on an old version.
 *
 * This is the number that matters the next time a legal document is republished:
 * a new version does not re-prompt anyone by itself, so without this the size of
 * the "still on 1.2" cohort is invisible until someone asks a question nobody
 * can answer.
 */
export async function consentCoverage(
  supabase: AdminClient,
  totalAccounts: number,
  issues: IssueLog
): Promise<ConsentCoverage> {
  const [records, current] = await Promise.all([
    columnValues<{ user_id: string | null; document: string | null; version: string | null }>(
      supabase,
      "consent_records",
      "user_id, document, version",
      issues,
      "Consent records"
    ),
    columnValues<{ doc_type: string | null; version: string | null }>(
      supabase,
      "legal_documents",
      "doc_type, version",
      issues,
      "Legal documents",
      (q) => q.eq("is_current", true)
    ),
  ])

  const currentVersions = current
    .filter((d): d is { doc_type: string; version: string } =>
      Boolean(d.doc_type && d.version)
    )
    .map((d) => ({ document: d.doc_type, version: d.version }))

  const withConsent = new Set(
    records.map((r) => r.user_id).filter((id): id is string => Boolean(id))
  )

  // "On current" means: for every document that HAS a current version, this
  // account holds a record at that version. Anything less is a stale acceptance.
  const currentByDoc = new Map(currentVersions.map((d) => [d.document, d.version]))
  const acceptedByUser = new Map<string, Set<string>>()
  for (const r of records) {
    if (!r.user_id || !r.document || !r.version) continue
    const key = `${r.document}@${r.version}`
    const set = acceptedByUser.get(r.user_id) ?? new Set<string>()
    set.add(key)
    acceptedByUser.set(r.user_id, set)
  }
  let onCurrent = 0
  if (currentByDoc.size > 0) {
    for (const [, accepted] of acceptedByUser) {
      const hasAll = [...currentByDoc.entries()].every(([doc, version]) =>
        accepted.has(`${doc}@${version}`)
      )
      if (hasAll) onCurrent += 1
    }
  }

  return {
    byVersion: tally(
      records.map((r) => (r.document && r.version ? `${r.document}@${r.version}` : null)),
      (k) => {
        const [doc, version] = k.split("@")
        return `${labelFor(CONSENT_DOC_LABELS, doc)} v${version}`
      }
    ),
    accountsWithConsent: withConsent.size,
    accountsMissing: Math.max(0, totalAccounts - withConsent.size),
    onCurrentPct: currentByDoc.size === 0 ? null : percent(onCurrent, totalAccounts),
    currentVersions,
  }
}
