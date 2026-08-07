"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW } from "@/lib/ui-presets"

import { Container } from "@/components/containers"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { formatTimeLabel } from "@/lib/home/stack"
import type { NextDose } from "@/lib/home/nextDose"
import { DATA_MONO } from "@/lib/ui-presets"
import { CATEGORY_META, FALLBACK_CATEGORY_META } from "@/lib/compound-categories"
import type { CompoundCategory } from "@/lib/compound-categories"

// The completion ring's geometry (viewBox 0 0 36 36, r 16).
const RING_R = 16
const RING_C = 2 * Math.PI * RING_R

/**
 * How many category dots render before the rest collapse into "+N".
 *
 * At `max-w-md` in a 2-up grid the card is ~170px wide, which fits about ten
 * 8px dots per row — so nine plus an overflow marker never wraps past two rows,
 * however many compounds are due.
 */
const DOT_CAP = 9

/** One compound's state beneath the ring. */
export interface DayDot {
  id: string
  category: string
  logged: boolean
}

/**
 * The day's completion as an amber progress RING — the one sanctioned "live
 * pulse" amber on Home (ui-context → "amber marks what's live"). It sweeps as
 * doses are ticked off; the centre reads the plain N of M for the SELECTED day.
 *
 * Beneath it, one dot per compound due in that compound's existing category
 * colour: outlined while outstanding, filled once logged. The dots are the
 * *organisational* legend the app already uses, not a health value.
 */
function CompletionRing({
  title,
  logged,
  due,
  fill,
  dots,
}: {
  title: string
  logged: number
  due: number
  /** 0 → 1 target, animated upstream so the sweep is actually watched. */
  fill: number
  dots: DayDot[]
}) {
  const shown = dots.slice(0, DOT_CAP)
  const overflow = dots.length - shown.length

  return (
    <div className="flex flex-col rounded-2xl bg-bg-surface p-5">
      <p className={CARD_EYEBROW}>{title}</p>
      <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-3">
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
              {logged}
              <span className="text-text-subtle"> of {due}</span>
            </span>
          </div>
        </div>

        {dots.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {shown.map((d) => (
              <CategoryDot key={d.id} category={d.category} logged={d.logged} />
            ))}
            {overflow > 0 && (
              <span className="font-mono text-[10px] tabular-nums text-text-subtle">
                +{overflow}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Outlined while outstanding, filled once logged — in the compound's own
 *  category colour, which is unchanged from everywhere else it appears. */
function CategoryDot({ category, logged }: { category: string; logged: boolean }) {
  const meta = CATEGORY_META[category as CompoundCategory] ?? FALLBACK_CATEGORY_META
  return (
    <span
      aria-hidden
      className={cn("h-2 w-2 rounded-full", meta.tint, logged ? "bg-current" : "border border-current")}
    />
  )
}

/**
 * The next dose on the SELECTED day — its container, the compound name, then the
 * time and dose.
 *
 * Three states and **never a bare dash**: a dose to come, everything for the day
 * logged, or nothing scheduled at all. The last two read differently on purpose —
 * "you're clear until tomorrow" describes finishing, and on a day nothing was
 * ever planned for there was nothing to finish.
 */
function NextDoseWidget({ next }: { next: NextDoseInfo }) {
  if (next.kind === "none") {
    return (
      <div className="flex flex-col rounded-2xl bg-bg-surface p-5">
        <p className={CARD_EYEBROW}>Next dose</p>
        <div className="mt-3 flex flex-1 flex-col justify-center">
          <span className="text-base text-foreground">
            {next.scheduledAny ? "Nothing due" : "Nothing scheduled"}
          </span>
          <span className="mt-1 text-sm text-text-muted">
            {/* "until tomorrow" was hardcoded and claimed a fact about the NEXT
                day that this card never checks. On a weekly compound, the most
                common first protocol there is, the next dose is seven days out
                and the line was simply wrong. Say only what is true of today. */}
            {next.scheduledAny
              ? "You're all clear for today"
              : "No doses planned for this day."}
          </span>
        </div>
      </div>
    )
  }

  const d = next.next
  return (
    <div className="flex flex-col rounded-2xl bg-bg-surface p-5">
      <p className={CARD_EYEBROW}>Next dose</p>
      <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-2">
        <Container
          name={d.compound.name}
          inventoryType={inventoryTypeForCompound(d.compound.name, d.compound.method, d.compound.inventoryForm)}
          category={d.compound.category}
          fill={0.7}
          size={56}
        />
        <span className="w-full truncate text-center text-sm text-foreground">
          {d.name}
        </span>
        {/* Time and dose AS THEY WERE on the selected day, and formatted through
            the same helper the log row uses so the two can't print 0.13 and 0.125
            for the same dose side by side. */}
        <span className={DATA_MONO}>
          {formatTimeLabel(d.time24)} · {formatDose(d.dose)}
          {d.unit}
        </span>
      </div>
    </div>
  )
}

/** Same rounding as the log row's, so a dose never renders two ways at once. */
function formatDose(dose: number): string {
  return Number.isInteger(dose) ? String(dose) : dose.toFixed(2).replace(/0$/, "")
}

export type NextDoseInfo =
  | { kind: "due"; next: NextDose }
  /** Nothing left to take. `scheduledAny` separates "you finished the day" from
   *  "this day never had anything on it", which need different words. */
  | { kind: "none"; scheduledAny: boolean }

/**
 * The day's status: the completion ring beside the next dose, both scoped to the
 * SELECTED day (Spec 02) rather than always today — the strip drives the whole
 * page, so a card that silently ignored it contradicted the day you were looking at.
 */
export function DayStatusWidgets({
  title,
  logged,
  due,
  dots,
  next,
  paused = false,
}: {
  /** Names the day the card is showing — it is selected-day scoped, so a
   *  hardcoded "Today" contradicted the strip whenever you scrolled back. */
  title: string
  /** Doses logged on the selected day. */
  logged: number
  /** Doses scheduled on the selected day. */
  due: number
  /** One per compound due that day, in order. */
  dots: DayDot[]
  next: NextDoseInfo
  /**
   * Hold the ring's sweep while the log sheet covers it. The fill catches up —
   * visibly sweeping — once the sheet drops away, so the animation is actually
   * watched rather than playing hidden.
   */
  paused?: boolean
}) {
  const pct = due > 0 ? Math.min(1, logged / due) : 0

  const [fill, setFill] = useState(0)
  useEffect(() => {
    if (paused) return
    const id = window.setTimeout(() => setFill(pct), 300)
    return () => window.clearTimeout(id)
  }, [pct, paused])

  return (
    <div className="grid grid-cols-2 gap-3">
      <CompletionRing title={title} logged={logged} due={due} fill={fill} dots={dots} />
      <NextDoseWidget next={next} />
    </div>
  )
}

