import { AlertStrip } from "@/components/admin/AlertStrip"
import { Funnel } from "@/components/admin/charts"
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
      <AlertStrip alerts={alerts} issues={metrics.issues} />

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
          {money(rev.mrr, rev.currency)}
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
              /* The bar measures the MOVEMENT, not the metric's current level.
                 It used to pass `delta.current`, so a row read "Waitlist
                 signups +34% · 128" — the 128 being the total, not the change —
                 and every bar was scaled against the top mover's unrelated
                 current value, which pegged most of them at full width. */
              <div className="space-y-3">
                {movers.slice(0, 5).map((m) => {
                  const label = deltaLabel(m.delta, m.unit === "points" ? "points" : "count")
                  const up = m.delta.absolute > 0
                  const biggest = Math.max(
                    ...movers.slice(0, 5).map((x) => Math.abs(x.delta.absolute))
                  )
                  const width = biggest > 0 ? Math.max(4, (Math.abs(m.delta.absolute) / biggest) * 100) : 0
                  return (
                    <div key={m.key}>
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="min-w-0 truncate text-sm text-foreground">{m.label}</span>
                        <span
                          className={`shrink-0 font-mono text-sm tabular-nums ${
                            up ? "text-admin-positive" : "text-admin-negative"
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg-input">
                        <div
                          className={`h-full rounded-full ${
                            up ? "bg-admin-positive" : "bg-admin-negative"
                          }`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-text-muted">
                        {m.delta.previous} → {m.delta.current}
                        {m.previousLabel ? ` · ${m.previousLabel}` : ""}
                      </p>
                    </div>
                  )
                })}
              </div>
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
