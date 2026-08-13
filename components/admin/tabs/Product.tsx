import { RankedBars, SplitBar } from "@/components/admin/charts"
import { GlassGrid, GlassGroup, GlassPanel, GlassRow, GlassStat } from "@/components/admin/glass"
import { deltaDirection, deltaLabel, deltaTone, num } from "@/lib/admin/format"
import type { AdminMetrics } from "@/lib/db/admin"

/** What people actually run, and which features are load-bearing. */
export function ProductTab({ metrics }: { metrics: AdminMetrics }) {
  const { compounds, inventory, usage, adoption, users, deltas } = metrics

  return (
    <div className="space-y-5">
      <GlassGrid cols={4}>
        <GlassStat index={0} label="Protocol entries" value={compounds.totalEntries} />
        <GlassStat index={1} label="Running now" value={compounds.activeEntries} />
        <GlassStat
          index={2}
          label="Doses logged"
          value={usage.dosesLogged}
          delta={deltaLabel(deltas.dosesLogged)}
          direction={deltaDirection(deltas.dosesLogged)}
          tone={deltaTone(deltas.dosesLogged)}
        />
        <GlassStat
          index={3}
          label="Custom compounds"
          value={compounds.customEntries}
          hint="Not in the catalogue"
        />
      </GlassGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel index={4} title="Top compounds" hint="Across every protocol">
          <RankedBars items={compounds.topCompounds} limit={12} />
        </GlassPanel>

        <div className="space-y-5">
          <GlassPanel index={5} title="By category">
            <SplitBar items={compounds.categories} />
          </GlassPanel>
          <GlassPanel index={6} title="By route">
            <SplitBar items={compounds.routes} />
          </GlassPanel>
          <GlassPanel index={7} title="By schedule">
            <SplitBar items={compounds.schedules} />
          </GlassPanel>
        </div>
      </div>

      <GlassPanel
        index={8}
        title="Feature adoption"
        hint="Accounts that have touched each feature. The point of this list is finding the dead ones."
      >
        {adoption.length === 0 ? (
          <p className="text-sm text-text-muted">No accounts yet.</p>
        ) : (
          <RankedBars
            items={adoption.map((a) => ({ key: a.label, label: a.label, count: a.users }))}
            limit={20}
            total={users.totalAccounts}
            showPct
          />
        )}
      </GlassPanel>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel index={9} title="Inventory" hint="The hardest feature you built">
          <SplitBar items={inventory.byType} />
          <div className="mt-5 border-t border-[var(--admin-glass-line-soft)] pt-1">
            <GlassRow label="Items tracked" value={num(inventory.total)} />
            <GlassRow label="Still active" value={num(inventory.active)} muted />
            <GlassRow label="Accounts tracking stock" value={num(inventory.accounts)} muted />
          </div>
        </GlassPanel>

        <GlassGroup index={10} label="Everything else logged">
          <GlassRow label="Journal entries" value={num(usage.journalEntries)} />
          <GlassRow label="Weight logs" value={num(usage.weightLogs)} muted />
          <GlassRow label="Progress photos" value={num(usage.progressPhotos)} muted />
          <GlassRow label="Lab panels" value={num(usage.labPanels)} muted />
          <GlassRow
            label="Accounts with an active compound"
            value={num(usage.usersWithActiveCompound)}
            muted
          />
        </GlassGroup>
      </div>
    </div>
  )
}
