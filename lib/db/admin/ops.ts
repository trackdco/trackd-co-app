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
  /**
   * Accounts that consented by EITHER mechanism — the real compliance number.
   *
   * TWO MECHANISMS EXIST, and counting only the newer one under-reported by 2
   * accounts and made the page look like it had a legal gap it did not have:
   *
   *  1. `consent_records` — the granular per-document, per-version audit added
   *     by Spec 12. Its earliest row anywhere is 2026-06-24.
   *  2. `profiles.is_18_plus` + `profiles.tos_accepted_at` — the ORIGINAL gate,
   *     and still the two columns `getSessionContext` actually reads to grant
   *     access. The two oldest accounts in the system (both 2026-06-08) accepted
   *     under this and predate the audit table entirely.
   *
   * A dashboard that reports compliance from the newer table alone says two
   * founders never agreed to the terms they wrote.
   */
  consented: number
  /** Of those, how many also hold a granular `consent_records` row. */
  withAuditTrail: number
  /** Consented before `consent_records` existed. History, not a gap. */
  preAuditTrail: number
  /**
   * Accounts that never finished onboarding, so never reached the gate.
   *
   * NOT a compliance failure, and reported separately for that reason. They hold
   * no data and cannot reach a single app screen — `getSessionContext` requires
   * `is_18_plus && tos_accepted_at`, so `app/(app)/layout.tsx` bounces them to
   * /welcome. Counting them as "missing consent" is what made this read as 84%
   * when nobody with access is unconsented.
   */
  neverReachedGate: number
  /**
   * Accounts that have WRITTEN DATA but consented by neither mechanism.
   *
   * This replaces a percentage that could only ever read 100%: "consented as a
   * share of accounts that got through the gate" is a tautology, because
   * getting through the gate IS consenting. This is the non-tautological
   * version, and the only one worth alarming on — data belonging to somebody
   * who never agreed to anything.
   *
   * It should be 0 forever. If it is not, either the gate was bypassed or a
   * write path exists that does not go through it, and both are serious.
   * Filled in by `index.ts`, which is where the written-users set lives.
   */
  unconsentedWithData: number
  /** Share of consented accounts on the CURRENT version of every document. */
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
  /**
   * Accounts that passed the gate by the ORIGINAL mechanism —
   * `is_18_plus && tos_accepted_at` on `profiles`. Read once by `peopleMetrics`
   * and handed in, because those are the columns the app itself gates on and
   * they are the only evidence the two pre-audit-table accounts have.
   */
  gatedIds: Set<string>,
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

  // ── The compliance numbers, counting BOTH mechanisms ──────────────────────
  // Consented = holds a granular audit row OR passed the original profiles gate.
  const consentedIds = new Set<string>([...gatedIds, ...withConsent])
  const preAuditTrail = [...gatedIds].filter((id) => !withConsent.has(id)).length

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
    consented: consentedIds.size,
    withAuditTrail: withConsent.size,
    preAuditTrail,
    // Everyone else never finished onboarding. They hold no data and the gate
    // blocks them; this is an activation number, not a legal one.
    neverReachedGate: Math.max(0, totalAccounts - consentedIds.size),
    // Filled in by `index.ts`, which holds the set of accounts that have
    // written anything. Zero here means "not yet computed", and index.ts always
    // computes it.
    unconsentedWithData: 0,
    // Null, not 0, when there is nothing live to be current WITH. Measured
    // against consented accounts, not all accounts, for the same reason.
    onCurrentPct:
      expectations.length === 0 ? null : percent(onCurrent, consentedIds.size),
    currentVersions,
  }

  // The funnel's gate step uses the SAME definition the app gates on, so the
  // two pre-audit-table accounts are not shown as having skipped a step they
  // demonstrably completed.
  return { coverage, userIds: consentedIds }
}
