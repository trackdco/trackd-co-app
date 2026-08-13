import { AlertStrip } from "@/components/admin/AlertStrip"
import { Funnel, RankedBars } from "@/components/admin/charts"
import { GlassGrid, GlassGroup, GlassPanel, GlassRow, GlassStat } from "@/components/admin/glass"
import { Sparkline } from "@/components/admin/Sparkline"
import type { Alert } from "@/lib/admin/alerts"
import { deltaDirection, deltaLabel, deltaTone, money, num } from "@/lib/admin/format"
import type { AdminMetrics } from "@/lib/db/admin"
import { CARD_EYEBROW } from "@/lib/ui-presets"

/**
 * Overview — the ten-second answer.
 *
 * ORDER IS THE DESIGN. Alerts, then the auto-written headline, then the four
 * numbers, then the funnel. "Is anything wrong" before "how are we doing"
 * before "where is it leaking", because that is the order those questions
 * actually get asked.
 */
export function OverviewTab({
  metrics,
  alerts,
  rangeLabel,
}: {
  metrics: AdminMetrics
  alerts: Alert[]
  rangeLabel: string
}) {
  const { users, billing, deltas, movers, records } = metrics
  const rev = billing.revenue
  const hasMoney = rev.mrr > 0

  return (
    <div className="space-y-5">
      <AlertStrip alerts={alerts} />

      {/* The dashboard's own reading of itself. Absent on a quiet week rather
          than reaching for a filler line — see `headline` in insights.ts. */}
      {metrics.headline && (
        <GlassPanel index={0}>
          <p className={CARD_EYEBROW}>What changed</p>
          <p className="mt-2 text-lg leading-snug font-light text-foreground">
            {metrics.headline}
          </p>
        </GlassPanel>
      )}

      {/* ── The hero: money, framed for the state it is actually in ───────── */}
      <GlassPanel index={1} className="relative overflow-hidden">
        <p className={CARD_EYEBROW}>Monthly recurring revenue</p>
        <p className="mt-2 text-[52px] leading-none font-extralight tracking-[-0.035em] tabular-nums text-foreground">
          {hasMoney ? money(rev.mrr, rev.currency) : "$0"}
        </p>
        {hasMoney ? (
          <p className="mt-3 text-sm text-text-muted">
            {money(rev.arr, rev.currency)} annual run rate ·{" "}
            {num(rev.payingAccounts)} paying{" "}
            {rev.arpu !== null && <>· {money(rev.arpu, rev.currency)} each</>}
          </p>
        ) : (
          /* Not a sad zero. The interesting numbers when revenue is empty are
             how many people are one step away from being the first. */
          <div className="mt-3 space-y-1">
            <p className="text-sm text-accent-amber">Awaiting first customer</p>
            <p className="text-xs leading-relaxed text-text-muted">
              {billing.trialing > 0
                ? `${billing.trialing} trial${billing.trialing === 1 ? "" : "s"} in flight`
                : "No trials in flight"}
              {" · "}
              {num(billing.customers)} reached checkout
              {" · "}
              {num(users.activeWeekly)} people used the app this week
            </p>
          </div>
        )}
        {rev.unpriced > 0 && (
          <p className="mt-3 text-xs text-admin-negative">
            {rev.unpriced} subscription{rev.unpriced === 1 ? "" : "s"} could not be priced —
            Stripe did not return a price for them, so they are excluded above.
          </p>
        )}
      </GlassPanel>

      {/* ── Four numbers ─────────────────────────────────────────────────── */}
      <GlassGrid cols={4}>
        <GlassStat
          index={2}
          label="Accounts"
          value={users.totalAccounts}
          delta={deltaLabel(deltas.totalAccounts)}
          direction={deltaDirection(deltas.totalAccounts)}
          tone={deltaTone(deltas.totalAccounts)}
          hint={`${num(users.newAccounts)} new in the ${rangeLabel}`}
          spark={
            users.accountsByDay.length > 1 ? (
              <Sparkline
                id="ov-accounts"
                values={users.accountsByDay.map((d) => d.count)}
                height={34}
                draw
                delay={220}
              />
            ) : undefined
          }
        />
        <GlassStat
          index={3}
          label="Active this week"
          value={users.activeWeekly}
          delta={deltaLabel(deltas.activeWeekly)}
          direction={deltaDirection(deltas.activeWeekly)}
          tone={deltaTone(deltas.activeWeekly)}
          hint="Wrote something in 7 days"
        />
        <GlassStat
          index={4}
          label="Activated"
          value={
            users.totalAccounts > 0
              ? Math.round(((users.totalAccounts - users.neverWritten) / users.totalAccounts) * 100)
              : null
          }
          suffix="%"
          hint={`${num(users.totalAccounts - users.neverWritten)} have written something`}
        />
        <GlassStat
          index={5}
          label="Paying or trialing"
          value={billing.live}
          hint={`${num(billing.entitledAccounts)} hold an entitlement`}
        />
      </GlassGrid>

      {/* ── Funnel + movers ──────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel
          index={6}
          title="Where people drop off"
          hint="All time. A funnel over a window would drop everyone who signed up before it."
        >
          <Funnel steps={metrics.funnel} />
        </GlassPanel>

        <div className="space-y-5">
          <GlassPanel index={7} title="Biggest movers" hint={`Against the previous ${rangeLabel}`}>
            {movers.length === 0 ? (
              <p className="text-sm text-text-muted">
                Nothing moved enough to be worth reporting.
              </p>
            ) : (
              <RankedBars
                items={movers.slice(0, 5).map((m) => ({
                  key: m.key,
                  label: `${m.label} ${deltaLabel(m.delta, m.unit === "points" ? "points" : "count") ?? ""}`,
                  count: Math.abs(m.delta.current),
                }))}
                limit={5}
              />
            )}
          </GlassPanel>

          <GlassGroup index={8} label="Records">
            <GlassRow
              label="Best day for signups"
              value={
                records.bestSignupDay
                  ? `${records.bestSignupDay.count} · ${records.bestSignupDay.day}`
                  : "—"
              }
            />
            <GlassRow
              label="Best day for doses"
              value={
                records.bestDoseDay
                  ? `${records.bestDoseDay.count} · ${records.bestDoseDay.day}`
                  : "—"
              }
              muted
            />
            <GlassRow
              label="Current activity streak"
              value={`${records.activityStreak} day${records.activityStreak === 1 ? "" : "s"}`}
              muted
            />
          </GlassGroup>
        </div>
      </div>
    </div>
  )
}
