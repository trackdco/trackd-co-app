"use client"

import { PencilSimple } from "@/components/icons"

import { CARD_EYEBROW } from "@/lib/ui-presets"
import { cyclePosition, formatCyclePosition } from "@/lib/protocol/cycle"
import type { Cycle } from "@/lib/db/types"

/**
 * Plan-view header for the active cycle (Protocol Cutover, Step 4): the cycle
 * name, a "Week X of N" you-are-here marker derived from its dates, and an edit
 * affordance. Pure display — editing happens in the `CycleEditSheet` via `onEdit`.
 * The active-cycle "Week X of N" is settled state — white/neutral, not amber.
 */
export function CycleHeader({ cycle, onEdit }: { cycle: Cycle; onEdit: () => void }) {
  const pos = cyclePosition(cycle)
  const label = formatCyclePosition(pos)
  // Progress along the cycle, when both ends are known — a calm, neutral bar.
  const progress =
    pos.week !== null && pos.total
      ? Math.min(100, Math.max(0, ((pos.week - 1) / pos.total) * 100))
      : null

  return (
    <section className="rounded-2xl bg-bg-surface p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className={`${CARD_EYEBROW} truncate`}>{cycle.name}</h2>
          <p className="mt-1.5 text-sm text-foreground">{label}</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit cycle"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PencilSimple className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {progress !== null && (
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg-surface-raised"
          role="presentation"
        >
          <div
            className="h-full rounded-full bg-foreground/80 transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {cycle.notes && (
        <p className="mt-3 text-sm leading-relaxed text-text-muted">{cycle.notes}</p>
      )}
    </section>
  )
}
