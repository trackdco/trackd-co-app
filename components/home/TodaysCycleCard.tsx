"use client"

import { AlertTriangle, Check, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
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
  /** Untick a logged dose → remove its log. The tick is a pure toggle. */
  onUnlog: (dose: StackCompound) => void
  /** Tap the name or the "⋯" → open this compound's detail, where every edit lives. */
  onOpenDetail: (dose: StackCompound) => void
}

function formatDose(dose: number): string {
  return Number.isInteger(dose) ? String(dose) : dose.toFixed(2).replace(/0$/, "")
}

// Stable category display order (the order categories are declared in the meta).
const CATEGORY_ORDER = Object.keys(CATEGORY_META) as CompoundCategory[]

interface DoseGroup {
  cat: string
  label: string
  dot: string
  doses: DueDose[]
}

/**
 * Group the day's doses by compound category (A6) — presentation only, no schema
 * change. Categories appear in their declared order (unknowns last); within each
 * group, doses are sorted by scheduled time (the secondary sort).
 */
function groupByCategory(doses: DueDose[]): DoseGroup[] {
  const byCat = new Map<string, DueDose[]>()
  for (const d of doses) {
    const arr = byCat.get(d.category)
    if (arr) arr.push(d)
    else byCat.set(d.category, [d])
  }
  const rank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c as CompoundCategory)
    return i < 0 ? CATEGORY_ORDER.length : i
  }
  return [...byCat.keys()]
    .sort((a, b) => rank(a) - rank(b))
    .map((cat) => {
      const meta = CATEGORY_META[cat as CompoundCategory] ?? FALLBACK_CATEGORY_META
      return {
        cat,
        label: meta.label,
        dot: meta.dot,
        doses: [...byCat.get(cat)!].sort((x, y) =>
          x.schedule.timeOfDay.localeCompare(y.schedule.timeOfDay)
        ),
      }
    })
}

function DoseRow({
  dose,
  onLog,
  onUnlog,
  onOpenDetail,
}: {
  dose: DueDose
  onLog: (dose: StackCompound) => void
  onUnlog: (dose: StackCompound) => void
  onOpenDetail: (dose: StackCompound) => void
}) {
  const log = dose.log

  return (
    <li
      className={cn(
        "flex items-center gap-3 py-2 transition-opacity duration-200",
        // A logged row reads as done — the whole row dims (A3); the filled tick
        // stays the one bright mark.
        log && "opacity-60"
      )}
    >
      {/* The tick is a PURE TOGGLE. Empty ring → opens the Log sheet to record the
          dose (where the injection site + time are chosen). Filled amber tick → tap
          again simply UNTICKS it (removes the log), the way a checkbox is expected
          to behave. No edit hides behind the tick — edits live on the name / "⋯". */}
      <button
        type="button"
        onClick={() => (log ? onUnlog(dose) : onLog(dose))}
        aria-label={log ? `Untick ${dose.name}` : `Log ${dose.name}`}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-out active:scale-90",
          log
            ? "border-accent-amber bg-accent-amber text-bg-base"
            : "border-border-strong text-transparent hover:border-text-primary"
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </button>

      {/* Title first, specs below — the name stays fully readable (never squeezed by
          the figures). Tapping anywhere here opens the compound detail, where every
          edit lives. */}
      <button
        type="button"
        onClick={() => onOpenDetail(dose)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-sm font-medium text-foreground">
          {dose.name}
        </span>
        <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-text-muted">
          {/* Once logged, show the amount you ACTUALLY logged — not the scheduled
              dose — so an edited dose reads back correctly. */}
          {log
            ? `${log.amount}${dose.unit}`
            : `${formatDose(dose.dose)}${dose.unit}`}{" "}
          · {formatTimeLabel(dose.schedule.timeOfDay)}
          {dose.nextSiteLabel && (
            <span className="text-accent-amber">
              {" "}· ▸ {dose.nextSiteLabel}
              {dose.clash && " · shared"}
            </span>
          )}
        </span>
      </button>

      {/* "⋯" — the single home for every edit (change dose / time / site, archive,
          delete). Same destination as tapping the name; kept off the tick. */}
      <button
        type="button"
        onClick={() => onOpenDetail(dose)}
        aria-label={`Edit ${dose.name}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-text-primary"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>
    </li>
  )
}

/**
 * The hero card: the cycle scoped to the selected day. On today's view it leads
 * with a "Next dose in {Xh Ym}" countdown (computed once on mount upstream — no
 * live timer — and hidden on past days). The day is a tick-off CHECKLIST grouped
 * by category: every due compound is one always-visible row — a tick (a pure
 * toggle: log, or untick to remove), then the name on top with dose·time and the
 * inline next rotation site below it, plus a "⋯" that (like tapping the name)
 * opens the detail where every edit lives. Nothing collapses and nothing scrolls
 * inside the card; the compact rows keep the Weight section in view. The 30-day
 * Consistency strip sits below in the same section.
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
  onUnlog,
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
        // A tick-off checklist grouped by category: every dose stays visible as one
        // thin row (no collapsing, no inner scroll — A6), so nothing is hidden behind
        // a tap and the compact rows keep the Weight section in view. Each category
        // is a slim divider, not a container.
        <div className="mt-4">
          {groupByCategory(dueDoses).map((group) => {
            const pending = group.doses.filter((d) => d.log == null).length
            return (
              <div key={group.cat} className="mt-3 first:mt-2">
                {/* Slim category divider — dot + label + hairline rule + an
                    at-a-glance status (amber "N due" / muted "Logged"). */}
                <div className="flex items-center gap-2 px-1 pb-1">
                  <span
                    aria-hidden
                    className={cn("h-1.5 w-1.5 shrink-0 rounded-full", group.dot)}
                  />
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                    {group.label}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-border-default" />
                  {pending > 0 ? (
                    <span className="font-mono text-[11px] tabular-nums text-accent-amber">
                      {pending} due
                    </span>
                  ) : (
                    <span className="text-[11px] text-text-subtle">Logged</span>
                  )}
                </div>
                <ul className="px-1">
                  {group.doses.map((dose) => (
                    <DoseRow
                      key={dose.id}
                      dose={dose}
                      onLog={onLog}
                      onUnlog={onUnlog}
                      onOpenDetail={onOpenDetail}
                    />
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
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
