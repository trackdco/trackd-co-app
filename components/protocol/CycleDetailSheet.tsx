"use client"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { CARD_EYEBROW, DATA_MONO, SHEET_TITLE } from "@/lib/ui-presets"
import { Container } from "@/components/containers"
import {
  cycleColourVar,
  cycleStatusOn,
  formatCyclePattern,
  type CycleContext,
  type CycleRule,
} from "@/lib/protocol/cycleRule"
import { describeCycleEnd } from "@/lib/calendar/cycleBands"
import { cadenceLabel, type StackCompound } from "@/lib/home/stack"

/**
 * Cycle detail — **a view, not a form**. Tapping a cycle shows where it is up to;
 * editing is a deliberate second step behind the Edit button.
 *
 * A cycle is never named, so this is headed by its compound — a cycle is just its
 * compound (Spec 06). The schedule is shown alongside the pattern to make the
 * relationship legible: the schedule decides which DAYS a dose falls on, the
 * cycle decides whether the compound is being run at all.
 */
export function CycleDetailSheet({
  open,
  onOpenChange,
  compound,
  cycle,
  todayKey,
  ctx,
  inventoryType,
  onEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  compound: StackCompound | null
  cycle: CycleRule | null
  todayKey: string
  ctx?: CycleContext
  inventoryType?: string | null
  onEdit: () => void
}) {
  if (!compound || !cycle) return null
  const status = cycleStatusOn(cycle, todayKey, ctx)
  const colour = cycleColourVar(cycle.colour)

  const phase = status.ended
    ? "Ended"
    : status.pending
      ? "Not started"
      : status.daysLeftInPhase === null
        ? status.on
          ? "On"
          : "Off"
        : `${status.on ? "On" : "Off"} · ${status.daysLeftInPhase}d left`

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
      >
        <SheetHeader>
          {/* Edit beside the title, small and muted — see StackDetailSheet. */}
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ background: colour }}
              aria-hidden
            />
            <SheetTitle className={`${SHEET_TITLE} min-w-0 flex-1 truncate`}>
              {compound.name}
            </SheetTitle>
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 text-sm text-text-muted transition-colors hover:text-text-primary active:text-text-primary"
            >
              Edit
            </button>
          </div>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-2">
          <div className="flex items-center gap-4">
            <Container
              inventoryType={inventoryType}
              category={compound.category}
              stackColour={colour}
              fill={status.on ? 0.7 : 0.35}
              size={64}
            />
            <div className="space-y-1">
              <p className={CARD_EYEBROW}>{formatCyclePattern(cycle.pattern)}</p>
              <p className="text-sm text-foreground">{phase}</p>
              <p className={DATA_MONO}>
                {compound.dose} {compound.unit}
              </p>
            </div>
          </div>

          <ul className="divide-y divide-border-default rounded-2xl bg-bg-surface-raised">
            <Row label="Pattern" value={formatCyclePattern(cycle.pattern)} />
            <Row label="Ends" value={capitalise(describeCycleEnd(cycle))} />
            <Row label="Started" value={cycle.anchor} mono />
            {/* The compound's own schedule, unchanged by the cycle. */}
            <Row label="Schedule" value={cadenceLabel(compound.schedule.cadence)} />
          </ul>

          <p className="text-xs text-text-muted">
            On its off days this compound disappears from the log entirely —
            nothing is due and nothing counts as missed.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm text-text-muted">{label}</span>
      <span
        className={
          mono
            ? "font-mono text-xs tabular-nums text-foreground"
            : "text-sm text-foreground"
        }
      >
        {value}
      </span>
    </li>
  )
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
