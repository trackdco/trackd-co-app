import { RankedBars, SplitBar } from "@/components/admin/charts"
import { GlassGrid, GlassGroup, GlassPanel, GlassRow, GlassStat } from "@/components/admin/glass"
import { money, num } from "@/lib/admin/format"
import type { AdminMetrics } from "@/lib/db/admin"

/**
 * Money.
 *
 * `subscriptions` mirrors Stripe; `entitlements` is what the app actually gates
 * on. They are shown as separate numbers on purpose: if they ever disagree,
 * that disagreement is the most important thing on the page, and a single
 * merged figure would hide it.
 */
export function MoneyTab({ metrics }: { metrics: AdminMetrics }) {
  const { billing } = metrics
  const rev = billing.revenue
  const hasMoney = rev.mrr > 0

  return (
    <div className="space-y-5">
      <GlassPanel index={0}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-text-muted">
              Monthly recurring revenue
            </p>
            <p className="mt-2 text-[56px] leading-none font-extralight tracking-[-0.035em] tabular-nums text-foreground">
              {money(rev.mrr, rev.currency)}
            </p>
          </div>
          {hasMoney && (
            <div className="text-right">
              <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-text-muted">
                Annual run rate
              </p>
              <p className="mt-1 font-mono text-2xl font-light tabular-nums text-foreground">
                {money(rev.arr, rev.currency)}
              </p>
            </div>
          )}
        </div>

        {!hasMoney && (
          <div className="mt-5 border-t border-[var(--admin-glass-line-soft)] pt-4">
            <p className="text-sm text-accent-amber">Awaiting first customer</p>
            <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
              This becomes a real figure the moment someone pays — no change needed.
              Right now: {num(billing.trialing)} trialing, {num(billing.customers)} reached
              checkout, {num(metrics.funnel.at(-1)?.count ?? 0)} people still dosing this week.
            </p>
          </div>
        )}
        {rev.otherCurrency > 0 && (
          <p className="mt-3 text-xs text-admin-negative">
            {rev.otherCurrency} subscription{rev.otherCurrency === 1 ? " is" : "s are"} billed in
            another currency and {rev.otherCurrency === 1 ? "is" : "are"} excluded — MRR is never
            summed across currencies.
          </p>
        )}
      </GlassPanel>

      <GlassGrid cols={4}>
        <GlassStat index={1} label="Active" value={billing.active} hint="Accounts, not rows" />
        <GlassStat index={2} label="Trialing" value={billing.trialing} />
        <GlassStat
          index={3}
          label="Trials ending 7d"
          value={billing.trialsEndingSoon}
          hint="Convert or churn this week"
        />
        <GlassStat
          index={4}
          label="Cancelling"
          value={billing.cancelling}
          tone={billing.cancelling > 0 ? "negative" : "neutral"}
          hint="Ends at the period boundary"
        />
      </GlassGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel index={5} title="Subscriptions by status" hint="Rows, as Stripe reports them">
          <RankedBars items={billing.byStatus} showPct />
        </GlassPanel>

        <GlassPanel index={6} title="Who actually has access" hint="The table the app gates on">
          {billing.entitlementsBySource.length === 0 ? (
            <p className="text-sm text-text-muted">No active entitlements.</p>
          ) : (
            <SplitBar items={billing.entitlementsBySource} />
          )}
          <div className="mt-5 border-t border-[var(--admin-glass-line-soft)] pt-1">
            <GlassRow label="Accounts with access" value={num(billing.entitledAccounts)} />
            <GlassRow label="Reached Stripe checkout" value={num(billing.customers)} muted />
            <GlassRow label="Priced subscriptions" value={num(rev.subscriptions)} muted />
          </div>
        </GlassPanel>
      </div>

      {rev.byPlan.length > 0 && (
        <GlassPanel index={7} title="MRR by plan">
          {/* `count` is the MRR, rounded to whole currency units — the bar is
              comparing money, not subscription counts, so ranking by rows would
              put a cheap plan with many seats above an expensive one. */}
          <RankedBars
            items={rev.byPlan.map((p) => ({
              key: p.key,
              label: `${p.label} · ${p.subscriptions} sub${p.subscriptions === 1 ? "" : "s"}`,
              count: Math.round(p.mrr),
            }))}
            showPct
          />
        </GlassPanel>
      )}

      <GlassGroup
        index={8}
        label="How this is calculated"
        hint="So the number can be checked rather than trusted"
      >
        <GlassRow
          label="Counted"
          value="status = active"
          hint="A trial has never been charged; a past_due charge failed."
        />
        <GlassRow
          label="Priced from"
          value="Stripe, live"
          hint="No amount is hardcoded anywhere — rows carry a price id, nothing more."
          muted
        />
        <GlassRow
          label="Currency"
          value={rev.currency ? rev.currency.toUpperCase() : "—"}
          hint="Never summed across currencies."
          muted
        />
      </GlassGroup>
    </div>
  )
}
