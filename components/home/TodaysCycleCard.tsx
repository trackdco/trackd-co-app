"use client"

import { useRef, useState } from "react"
import { AlertTriangle, Check, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
} from "@/lib/compound-categories"
import type { DateKey, DayStatus, DoseLog } from "@/lib/home/mockHomeData"
import { formatTimeLabel, type StackCompound } from "@/lib/home/stack"
import { ConsistencyStrip } from "@/components/home/ConsistencyStrip"

/** A due compound plus its log state and the resolved next-site label. */
export type DueDose = StackCompound & {
  log: DoseLog | null
  /** Resolved label of the site the next dose goes into; null = no rotation. */
  nextSiteLabel: string | null
  /** True when another compound lands on this same site today. */
  clash: boolean
}

interface TodaysCycleCardProps {
  isToday: boolean
  /** Heading for the selected day — "Today's Cycle" or e.g. "Monday's Cycle". */
  title: string
  /** "Xh Ym" once computed on mount; null hides the line (and past days). */
  countdown: string | null
  nextDoseName: string
  dueDoses: DueDose[]
  /** Two or more compounds land on the same site today — show the flag. */
  hasClash: boolean
  consistencyItems: { key: DateKey; status: DayStatus }[]
  todayKey: DateKey
  onLog: (dose: StackCompound) => void
  onEdit: (dose: StackCompound, log: DoseLog) => void
  /** Tap the row body → open this compound's detail (sheet wired in a later slice). */
  onOpenDetail: (dose: StackCompound) => void
}

function formatDose(dose: number): string {
  return Number.isInteger(dose) ? String(dose) : dose.toFixed(2).replace(/0$/, "")
}

function DoseRow({
  dose,
  divider,
  onLog,
  onEdit,
  onOpenDetail,
}: {
  dose: DueDose
  divider: boolean
  onLog: (dose: StackCompound) => void
  onEdit: (dose: StackCompound, log: DoseLog) => void
  onOpenDetail: (dose: StackCompound) => void
}) {
  const meta = CATEGORY_META[dose.category] ?? FALLBACK_CATEGORY_META
  const log = dose.log
  const [ripples, setRipples] = useState<
    { id: number; x: number; y: number; size: number }[]
  >([])
  const rippleSeq = useRef(0)

  // A soft amber glow that spreads from the touch point as the detail opens —
  // the same "light-up" idiom as the Shortcuts cards.
  function spawnRipple(e: React.PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const size =
      Math.max(
        Math.hypot(x, y),
        Math.hypot(rect.width - x, y),
        Math.hypot(x, rect.height - y),
        Math.hypot(rect.width - x, rect.height - y)
      ) * 2
    setRipples((cur) => [...cur, { id: rippleSeq.current++, x, y, size }])
  }

  return (
    <li className={cn(divider && "border-t border-border-default")}>
      {/* Two sibling hit areas, never overlapping: the row body opens the
          compound's detail; the trailing control logs (or edits) and nothing else. */}
      <div className="flex items-center">
        <button
          type="button"
          onPointerDown={spawnRipple}
          // Let the spread-from-touch glow play before the detail sheet rises and
          // its backdrop covers the row.
          onClick={() => window.setTimeout(() => onOpenDetail(dose), 180)}
          className="relative flex min-w-0 flex-1 items-center gap-3 overflow-hidden px-4 py-3.5 text-left transition-colors hover:bg-bg-surface-raised/40"
        >
          {ripples.map((r) => (
            <span
              key={r.id}
              aria-hidden
              onAnimationEnd={() =>
                setRipples((cur) => cur.filter((x) => x.id !== r.id))
              }
              style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
              className="animate-shortcut-ripple pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-amber/20"
            />
          ))}
          <span
            aria-hidden
            className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium text-foreground">
              {dose.name}
            </span>
            <span className="block truncate font-mono text-sm text-text-muted">
              {formatDose(dose.dose)} {dose.unit} ·{" "}
              {formatTimeLabel(dose.schedule.timeOfDay)}
            </span>
            {/* Next-site preview — injectables with a rotation only. The amber
                indicator is the sanctioned accent (§3.9); the key re-mounts the
                span so it fades each time the next site advances after a log. */}
            {dose.nextSiteLabel && (
              <span
                key={dose.nextSiteLabel}
                className="animate-shortcut-fade mt-0.5 block truncate text-xs text-text-muted"
              >
                Next{" "}
                <span className="font-mono text-accent-amber">
                  ▸ {dose.nextSiteLabel}
                </span>
                {dose.clash && (
                  <span className="text-accent-amber"> · shared today</span>
                )}
              </span>
            )}
          </span>
        </button>
        <div className="shrink-0 pr-3 pl-1">
          {log ? (
            // Logged — tap the tick to edit or undo this dose.
            <button
              type="button"
              onClick={() => onEdit(dose, log)}
              aria-label={`Edit ${dose.name} dose`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong text-text-muted transition-all duration-200 ease-out hover:bg-bg-input hover:text-text-primary active:scale-95"
            >
              <Check className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onLog(dose)}
              aria-label={`Log ${dose.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong text-text-primary transition-all duration-200 ease-out hover:bg-bg-input active:scale-95"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * The hero card: the cycle scoped to the selected day. On today's view it leads
 * with a "Next dose in {Xh Ym}" countdown (computed once on mount upstream — no
 * live timer — and hidden on past days). Each due compound is a row showing its
 * dose, time, and (for injectables) the next rotation site, with an isolated "+"
 * that opens the Log sheet; tapping the row body opens the compound detail. The
 * 30-day Consistency strip sits below in the same section.
 */
export function TodaysCycleCard({
  isToday,
  title,
  countdown,
  nextDoseName,
  dueDoses,
  hasClash,
  consistencyItems,
  todayKey,
  onLog,
  onEdit,
  onOpenDetail,
}: TodaysCycleCardProps) {
  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface p-5">
      <h2 className="font-display text-xl font-medium tracking-[-0.01em] text-foreground">
        {title}
      </h2>

      {isToday && countdown && (
        <p className="mt-2 text-sm text-text-muted">
          Next dose in{" "}
          <span className="font-mono text-base font-semibold text-foreground">
            {countdown}
          </span>{" "}
          · {nextDoseName}
        </p>
      )}

      {/* Same-day site clash — an amber observation, not a block or advice. */}
      {hasClash && (
        <div className="animate-notice-in mt-3 flex items-start gap-2 rounded-xl border border-accent-amber/40 bg-accent-amber/10 px-3 py-2.5 text-xs leading-relaxed text-foreground">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-amber"
            aria-hidden
          />
          <span>
            Two compounds are set for the same injection site today. When you log,
            you can pick a free spot or keep them.{" "}
            <span className="text-text-muted">
              This is an observation, not advice.
            </span>
          </span>
        </div>
      )}

      {dueDoses.length > 0 ? (
        <ul className="mt-4 overflow-hidden rounded-2xl bg-bg-surface-raised">
          {dueDoses.map((dose, i) => (
            <DoseRow
              key={dose.id}
              dose={dose}
              divider={i > 0}
              onLog={onLog}
              onEdit={onEdit}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl bg-bg-surface-raised px-4 py-6 text-center text-sm text-text-muted">
          Nothing scheduled for this day.
        </p>
      )}

      <div className="mt-5 border-t border-border-default pt-5">
        <ConsistencyStrip items={consistencyItems} todayKey={todayKey} />
      </div>
    </section>
  )
}
