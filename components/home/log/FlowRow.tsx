"use client"

import { useState, type ReactNode } from "react"

import { DotsThree, Minus } from "@/components/icons"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import { CloseArrow, CloseArrowIcon } from "@/components/feel/CloseArrow"
import { FirstRunBubble } from "@/components/home/FirstRunBubble"
import { closeRowIn, rowKey, type LogFlow } from "@/components/home/log/LogFlow"
import { Fold } from "@/components/protocol/pages/Subpage"
import { cn } from "@/lib/utils"
import { CARD_EYEBROW, DATA_MONO, PRESS, ROW_META, ROW_NAME } from "@/lib/ui-presets"
import {
  CATEGORY_DISPLAY_ORDER,
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories"
import { formatDose } from "@/lib/format/dose"
import { formatDraw, type DrawSource } from "@/lib/home/draw"
import type { DayDose } from "@/lib/home/logRows"
import type { DoseLog } from "@/lib/home/mockHomeData"
import { formatTimeLabel, type StackCompound } from "@/lib/home/stack"

/**
 * THE DOSE ROW (Flow B; ui-context → "Today's Log, and logging a dose"), in one
 * place so Home's card, Quick log and the Calendar's day all draw the same row
 * with the same words (consistency fix #0). The host provides a `LogFlow`
 * (`useLogRows`) and a Track bar; the row only asks it what a tap does.
 */

/** The dose the row is SHOWING: the logged amount once logged, else the plan.
 *  A half-typed or unusable amount yields null, so no draw is priced on it. */
export function shownAmount(dose: StackCompound, log: DoseLog | null): number | null {
  if (!log) return dose.dose
  const n = Number.parseFloat(log.amount)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The tick's check, drawn in when a dose is tracked (240ms after 100ms), inside
 * the gentle lift. No ring pulse: the fill and the lift are the whole moment
 * (Adrian, final check round four).
 */
export function TickMark({ draw }: { draw: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5", draw && "tick-draw")} aria-hidden>
      <path d="M5.5 12.6l4.1 4.1L18.6 7.6" pathLength={1} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * THE ONE ARROW for a row that opens in place (consistency fix #11): a small
 * down arrow while it is shut, the close arrow (spun in) once it is open.
 * CaretRight stays for a row that goes somewhere.
 */
export function FoldArrow({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <span className="relative flex h-[30px] w-[30px] shrink-0 items-center justify-center">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        aria-label={label}
        tabIndex={open ? -1 : 0}
        className={cn(
          PRESS.icon,
          "absolute inset-0 flex items-center justify-center rounded-[9px] text-text-muted transition-opacity duration-200",
          open && "pointer-events-none opacity-0",
        )}
      >
        <span className="flex rotate-180">
          <CloseArrowIcon size={12} />
        </span>
      </button>
      <CloseArrow onClick={onToggle} label={label} shown={open} className="absolute inset-0" />
    </span>
  )
}

/**
 * A fold around dose rows: one step wider than its column on each side, so a
 * row's own surface (it reaches 8px past its list) is not clipped where the
 * fold hides its overflow. The rows sit exactly where they would unfolded.
 */
export function RowsFold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="-mx-2">
      <Fold open={open} className="px-2">
        {children}
      </Fold>
    </div>
  )
}

/** A divider's right-hand word: "N due" in amber (the due beat), else a
 *  settled word in muted ("Logged", "Paused"). */
export function DueAside({ pending, settled = "Logged" }: { pending: number; settled?: string }) {
  return pending > 0 ? (
    <span className="font-mono text-[11px] tabular-nums text-accent-amber">{pending} due</span>
  ) : (
    <span className="text-[11px] text-text-muted">{settled}</span>
  )
}

/**
 * A group's divider in Today's Log and Quick log (consistency fix #14): its
 * mark, the CARD_EYEBROW title, a hairline, and a word at the right. Tapping
 * the title folds the group (build-brief-final §3.2: "a type title folds it,
 * only when tapped").
 */
export function GroupDivider({
  mark,
  label,
  aside,
  onToggle,
  open = true,
}: {
  mark: ReactNode
  label: string
  aside?: ReactNode
  onToggle?: () => void
  open?: boolean
}) {
  const title = (
    <>
      {mark}
      <span className={cn(CARD_EYEBROW, "shrink-0")}>{label}</span>
    </>
  )
  return (
    <div className="flex items-center gap-2 px-1 pb-1">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={cn(PRESS.text, "-my-2 flex min-h-9 shrink-0 items-center gap-2")}
        >
          {title}
        </button>
      ) : (
        title
      )}
      <span aria-hidden className="hairline-t flex-1 self-center" />
      {aside}
    </div>
  )
}

/**
 * One dose slot as a Flow B row. The tick: a first tap OPENS the row, a second
 * tap logs it, and on a logged dose it un-logs. The name or its line opens the
 * row (edit mode once logged). The ⋯ opens the compound sheet, where there is
 * one. The line under the name shows the DRAW ("20 UNITS"), with the amount
 * railed on the right in the one dose format ("1.125 mg").
 */
export function FlowSlotRow({
  flow,
  dose,
  slot,
  log,
  plannedAmount,
  plannedTime,
  drawSource,
  onOpenDetail,
  pop,
  nested = false,
}: {
  flow: LogFlow
  dose: DayDose
  slot: number
  log: DoseLog | null
  plannedAmount: number
  plannedTime: string
  drawSource: DrawSource | undefined
  /** The ⋯: the compound's sheet. Absent where there is none (Quick log, the
   *  Calendar), and on a slot of a multi-dose row (the parent has it). */
  onOpenDetail?: (dose: StackCompound) => void
  pop: string | null
  nested?: boolean
}) {
  const key = rowKey(dose.id, slot)
  const open = flow.openKey === key
  const drawn = open || flow.closingKey === key
  const mini = flow.condensed && !open
  const skipped = log?.status === "skipped"
  // What the row SHOWS: the draft while it is open, the log once logged, else
  // the plan. The draw is priced against the same amount, so the two agree.
  const amount = open && flow.draft ? flow.draft.amount : log ? shownAmount(dose, log) : plannedAmount
  const unit = (open && flow.draft ? flow.draft.unit : log?.unit ?? dose.unit) || dose.unit
  const draw = amount == null || skipped ? null : formatDraw(amount, unit, drawSource ?? null)
  const desc = skipped
    ? "Skipped"
    : draw
      ? draw.kind === "volume"
        ? `${draw.units} units`
        : draw.label
      : formatTimeLabel(log ? log.time24 : plannedTime)

  return (
    <li
      className={cn("log-row -mx-2 rounded-xl px-2", log && !open && "opacity-60")}
      data-open={open ? "true" : "false"}
      data-mini={mini ? "true" : "false"}
    >
      <div className="log-head flex items-center gap-3 py-2">
        <button
          type="button"
          onClick={() => flow.onTick(dose, slot)}
          aria-label={log ? `Untick ${dose.name}` : open ? `Log ${dose.name}` : `Open ${dose.name}`}
          data-logged={log ? "" : undefined}
          className={cn(
            PRESS.tick,
            "log-tick inst-tick relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
            pop && "tick-lift",
            skipped ? "border-border-strong text-text-muted" : log ? "log-tick-on" : "log-tick-due",
          )}
        >
          {skipped ? <Minus className="h-3.5 w-3.5" aria-hidden /> : <TickMark draw={Boolean(pop)} />}
        </button>
        <button
          type="button"
          onClick={() => flow.onOpen(dose, slot)}
          aria-expanded={open}
          className={cn(PRESS.rowPart, "min-w-0 flex-1 text-left")}
        >
          <span className={cn("log-name block", ROW_NAME, log && !open && "text-text-muted")}>
            {nested ? `Dose ${slot + 1}` : dose.name}
          </span>
          <span className={cn("log-desc block truncate", ROW_META)}>{desc}</span>
        </button>
        {/* A figure, not metadata: no uppercase (consistency fix #8). */}
        <span className={cn(DATA_MONO, "shrink-0")}>
          {amount == null || skipped ? "" : formatDose(amount, unit)}
        </span>
        {nested || !onOpenDetail ? null : (
          <button
            type="button"
            onClick={() => onOpenDetail(dose)}
            aria-label={`Edit ${dose.name}`}
            className={cn(PRESS.rowPart, "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-text-primary")}
          >
            <DotsThree className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>
      {flow.firstRunKey === key && !open ? <FirstRunBubble /> : null}
      <div className="log-body" aria-hidden={!open}>
        <div>{drawn ? flow.renderPanel(dose, slot) : null}</div>
      </div>
    </li>
  )
}

/**
 * A compound due MORE THAN ONCE on the day: a parent line with the name and
 * "n of m", then one tickable row per slot. The parent has no tick of its own
 * (one control over several doses has to mean "all" or "the next one", and both
 * lose a dose often enough). Its name folds the slot rows (consistency fix #25);
 * they start open.
 */
function FlowMultiRow({
  flow,
  dose,
  drawSource,
  onOpenDetail,
  popFor,
}: {
  flow: LogFlow
  dose: DayDose
  drawSource: DrawSource | undefined
  onOpenDetail?: (dose: StackCompound) => void
  popFor?: (id: string, slot: number) => string | null
}) {
  const [open, setOpen] = useState(true)
  const taken = dose.slots.filter((s) => s.log != null).length
  const done = taken >= dose.slots.length
  return (
    <li className={cn("py-2 transition-opacity duration-200", done && "opacity-60")}>
      <div className="-mx-2 flex items-center gap-3 rounded-xl px-2">
        <button
          type="button"
          onClick={() => {
            if (open) closeRowIn(flow, [dose.id])
            setOpen((o) => !o)
          }}
          aria-expanded={open}
          className={cn(PRESS.rowPart, "block min-w-0 flex-1 text-left")}
        >
          <span className={cn("block", ROW_NAME)}>{dose.name}</span>
          <span className={cn("mt-0.5 block", ROW_META)}>
            {taken} of {dose.slots.length}
          </span>
        </button>
        {onOpenDetail ? (
          <button
            type="button"
            onClick={() => onOpenDetail(dose)}
            aria-label={`Edit ${dose.name}`}
            className={cn(PRESS.rowPart, "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-text-primary")}
          >
            <DotsThree className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
      </div>
      {/* Indented on `pl-4`, the same inset an expanded stack gives its members. */}
      <RowsFold open={open}>
        <ul className="mt-0.5 pl-4">
          {dose.slots.map((s) => (
            <FlowSlotRow
              key={s.slot}
              flow={flow}
              dose={dose}
              slot={s.slot}
              log={s.log}
              plannedAmount={s.dose}
              plannedTime={s.time24}
              drawSource={drawSource}
              pop={s.log && s.log.status !== "skipped" ? (popFor?.(dose.id, s.slot) ?? null) : null}
              nested
            />
          ))}
        </ul>
      </RowsFold>
    </li>
  )
}

/** A compound's row(s): one Flow B row, or the multi-dose parent and its slots. */
export function FlowDoseRow({
  flow,
  dose,
  drawSource,
  onOpenDetail,
  popFor,
}: {
  flow: LogFlow
  dose: DayDose
  drawSource: DrawSource | undefined
  onOpenDetail?: (dose: StackCompound) => void
  popFor?: (id: string, slot: number) => string | null
}) {
  if (dose.slots.length > 1) {
    return <FlowMultiRow flow={flow} dose={dose} drawSource={drawSource} onOpenDetail={onOpenDetail} popFor={popFor} />
  }
  const log = dose.log
  return (
    <FlowSlotRow
      flow={flow}
      dose={dose}
      slot={0}
      log={log}
      plannedAmount={dose.slots[0]?.dose ?? dose.dose}
      plannedTime={dose.slots[0]?.time24 ?? dose.schedule.timeOfDay}
      drawSource={drawSource}
      onOpenDetail={onOpenDetail}
      pop={log && log.status !== "skipped" ? (popFor?.(dose.id, 0) ?? null) : null}
    />
  )
}

/** Group the day's doses by type, in the app's one type order, then by time. */
export function groupByType<T extends StackCompound>(doses: T[]): { cat: string; label: string; doses: T[] }[] {
  const byCat = new Map<string, T[]>()
  for (const d of doses) {
    const arr = byCat.get(d.category)
    if (arr) arr.push(d)
    else byCat.set(d.category, [d])
  }
  const rank = (c: string) => {
    const i = CATEGORY_DISPLAY_ORDER.indexOf(c as CompoundCategory)
    return i < 0 ? CATEGORY_DISPLAY_ORDER.length : i
  }
  return [...byCat.keys()]
    // Ranked first, named second, so unknown types never fall back to
    // insertion order.
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((cat) => ({
      cat,
      label: (CATEGORY_META[cat as CompoundCategory] ?? FALLBACK_CATEGORY_META).label,
      doses: [...byCat.get(cat)!].sort((x, y) => x.schedule.timeOfDay.localeCompare(y.schedule.timeOfDay)),
    }))
}

/**
 * A day's doses as Flow B rows grouped by type: what Quick log and the
 * Calendar's day draw. Home's card draws its own groups (it also has stacks and
 * the Paused section) with the same divider and row.
 */
export function FlowDoseGroups({
  flow,
  doses,
  drawSources = {},
}: {
  flow: LogFlow
  doses: DayDose[]
  drawSources?: Record<string, DrawSource>
}) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const toggle = (cat: string, ids: string[]) => {
    if (!folded.has(cat)) closeRowIn(flow, ids)
    setFolded((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }
  return (
    <div>
      {groupByType(doses).map((group) => {
        const pending = group.doses.filter((d) => !d.paused && d.slots.some((s) => s.log == null)).length
        const open = !folded.has(group.cat)
        return (
          <div key={group.cat} className="mt-3 first:mt-0">
            <GroupDivider
              mark={<CategoryIcon category={group.cat} className="h-3.5 w-3.5" />}
              label={group.label}
              aside={<DueAside pending={pending} />}
              open={open}
              onToggle={() => toggle(group.cat, group.doses.map((d) => d.id))}
            />
            <RowsFold open={open}>
              <ul className="px-1">
                {group.doses.map((d) => (
                  <FlowDoseRow key={d.id} flow={flow} dose={d} drawSource={drawSources[d.id]} />
                ))}
              </ul>
            </RowsFold>
          </div>
        )
      })}
    </div>
  )
}
