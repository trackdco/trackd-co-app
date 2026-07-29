"use client"

import { Container } from "@/components/containers"
import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"
import { formatDateKeyShort, type StackCompound } from "@/lib/home/stack"
import {
  cycleColourVar,
  cycleStatusOn,
  formatCyclePattern,
  type CycleContext,
  type CycleRule,
} from "@/lib/protocol/cycleRule"

/**
 * One cycle: the compound's container, its name, its dose, and the end condition
 * (Spec 06 → Display).
 *
 * The container takes the CYCLE's colour rather than the category colour — this
 * is a cycle context, which is the surface the cycle colour exists for (Adrian's
 * call: cycle wins here, stack colour wins on the dashboard row).
 *
 * Near ends read as a countdown, far ends as a date. The crossover is owned by
 * `04-protocol.md`; until that lands this uses two weeks, which is where "in 9
 * days" stops being more useful than the date itself.
 */
const COUNTDOWN_HORIZON_DAYS = 14

export function CycleCard({
  compound,
  cycle,
  todayKey,
  ctx,
  inventoryType,
  onEdit,
}: {
  compound: StackCompound
  cycle: CycleRule
  todayKey: string
  ctx?: CycleContext
  /** Drives the container's form — vial, bottle or tub. */
  inventoryType?: string | null
  onEdit?: () => void
}) {
  const status = cycleStatusOn(cycle, todayKey, ctx)
  const colour = cycleColourVar(cycle.colour)

  return (
    <button
      type="button"
      onClick={onEdit}
      disabled={!onEdit}
      className="w-full rounded-2xl bg-bg-surface p-5 text-left transition active:scale-[0.98] disabled:active:scale-100"
    >
      <div className="flex items-center gap-4">
        <Container
          inventoryType={inventoryType}
          category={compound.category}
          stackColour={colour}
          fill={status.on ? 0.7 : 0.35}
          size={52}
        />

        <div className="min-w-0 flex-1 space-y-1">
          <p className={CARD_EYEBROW}>{formatCyclePattern(cycle.pattern)}</p>
          <p className="truncate text-base text-foreground">{compound.name}</p>
          <p className={DATA_MONO}>
            {compound.dose} {compound.unit}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              !status.on && "opacity-40"
            )}
            style={{ background: colour }}
            aria-hidden
          />
          <p className="mt-2 text-xs text-text-muted">{phaseLabel(status)}</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-text-muted">{endLabel(cycle, status, todayKey)}</p>
    </button>
  )
}

function phaseLabel(status: ReturnType<typeof cycleStatusOn>): string {
  if (status.ended) return "Ended"
  if (status.pending) return "Not started"
  if (status.daysLeftInPhase === null) return status.on ? "On" : "Off"
  const d = status.daysLeftInPhase
  return `${status.on ? "On" : "Off"} · ${d}d left`
}

/** Near ends count down; far ends state their date. */
function endLabel(
  cycle: CycleRule,
  status: ReturnType<typeof cycleStatusOn>,
  todayKey: string
): string {
  if (status.ended) return "This cycle has ended"

  switch (cycle.end.type) {
    case "never":
      return "No end set"
    case "whenVialEmpty":
      return "Ends when the vial runs out"
    case "afterRounds": {
      const done = (status.round ?? 0) + 1
      return `Round ${done} of ${cycle.end.rounds}`
    }
    case "onDate": {
      const days = daysBetween(todayKey, cycle.end.date)
      if (days === null) return `Ends ${formatDateKeyShort(cycle.end.date)}`
      if (days <= 0) return "Ends today"
      if (days <= COUNTDOWN_HORIZON_DAYS) {
        return `Ends in ${days} ${days === 1 ? "day" : "days"}`
      }
      return `Ends ${formatDateKeyShort(cycle.end.date)}`
    }
  }
}

function daysBetween(from: string, to: string): number | null {
  const a = parse(from)
  const b = parse(to)
  if (a === null || b === null) return null
  return b - a
}

function parse(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Math.floor(d.getTime() / 86_400_000)
}
