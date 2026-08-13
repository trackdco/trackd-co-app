import { CohortGrid } from "@/components/admin/CohortGrid"
import { Funnel, RankedBars, SplitBar } from "@/components/admin/charts"
import { GlassGrid, GlassGroup, GlassPanel, GlassRow, GlassStat } from "@/components/admin/glass"
import { Sparkline } from "@/components/admin/Sparkline"
import { WorldMap } from "@/components/admin/WorldMap"
import { deltaDirection, deltaLabel, deltaTone, num } from "@/lib/admin/format"
import type { AdminMetrics } from "@/lib/db/admin"

/** Who they are, where they came from, and whether they stay. */
export function UsersTab({
  metrics,
  channels,
  rangeLabel,
}: {
  metrics: AdminMetrics
  channels: { key: string; label: string; count: number }[]
  rangeLabel: string
}) {
  const { users, growth, deltas, demographics, intake, attribution } = metrics

  return (
    <div className="space-y-5">
      <GlassGrid cols={4}>
        <GlassStat
          index={0}
          label="Active today"
          value={users.activeDaily}
          delta={deltaLabel(deltas.activeDaily)}
          direction={deltaDirection(deltas.activeDaily)}
          tone={deltaTone(deltas.activeDaily)}
          hint="UTC day, not local"
        />
        <GlassStat
          index={1}
          label="Active 30 days"
          value={users.activeMonthly}
          delta={deltaLabel(deltas.activeMonthly)}
          direction={deltaDirection(deltas.activeMonthly)}
          tone={deltaTone(deltas.activeMonthly)}
        />
        <GlassStat
          index={2}
          label="Weekly retention"
          value={users.retentionPct}
          suffix="%"
          delta={deltaLabel(deltas.retentionPct, "points")}
          direction={deltaDirection(deltas.retentionPct)}
          tone={deltaTone(deltas.retentionPct)}
          hint="Of last week's actives"
        />
        <GlassStat
          index={3}
          label="Never written"
          value={users.neverWritten}
          tone={users.neverWritten > 0 ? "negative" : "neutral"}
          hint="Signed up, did nothing at all"
        />
      </GlassGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel index={4} title="New accounts" hint={`The ${rangeLabel}`}>
          <p className="font-mono text-3xl font-light tabular-nums text-foreground">
            {num(users.newAccounts)}
          </p>
          <div className="mt-4">
            <Sparkline
              id="us-accounts"
              values={users.accountsByDay.map((d) => d.count)}
              height={54}
              draw
              delay={280}
            />
          </div>
        </GlassPanel>
        <GlassPanel index={5} title="Writes per day" hint="Every logged action, all users">
          <p className="font-mono text-3xl font-light tabular-nums text-foreground">
            {num(users.activityByDay.reduce((n, d) => n + d.count, 0))}
          </p>
          <div className="mt-4">
            <Sparkline
              id="us-activity"
              values={users.activityByDay.map((d) => d.count)}
              height={54}
              color="var(--admin-series-2)"
              draw
              delay={320}
            />
          </div>
        </GlassPanel>
      </div>

      <GlassPanel
        index={6}
        title="Retention by signup week"
        hint="The chart that says whether the product is getting better for newer users"
      >
        <CohortGrid grid={metrics.cohorts} />
      </GlassPanel>

      <GlassPanel index={7} title="Where people drop off">
        <Funnel steps={metrics.funnel} />
      </GlassPanel>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel index={8} title="Where they are">
          <WorldMap data={demographics.regions.map((r) => ({ region: r.key, count: r.count }))} />
        </GlassPanel>
        <div className="space-y-5">
          <GlassPanel index={9} title="Sex">
            <SplitBar items={demographics.sex} />
          </GlassPanel>
          <GlassPanel index={10} title="Age">
            <RankedBars items={demographics.ageBrackets} showPct />
            {demographics.missingDob > 0 && (
              <p className="mt-3 text-xs text-text-muted">
                {num(demographics.missingDob)} account
                {demographics.missingDob === 1 ? "" : "s"} with no date of birth recorded.
              </p>
            )}
          </GlassPanel>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel
          index={11}
          title="What they're running"
          hint="From onboarding. Counts only — the free-text box is never read."
        >
          {intake.answered === 0 ? (
            <p className="text-sm text-text-muted">
              No onboarding answers claimed onto an account yet.
            </p>
          ) : (
            <RankedBars items={intake.running} limit={10} total={intake.answered} showPct />
          )}
        </GlassPanel>
        <GlassPanel index={12} title="What they struggle with">
          {intake.answered === 0 ? (
            <p className="text-sm text-text-muted">Nothing recorded yet.</p>
          ) : (
            <RankedBars items={intake.struggle} limit={10} total={intake.answered} showPct />
          )}
        </GlassPanel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel index={13} title="Goal">
          <RankedBars items={demographics.goals} showPct />
        </GlassPanel>
        <GlassPanel index={14} title="How they found us">
          {attribution.answered === 0 ? (
            <p className="text-sm text-text-muted">Nobody has answered the attribution screen.</p>
          ) : (
            <>
              <RankedBars items={attribution.sources} total={attribution.answered} showPct />
              {attribution.codes.length > 0 && (
                <div className="mt-6">
                  <p className="mb-3 text-[10px] font-sans uppercase tracking-[0.18em] text-text-muted">
                    Creator codes
                  </p>
                  <RankedBars items={attribution.codes} limit={6} />
                </div>
              )}
            </>
          )}
        </GlassPanel>
      </div>

      {/* ── The email list. Demoted: this was the original point of the page,
             and it is now the least important thing on it. ──────────────── */}
      <GlassGroup
        index={15}
        label="Email list"
        hint={`${num(growth.waitlistTotal)} addresses collected. Kept for the mailing list, not a growth metric.`}
      >
        <GlassRow
          label="Collected in the last period"
          value={num(growth.signupsInRange)}
          trailing={deltaLabel(deltas.waitlistSignups) ?? undefined}
        />
        {channels.length > 0 && (
          <GlassRow
            label="Top channel"
            value={channels[0].label}
            hint={`${channels[0].count} of ${num(growth.waitlistTotal)}`}
            muted
          />
        )}
      </GlassGroup>
    </div>
  )
}
