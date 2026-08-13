import { RankedBars } from "@/components/admin/charts"
import { FeedbackList, type AdminFeedback } from "@/components/admin/FeedbackList"
import { GlassGrid, GlassGroup, GlassPanel, GlassRow, GlassStat } from "@/components/admin/glass"
import { ago, num } from "@/lib/admin/format"
import type { AdminMetrics } from "@/lib/db/admin"

/** Is anything broken, is the queue being worked, and who has agreed to what. */
export function SystemTab({
  metrics,
  feedback,
  emails,
  signedInAs,
}: {
  metrics: AdminMetrics
  feedback: AdminFeedback[]
  emails: { email: string; source: string | null; created_at: string }[]
  signedInAs: string
}) {
  const { webhooks, push, consent } = metrics
  const fb = metrics.feedback

  return (
    <div className="space-y-5">
      <GlassGrid cols={4}>
        <GlassStat
          index={0}
          label="Unprocessed webhooks"
          value={webhooks.unprocessed}
          tone={webhooks.unprocessed > 0 ? "negative" : "positive"}
          hint="Accepted but never handled"
        />
        <GlassStat
          index={1}
          label="Webhook events"
          value={webhooks.total}
          hint={`Last ${ago(webhooks.lastReceivedAt)}`}
        />
        <GlassStat
          index={2}
          label="Push devices"
          value={push.devices}
          hint={`${num(push.accounts)} accounts`}
        />
        <GlassStat
          index={3}
          label="Stale devices"
          value={push.stale}
          tone={push.stale > 0 ? "negative" : "neutral"}
          hint="Not seen in 30 days"
        />
      </GlassGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel index={4} title="Stripe event types" hint="Most recent 500">
          <RankedBars items={webhooks.byType} limit={7} />
        </GlassPanel>

        <GlassGroup index={5} label="Feedback queue">
          <GlassRow label="Open" value={num(fb.open)} />
          <GlassRow label="Resolved" value={num(fb.resolved)} muted />
          <GlassRow
            label="Oldest open"
            value={fb.oldestOpenDays === null ? "—" : `${fb.oldestOpenDays}d`}
            muted
          />
          <GlassRow
            label="Median fix time"
            value={fb.medianResolveHours === null ? "—" : `${fb.medianResolveHours}h`}
            muted
          />
          <GlassRow label="Arrived this week" value={num(fb.lastWeek)} muted />
        </GlassGroup>
      </div>

      {fb.byPath.length > 0 && (
        <GlassPanel index={6} title="Which screens generate feedback">
          <RankedBars items={fb.byPath} limit={8} showPct />
        </GlassPanel>
      )}

      <GlassPanel
        index={7}
        title={`Feedback${fb.total > 0 ? ` · ${fb.total}` : ""}`}
        action={
          feedback.length > 0 ? (
            <a
              href="/admin/export?dataset=feedback"
              className="text-xs text-text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Export CSV
            </a>
          ) : undefined
        }
      >
        <FeedbackList items={feedback} />
      </GlassPanel>

      {/* ── Consent. Rebuilt so it stops reporting a gap it does not have. ── */}
      <GlassGroup
        index={8}
        label="Consent & legal"
        hint="Two mechanisms exist and both count. Republishing a document does not re-prompt anyone."
      >
        <GlassRow
          label="Consented"
          value={num(consent.consented)}
          hint="By either mechanism — the real compliance number"
        />
        <GlassRow
          label="With a granular audit row"
          value={num(consent.withAuditTrail)}
          muted
        />
        <GlassRow
          label="Consented before the audit table existed"
          value={num(consent.preAuditTrail)}
          hint="Accepted via profiles.tos_accepted_at, which predates consent_records"
          muted
        />
        <GlassRow
          label="Never finished onboarding"
          value={num(consent.neverReachedGate)}
          hint="No data, no access — an activation number, not a legal one"
          muted
        />
        <GlassRow
          label="Has data but never consented"
          value={num(consent.unconsentedWithData)}
          hint="Should be zero forever. Anything else means the gate was bypassed."
          muted
        />
        <GlassRow
          label="On every current version"
          value={consent.onCurrentPct === null ? "—" : `${consent.onCurrentPct}%`}
          muted
        />
      </GlassGroup>

      {consent.currentVersions.length > 0 && (
        <GlassGroup index={9} label="Live legal versions">
          {consent.currentVersions.map((d) => (
            <GlassRow key={d.document} label={d.label} value={`v${d.version}`} muted />
          ))}
        </GlassGroup>
      )}

      {/* ── The email list, last and quiet. ─────────────────────────────── */}
      <GlassPanel
        index={10}
        title={`Email list${emails.length > 0 ? ` · showing ${emails.length}` : ""}`}
        hint="Kept for the mailing list. Not a growth metric any more."
        action={
          emails.length > 0 ? (
            <a
              href="/admin/export?dataset=waitlist"
              className="text-xs text-text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Export CSV
            </a>
          ) : undefined
        }
      >
        {emails.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing collected yet.</p>
        ) : (
          <div className="glass-divide -mx-6 max-h-80 overflow-y-auto">
            {emails.map((r, i) => (
              <div
                key={`${r.email}-${i}`}
                className="flex items-center justify-between gap-3 px-6 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.email}</span>
                <span className="min-w-0 max-w-[10rem] shrink truncate text-xs text-text-muted">
                  {(r.source ?? "").trim() || "(direct)"}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      <p className="pt-2 text-center text-xs text-text-muted">
        Founder-only · signed in as {signedInAs}
      </p>
    </div>
  )
}
