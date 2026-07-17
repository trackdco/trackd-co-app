"use client"

import { Check, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_TITLE } from "@/lib/ui-presets"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories"
import type { DoseLog } from "@/lib/home/mockHomeData"
import { formatDraw, type Draw, type DrawSource } from "@/lib/home/draw"
import { formatTimeLabel, type StackCompound } from "@/lib/home/stack"

/** A due compound plus its log state. */
export type DueDose = StackCompound & {
  log: DoseLog | null
}

interface TodaysCycleCardProps {
  isToday: boolean
  /** Heading for the selected day — "Today's Cycle" or e.g. "Monday's Cycle". */
  title: string
  /** "Xh Ym" once computed on mount; null hides the line (and past days). */
  countdown: string | null
  nextDoseName: string
  dueDoses: DueDose[]
  onLog: (dose: StackCompound) => void
  /** Untick a logged dose → remove its log. The tick is a pure toggle. */
  onUnlog: (dose: StackCompound) => void
  /** Tap the name or the "⋯" → open this compound's detail, where every edit lives. */
  onOpenDetail: (dose: StackCompound) => void
  /** Per-Dose Draw (Spec 21) — the backing vial's facts per compound id, resolved
   *  for the selected day. */
  drawSources: Record<string, DrawSource>
  /** Compounds we looked up and CONFIRMED have no vial that day — the only ones that
   *  may offer "add stock". Deliberately explicit rather than "absent from
   *  `drawSources`": absence also covers a read in flight and a failed query, neither
   *  of which may claim the user has no stock. */
  noVialIds: ReadonlySet<string>
  /** Tap "add stock" on a row with no vial → the storage add-flow (D1). */
  onAddStock: (dose: StackCompound) => void
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

/**
 * The draw, or the empty state that stands in for it.
 *
 * No vial ⇒ no concentration ⇒ no number to show — that's arithmetic, not a choice
 * (D1). So the slot renders empty with a faint "add stock" tap through to the
 * storage flow, and logging the dose is never blocked by its absence.
 *
 * `showAddStock` is deliberately NOT just `!draw`. "add stock" asserts the user has no
 * vial, so it may only appear where we looked and CONFIRMED none. Never while the read
 * is in flight (it would flash on every row on load), never when the query failed (we
 * don't know), and never on a row we simply couldn't price (a half-typed amount, a zero
 * concentration) — there a vial does exist and the honest slot is an empty one.
 */
function DrawSlot({
  draw,
  showAddStock,
  onAddStock,
}: {
  draw: Draw | null
  showAddStock: boolean
  onAddStock: () => void
}) {
  if (!draw) {
    if (!showAddStock) return null
    return (
      <button
        type="button"
        onClick={onAddStock}
        className="shrink-0 text-xs text-text-subtle underline decoration-dotted underline-offset-2 transition-colors hover:text-text-muted"
      >
        add stock
      </button>
    )
  }

  if (draw.kind === "count") {
    // An oral solid has no draw volume — a count, no mL, no units (D6).
    return (
      <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
        · <span className="text-text-primary">{draw.label}</span>
      </span>
    )
  }

  return (
    <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
      ·{" "}
      <span className="text-text-primary">{draw.units}u</span>{" "}
      <span>({draw.ml} mL)</span>
    </span>
  )
}

/** The dose the row is SHOWING — the logged amount once logged, else the scheduled
 *  dose. The draw is priced against this, so the two figures on a row always agree
 *  (an edited log must never sit beside the planned dose's draw). A half-typed /
 *  unusable amount yields null → no draw, rather than a wrong one. */
function shownAmount(dose: DueDose): number | null {
  if (!dose.log) return dose.dose
  const n = Number.parseFloat(dose.log.amount)
  return Number.isFinite(n) && n > 0 ? n : null
}

function DoseRow({
  dose,
  onLog,
  onUnlog,
  onOpenDetail,
  drawSource,
  showAddStock,
  onAddStock,
}: {
  dose: DueDose
  onLog: (dose: StackCompound) => void
  onUnlog: (dose: StackCompound) => void
  onOpenDetail: (dose: StackCompound) => void
  drawSource: DrawSource | undefined
  showAddStock: boolean
  onAddStock: (dose: StackCompound) => void
}) {
  const log = dose.log
  const amount = shownAmount(dose)
  // `dose.unit` is the unit the amount is shown in; `formatDraw` bails if it doesn't
  // match the unit the vial was matched on, rather than print a wrong draw.
  const draw = amount == null ? null : formatDraw(amount, dose.unit, drawSource ?? null)

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
          the figures). Tapping the name or the specs opens the compound detail, where
          every edit lives. The two are separate buttons only because the draw slot
          sits inside the specs line and can itself be a tap ("add stock") — a button
          inside a button is invalid markup. */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpenDetail(dose)}
          className="block w-full min-w-0 text-left"
        >
          <span className="block truncate text-sm font-medium text-foreground">
            {dose.name}
          </span>
        </button>
        <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
          <button
            type="button"
            onClick={() => onOpenDetail(dose)}
            className="min-w-0 shrink truncate text-left font-mono text-xs tabular-nums text-text-muted"
          >
            {/* Once logged, show the amount you ACTUALLY logged — not the scheduled
                dose — so an edited dose reads back correctly. */}
            {log
              ? `${log.amount}${dose.unit}`
              : `${formatDose(dose.dose)}${dose.unit}`}{" "}
            · {formatTimeLabel(dose.schedule.timeOfDay)}
          </button>

          {/* The draw — how much to pull from the vial for THIS dose (Spec 21),
              immediately next to the time. Syringe units read primary, mL is the
              precise secondary figure (D2). "u" is a syringe GRADUATION, never "IU"
              (a dose-potency measure) — see D3; conflating them would build a dosing
              error into the row. Reports arithmetic on the user's own dose and vial;
              it recommends nothing. */}
          <DrawSlot
            draw={draw}
            showAddStock={showAddStock}
            onAddStock={() => onAddStock(dose)}
          />
        </div>
      </div>

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
 * toggle: log, or untick to remove), then the name on top with dose·time below it,
 * plus a "⋯" that (like tapping the name) opens the detail where every edit lives
 * (including the injection site, chosen on the log sheet's body map). Nothing
 * collapses and nothing scrolls
 * inside the card; the compact rows keep the Weight section in view.
 */
export function TodaysCycleCard({
  isToday,
  title,
  countdown,
  nextDoseName,
  dueDoses,
  onLog,
  onUnlog,
  onOpenDetail,
  drawSources,
  noVialIds,
  onAddStock,
}: TodaysCycleCardProps) {
  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface p-5">
      <h2 className={CARD_TITLE}>{title}</h2>

      {isToday && countdown && (
        <p className="mt-2 text-sm text-text-muted">
          Next dose in{" "}
          <span className="font-mono text-base font-semibold text-foreground">
            {countdown}
          </span>{" "}
          · {nextDoseName}
        </p>
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
                      drawSource={drawSources[dose.id]}
                      showAddStock={noVialIds.has(dose.id)}
                      onAddStock={onAddStock}
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
    </section>
  )
}
