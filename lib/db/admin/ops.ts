import "server-only"

import {
  consentExpectations,
  median,
  normalisePath,
  percent,
  safeVersion,
  tally,
  type Tally,
} from "@/lib/admin/aggregate"
import { CONSENT_DOC_LABELS, LEGAL_DOC_LABELS, labelFor } from "@/lib/admin/labels"
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
    // Through the allowlist — `path` is written from the client unvalidated.
    byPath: tally(rows.map((r) => normalisePath(r.path))),
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
  currentVersions: { document: string; label: string; version: string }[]
}

/**
 * `consentCoverage`'s result, split so the id set cannot leak.
 *
 * `coverage` is what the page renders. `userIds` is the set of accounts holding
 * any consent record, returned ONLY so `index.ts` can build the funnel's legal-
 * gate step from it instead of reading `consent_records` a second time. It stays
 * inside `lib/db/admin/` and is never part of `AdminMetrics`.
 */
export interface ConsentResult {
  coverage: ConsentCoverage
  userIds: Set<string>
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
): Promise<ConsentResult> {
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
    .map((d) => ({
      document: d.doc_type,
      label: labelFor(LEGAL_DOC_LABELS, d.doc_type),
      version: safeVersion(d.version) ?? d.version,
    }))

  const withConsent = new Set(
    records.map((r) => r.user_id).filter((id): id is string => Boolean(id))
  )

  // "On current" means: this account holds a consent record at the live version
  // of every live document. The expansion through `consentExpectations` is what
  // makes that comparable at all — `legal_documents.doc_type` and
  // `consent_records.document` are two different vocabularies that share no
  // values, so comparing them directly matches nothing and would render a
  // confident 0% forever.
  const expectations = consentExpectations(currentVersions)
  const acceptedByUser = new Map<string, Set<string>>()
  for (const r of records) {
    const version = safeVersion(r.version)
    if (!r.user_id || !r.document || !version) continue
    const set = acceptedByUser.get(r.user_id) ?? new Set<string>()
    set.add(`${r.document}@${version}`)
    acceptedByUser.set(r.user_id, set)
  }
  let onCurrent = 0
  if (expectations.length > 0) {
    for (const [, accepted] of acceptedByUser) {
      const hasAll = expectations.every((e) => accepted.has(`${e.document}@${e.version}`))
      if (hasAll) onCurrent += 1
    }
  }

  const coverage: ConsentCoverage = {
    byVersion: tally(
      // `version` is `text NOT NULL` with no CHECK and `authenticated` may INSERT
      // its own rows, so it is user-chosen: sanitised before it becomes a label.
      // Sanitising also fixes the composite key — a version containing "@" used
      // to truncate its own label when the key was split back apart.
      records.map((r) => {
        const version = safeVersion(r.version)
        return r.document && version ? `${r.document}@${version}` : null
      }),
      (k) => {
        const at = k.indexOf("@")
        const doc = k.slice(0, at)
        const version = k.slice(at + 1)
        return `${labelFor(CONSENT_DOC_LABELS, doc)} v${version}`
      }
    ),
    accountsWithConsent: withConsent.size,
    accountsMissing: Math.max(0, totalAccounts - withConsent.size),
    // Null, not 0, when there is nothing live to be current WITH.
    onCurrentPct: expectations.length === 0 ? null : percent(onCurrent, totalAccounts),
    currentVersions,
  }

  return { coverage, userIds: withConsent }
}
