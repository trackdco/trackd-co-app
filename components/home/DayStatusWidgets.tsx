"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW, METRIC_VALUE, UNIT_SUFFIX } from "@/lib/ui-presets"

// The completion ring's geometry (viewBox 0 0 36 36, r 16).
const RING_R = 16
const RING_C = 2 * Math.PI * RING_R

/**
 * The day's completion as an amber progress RING — the one sanctioned "live pulse"
 * amber on Home (see ui-context → "amber marks what's live"). It sweeps from empty
 * to its target as doses are ticked off; the centre reads the plain N/M count.
 */
function CompletionRing({
  loggedToday,
  dueToday,
  fill,
}: {
  loggedToday: number
  dueToday: number
  /** 0 → 1 target, animated upstream so the sweep is actually watched. */
  fill: number
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-bg-surface p-5">
      <p className={CARD_EYEBROW}>Today</p>
      <div className="mt-3 flex flex-1 items-center justify-center">
        <div className="relative h-24 w-24">
          <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90" aria-hidden>
            <circle
              cx="18"
              cy="18"
              r={RING_R}
              fill="none"
              stroke="var(--bg-surface-raised)"
              strokeWidth={2.5}
            />
            <circle
              cx="18"
              cy="18"
              r={RING_R}
              fill="none"
              stroke="var(--accent-amber)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - fill)}
              className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-lg font-light tabular-nums text-foreground">
              {loggedToday}
              <span className="text-text-subtle">/{dueToday}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Parse "Xh Ym" so the h/m units demote inline beside the METRIC_VALUE figures
 *  (never at value size). Falls back to the raw string on any other shape. */
function CountdownValue({ text }: { text: string }) {
  const m = /^(\d+)h\s*(\d+)m$/.exec(text)
  if (!m) return <span className={METRIC_VALUE}>{text}</span>
  return (
    <span className="flex items-baseline">
      <span className={METRIC_VALUE}>{m[1]}</span>
      <span className={UNIT_SUFFIX}>h</span>
      <span className={cn(METRIC_VALUE, "ml-1.5")}>{m[2]}</span>
      <span className={UNIT_SUFFIX}>m</span>
    </span>
  )
}

/** The next scheduled dose today — countdown + the compound it's for (moved off the
 *  Today's Log card so the "right now" status sits together in this widget grid). */
function NextDoseWidget({
  countdown,
  nextDoseName,
  allLogged,
}: {
  countdown: string | null
  nextDoseName: string
  allLogged: boolean
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-bg-surface p-5">
      <p className={CARD_EYEBROW}>Next dose</p>
      <div className="mt-3 flex flex-1 flex-col justify-center">
        {countdown && nextDoseName ? (
          <>
            <CountdownValue text={countdown} />
            <span className="mt-1 truncate text-sm text-text-muted">
              {nextDoseName}
            </span>
          </>
        ) : (
          <span className="text-sm text-text-muted">
            {allLogged ? "All logged" : "—"}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * The day's "right now" status, a 2-up widget grid below Today's Log — always scoped
 * to TODAY (regardless of the selected day): an amber completion RING (doses logged
 * today vs scheduled — the sanctioned "live pulse" amber) beside a next-dose
 * countdown widget. Only rendered by the parent when something is scheduled today.
 */
export function DayStatusWidgets({
  loggedToday,
  dueToday,
  countdown,
  nextDoseName,
  paused = false,
}: {
  /** Doses logged today (of the active stack due today). */
  loggedToday: number
  /** Doses scheduled today across the active stack. */
  dueToday: number
  /** "Xh Ym" until the next dose today; null hides the countdown (pre-mount / none). */
  countdown: string | null
  /** The compound the next dose is for (paired with `countdown`). */
  nextDoseName: string
  /**
   * Hold the ring's sweep while the log sheet covers it (the green "Tracked"
   * confirmation). The fill catches up — visibly sweeping — once the sheet drops
   * away, so the animation is actually watched rather than playing hidden.
   */
  paused?: boolean
}) {
  const allLogged = dueToday > 0 && loggedToday >= dueToday
  const pct = dueToday > 0 ? Math.min(1, loggedToday / dueToday) : 0

  // Sweep the ring from empty → its target once the screen has settled, easing in
  // (and re-animate whenever the count changes as doses get logged). Starts at 0
  // each mount so the fill visibly sweeps rather than snapping into place. While
  // `paused` (the log sheet is up), hold the current fill — the sweep would
  // otherwise play hidden behind the green "Tracked" screen; it advances once the
  // sheet drops away, ~300ms later so it lands after the screen has gone down.
  const [fill, setFill] = useState(0)
  useEffect(() => {
    if (paused) return
    const id = window.setTimeout(() => setFill(pct), 300)
    return () => window.clearTimeout(id)
  }, [pct, paused])

  return (
    <div className="grid grid-cols-2 gap-3">
      <CompletionRing loggedToday={loggedToday} dueToday={dueToday} fill={fill} />
      <NextDoseWidget
        countdown={countdown}
        nextDoseName={nextDoseName}
        allLogged={allLogged}
      />
    </div>
  )
}
