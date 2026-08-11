"use client"

import { CaretDown, Check, DotsThree, Minus, Pause, Plus } from "@/components/icons"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import {
  CATEGORY_DISPLAY_ORDER,
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories"
import type { DateKey, DoseLog } from "@/lib/home/mockHomeData"
import { formatDraw, type Draw, type DrawSource } from "@/lib/home/draw"
import { formatTimeLabel, type StackCompound } from "@/lib/home/stack"
import { stackLogTargets, stackProgress, stackUnlogTargets } from "@/lib/home/stackTicks"
import { partitionByStack, type Stack } from "@/lib/home/stacks"
import { Container } from "@/components/containers"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import type { DaySlot } from "@/lib/home/doseLog"
import type { OneOffLog } from "@/lib/home/oneOffLogs"
import { paletteColourVar } from "@/lib/palette"
import { DATA_MONO } from "@/lib/ui-presets"
import { formatPhotoDateShort } from "@/lib/progress/photos"
import { useRef, useState, type ReactNode } from "react"

/**
 * How long after a whole-stack untick a tap on the same target is treated as a
 * stray second tap rather than a fresh "log all". Long enough to swallow a
 * double-tap, short enough that a deliberate re-tick never feels blocked.
 */
const RELOG_GUARD_MS = 600

/**
 * One paused thing on the dashboard — a compound, or a whole stack collapsed to
 * a single entry.
 *
 * A fully paused STACK collapses to one row rather than listing five members,
 * because five greyed rows saying the same thing is not five pieces of
 * information.
 */
export interface PausedEntry {
  /** The compound this entry acts on. For a stack it is the first member, which
   *  is enough: the Pause sheet resolves the group from the pause itself. */
  compound: StackCompound
  /** What to call it — the compound's name, or the stack's. */
  label: string
  /** How many compounds this entry stands for. >1 = a collapsed stack. */
  count: number
  /** A collapsed stack's members, in order, so the row can open and let one be
   *  resumed on its own (Adrian, 2026-08-07). Absent on a loose compound. */
  members?: StackCompound[]
  /** The stack's name, for the sheet's heading. Opening a collapsed stack used
   *  to head the sheet "Resume Creatine" — the first member's name, which is a
   *  compound the user did not tap. */
  stackName?: string
  /** The day they come back, or null for an indefinite pause. */
  resumesOn: string | null
  /** How that return READS: a date when it is far off, a countdown once it is
   *  within a week, "Indefinite" when there is none. Resolved by the caller so
   *  the date formatting stays in one place. */
  resumeLabel: string
}

/**
 * One row in the Paused section.
 *
 * A loose compound is a single button. A collapsed STACK is that button plus a
 * caret that opens its members, because "resume the stack" and "resume just this
 * one" are both things people want and the row used to offer only the first
 * (Adrian, 2026-08-07). Tapping the row itself is always the STACK; a member is
 * reached inside.
 */
function PausedRow({
  entry,
  onOpen,
  onOpenMember,
}: {
  entry: PausedEntry
  onOpen: () => void
  onOpenMember?: (compound: StackCompound) => void
}) {
  const [open, setOpen] = useState(false)
  const members = entry.members ?? []
  const isStack = entry.count > 1 && members.length > 0

  return (
    <li>
      <div className="flex items-center gap-3 py-2 opacity-50 transition-opacity hover:opacity-80">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {/* A pause glyph where the tick would be — it names the state rather
              than leaving an empty ring that reads as an unticked dose. Sized
              and positioned exactly as the tick, so the column of controls stays
              one straight line. */}
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-muted"
          >
            <Pause className="h-3 w-3" weight="fill" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {entry.label}
            {/* A collapsed STACK says how many it stands for, or its name reads
                as a single compound you do not recognise. */}
            {entry.count > 1 && (
              <span className="ml-1.5 font-normal text-text-muted">
                · {entry.count}
              </span>
            )}
          </span>
          {/* Railed RIGHT with the rest of the app's row-level figures. A date
              while the return is far off, a countdown once it is within a
              week — see `resumeLabel`. */}
          <span className={cn(DATA_MONO, "shrink-0")}>{entry.resumeLabel}</span>
        </button>
        {isStack && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} the compounds in ${entry.label}`}
            className="-mr-1 shrink-0 rounded-full p-1 text-text-subtle transition-colors hover:text-foreground"
          >
            <CaretDown
              className={cn(
                "h-4 w-4 transition-transform duration-200 motion-reduce:transition-none",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        )}
      </div>
      {isStack && (
        // The app's ONE expand mechanic: grid-rows 0fr ↔ 1fr.
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden" inert={!open}>
            <ul className="pb-1 pl-9">
              {members.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onOpenMember?.(m)}
                    className="flex w-full items-center gap-2 py-1.5 text-left opacity-60 transition-opacity hover:opacity-100"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {m.name}
                    </span>
                    <CaretDown
                      className="h-3.5 w-3.5 shrink-0 -rotate-90 text-text-subtle"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  )
}

/** A due compound plus its log state. */
export type DueDose = StackCompound & {
  /** Slot 0's log. Kept as its own field because most of the app is
   *  single-dose and reads it directly; it is always `slots[0].log`. */
  log: DoseLog | null
  /** Every dose due on this day, in slot order (Spec w2b-13, Step 5). Length 1
   *  for a once-daily compound, which is nearly all of them. */
  slots: DaySlot[]
  /** Paused on the day being shown. Only ever true for a STACK MEMBER here — a
   *  paused loose compound moves to the Paused section instead (Adrian,
   *  2026-08-07). The row renders blacked out and cannot be ticked. */
  paused?: boolean
}

interface TodaysCycleCardProps {
  /** Heading for the selected day — "Today's Cycle" or e.g. "Monday's Cycle". */
  title: string
  /** The greeting, rendered ABOVE the eyebrow (Spec 02). As a standalone row it
   *  was a full-width line doing no work between two things that do; inside the
   *  card it introduces the content. */
  greeting?: ReactNode
  dueDoses: DueDose[]
  /** Compounds paused on the selected day, with the day they come back. Never
   *  hidden — a hidden compound reads as a deleted one. */
  paused?: PausedEntry[]
  /** Tap a paused entry → open its Pause sheet, where Resume lives. On a
   *  collapsed stack this is the WHOLE stack; `onOpenPausedMember` is the one
   *  member inside it. */
  onOpenPaused?: (entry: PausedEntry) => void
  /** Tap a member inside an opened stack → its own sheet. */
  onOpenPausedMember?: (compound: StackCompound) => void
  /** Things taken off-plan on the selected day (Spec w2b-13, Step 8). Rendered
   *  ONLY when there are some — no empty section, no permanent row (Adrian,
   *  2026-08-07). Added from the calendar, shown here. */
  oneOffs?: OneOffLog[]
  /** The soonest compound whose start date is still ahead, when nothing is due
   *  on the selected day. Null when there is none. */
  startsNext?: { name: string; startDate: string } | null
  /** Log one of a compound's doses. `slot` says WHICH — 0 for a once-daily
   *  compound, which is nearly all of them (Spec w2b-13, Step 5). */
  onLog: (dose: StackCompound, slot: number) => void
  /** Untick a logged dose → remove its log. The tick is a pure toggle. */
  onUnlog: (dose: StackCompound, slot: number) => void
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
  /** The day being rendered, "YYYY-MM-DD". Required, because grouping is DATED:
   *  a stack only groups days from the day it was created, and only the members
   *  that were in it then (Spec 05 · dating). Without it the card drew today's
   *  grouping over every day in the user's history. */
  dayKey: DateKey
  /** The user's stacks (Spec 05). Members render inside their stack row and are
   *  NOT repeated in their category sections. Absent/empty ⇒ the card is exactly
   *  what it was before stacks existed. */
  stacks?: Stack[]
  /** Log every unlogged member of a stack in one action, on the selected day. */
  onLogStack?: (members: StackCompound[]) => void
  /**
   * Untick a whole stack — the exact slots to remove, already filtered by the
   * row (paused members and Skipped doses are never in the list).
   *
   * Slots rather than compounds, because a twice-daily member has two and only
   * the row knows which of them carry a log. Handing the caller compounds would
   * make it re-derive that and get it subtly wrong.
   */
  onUnlogStack?: (targets: { compound: StackCompound; slot: number }[]) => void
}

function formatDose(dose: number): string {
  return Number.isInteger(dose) ? String(dose) : dose.toFixed(2).replace(/0$/, "")
}

// Stable category display order (the order categories are declared in the meta).
// The order is deliberate and shared, NOT the object's key order — see
// `CATEGORY_DISPLAY_ORDER`. Sorting by key order put orals and SARMs above
// peptides and supplements above stimulants, which nobody chose.
const CATEGORY_ORDER = CATEGORY_DISPLAY_ORDER

interface DoseGroup {
  cat: string
  label: string
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
    // The name tiebreak is not cosmetic. Every UNRECOGNISED category ties at
    // rank = CATEGORY_ORDER.length, and without it the order falls through to
    // Map insertion order, i.e. whatever order the compounds happened to
    // arrive. Two of the five grouping sites already sorted by name, so the
    // same two compounds sat in one order here and the opposite order under a
    // photo. Ranked first, named second, everywhere.
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((cat) => {
      const meta = CATEGORY_META[cat as CompoundCategory] ?? FALLBACK_CATEGORY_META
      return {
        cat,
        label: meta.label,
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
function shownAmount(dose: DueDose, log: DoseLog | null): number | null {
  if (!log) return dose.dose
  const n = Number.parseFloat(log.amount)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The tick. A PURE TOGGLE: empty ring opens the Log sheet, filled tick unticks.
 * No edit hides behind it — edits live on the name / "⋯".
 */
function DoseTick({
  logged,
  skipped,
  label,
  onClick,
}: {
  logged: boolean
  /** Deliberately not taken. A filled tick would claim the opposite. */
  skipped?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      // h-6 w-6, the SAME size as a compound row's tick and a stack's own
      // (Adrian, 2026-08-07). A sub-row's dose is a dose like any other, and a
      // smaller tick read as a lesser control — as well as being a smaller tap
      // target for the same action.
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-out active:scale-90",
        skipped
          ? // A skipped dose is RESOLVED but not taken, so it gets neither the
            // filled tick (which would claim it was) nor the empty ring (which
            // would claim nothing happened). A minus says both.
            "border-border-strong text-text-muted"
          : logged
            ? "border-accent-primary bg-accent-primary text-bg-base"
            : "border-border-strong text-transparent hover:border-text-primary"
      )}
    >
      {skipped ? (
        <Minus className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Check className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  )
}

/**
 * A compound due MORE THAN ONCE on this day: one parent row carrying the name
 * and an `n of m` count, then one independently tickable sub-row per slot.
 *
 * The parent has no tick of its own, deliberately. A single control over several
 * doses has to mean either "all" or "the next one", and both readings are wrong
 * often enough to lose a dose — so the doses are ticked where they are listed.
 */
function MultiDoseRow({
  dose,
  onLog,
  onUnlog,
  onOpenDetail,
  drawSource,
  showAddStock,
  onAddStock,
}: {
  dose: DueDose
  onLog: (dose: StackCompound, slot: number) => void
  onUnlog: (dose: StackCompound, slot: number) => void
  onOpenDetail: (dose: StackCompound) => void
  drawSource: DrawSource | undefined
  showAddStock: boolean
  onAddStock: (dose: StackCompound) => void
}) {
  const taken = dose.slots.filter((s) => s.log != null).length
  const done = taken >= dose.slots.length

  return (
    <li className={cn("py-2 transition-opacity duration-200", done && "opacity-60")}>
      <div className="flex items-center gap-3">
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
          <span className="mt-0.5 block font-mono text-xs tabular-nums text-text-muted">
            {taken} of {dose.slots.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onOpenDetail(dose)}
          aria-label={`Edit ${dose.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-text-primary"
        >
          <DotsThree className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Indented on `pl-4`, the same inset an expanded stack gives its members,
          so nesting reads the same wherever it happens. */}
      <ul className="mt-0.5 pl-4">
        {dose.slots.map((s) => {
          const log = s.log
          // The PLANNED amount for this slot, not the compound's — they differ
          // when a per-slot dose is set (100 mg AM, 50 mg PM,
          // `supabase/protocol/021`). A logged dose still shows what was
          // actually taken, which is what `shownAmount` returns.
          const amount = log ? shownAmount(dose, log) : s.dose
          const shownUnit = (log?.unit ?? dose.unit) || dose.unit
          const draw =
            amount == null ? null : formatDraw(amount, shownUnit, drawSource ?? null)
          return (
            <li
              key={s.slot}
              className={cn(
                // gap-3 + py-2: a compound row's own rhythm, so a sub-row sits
                // on the same grid as every other tickable line on the screen.
                "flex items-center gap-3 py-2 transition-opacity duration-200",
                log && "opacity-60"
              )}
            >
              <DoseTick
                logged={log != null}
                skipped={log?.status === "skipped"}
                label={
                  log
                    ? `Untick ${dose.name}, dose ${s.slot + 1}`
                    : `Log ${dose.name}, dose ${s.slot + 1}`
                }
                onClick={() => (log ? onUnlog(dose, s.slot) : onLog(dose, s.slot))}
              />
              <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenDetail(dose)}
                  className="min-w-0 shrink truncate text-left font-mono text-xs tabular-nums text-text-muted"
                >
                  {log?.status === "skipped"
                    ? "Skipped"
                    : log
                      ? `${log.amount}${shownUnit}`
                      : `${formatDose(s.dose)}${dose.unit}`}{" "}
                  · {formatTimeLabel(log ? log.time24 : s.time24)}
                  {/* A dose taken under an older, longer schedule. Named rather
                      than hidden: it happened. */}
                  {s.historic && " · past schedule"}
                </button>
                <DrawSlot
                  draw={draw}
                  showAddStock={showAddStock}
                  onAddStock={() => onAddStock(dose)}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </li>
  )
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
  onLog: (dose: StackCompound, slot: number) => void
  onUnlog: (dose: StackCompound, slot: number) => void
  onOpenDetail: (dose: StackCompound) => void
  drawSource: DrawSource | undefined
  showAddStock: boolean
  onAddStock: (dose: StackCompound) => void
}) {
  // PAUSED (a stack member only — see `DueDose.paused`). Blacked out and
  // untickable: nothing is due, so a tick would be a control for an action that
  // does not exist. It stays in place rather than moving, so the stack keeps
  // showing every compound it contains.
  //
  // ⚠️ Only when there is NOTHING LOGGED. A backdated pause covers days the user
  // already logged doses on, and rendering those as a bare "Paused" row HID what
  // they took — the dose was still recorded, just invisible. A logged day falls
  // through to the normal row, which is already dimmed.
  if (dose.paused && dose.slots.every((s) => s.log == null)) {
    return (
      <li className="flex items-center gap-3 py-2 opacity-40">
        {/* The glyph is a BUTTON, in the tick's place — tapping it opens the
            sheet, which on a paused compound is the resume form (Adrian,
            2026-08-07). It was inert, so the one control where you would reach
            for "bring this back" did nothing. */}
        <button
          type="button"
          onClick={() => onOpenDetail(dose)}
          aria-label={`Resume ${dose.name}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-muted transition-colors hover:border-text-primary hover:text-foreground active:scale-90"
        >
          <Pause className="h-3 w-3" weight="fill" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onOpenDetail(dose)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-sm font-medium text-foreground line-through decoration-text-muted/60">
            {dose.name}
          </span>
          <span className="mt-0.5 block font-mono text-xs tabular-nums text-text-muted">
            Paused
          </span>
        </button>
      </li>
    )
  }
  // More than one dose today — a different shape entirely (see `MultiDoseRow`).
  if (dose.slots.length > 1) {
    return (
      <MultiDoseRow
        dose={dose}
        onLog={onLog}
        onUnlog={onUnlog}
        onOpenDetail={onOpenDetail}
        drawSource={drawSource}
        showAddStock={showAddStock}
        onAddStock={onAddStock}
      />
    )
  }
  const log = dose.log
  const amount = shownAmount(dose, log)
  // The unit the shown amount is IN: for a logged dose that's the unit it was
  // recorded in, not whatever the compound's unit happens to be now — otherwise
  // changing a compound from mg to mcg relabels every dose already logged,
  // keeping the figure and silently changing what it means (Spec 01 → "past
  // logged doses are never rewritten"). Older logs carry no unit, so they fall
  // back to the compound's, which is what they were written with anyway.
  const shownUnit = (log?.unit ?? dose.unit) || dose.unit
  // `formatDraw` bails if this doesn't match the unit the vial was matched on,
  // rather than print a wrong draw.
  const draw = amount == null ? null : formatDraw(amount, shownUnit, drawSource ?? null)

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
          dose (where the injection site + time are chosen). Filled white tick → tap
          again simply UNTICKS it (removes the log), the way a checkbox is expected
          to behave. No edit hides behind the tick — edits live on the name / "⋯". */}
      <button
        type="button"
        onClick={() => (log ? onUnlog(dose, 0) : onLog(dose, 0))}
        aria-label={log ? `Untick ${dose.name}` : `Log ${dose.name}`}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-out active:scale-90",
          log?.status === "skipped"
            ? "border-border-strong text-text-muted"
            : log
              ? "border-accent-primary bg-accent-primary text-bg-base"
              : "border-border-strong text-transparent hover:border-text-primary"
        )}
      >
        {log?.status === "skipped" ? (
          <Minus className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Check className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>

      {/* Title first, specs below — the name stays fully readable (never squeezed by
          the figures). Tapping the name or the specs opens the compound detail, where
          every edit lives. The two are separate buttons only because the draw slot
          sits inside the specs line and can itself be a tap ("add stock") — a button
          inside a button is invalid markup.

          ~~Spec w2b-13 Step 7.7 made a row tap LOG the dose, with the sheet
          moving to a long-press.~~ REVERTED at Adrian's call (2026-08-07): it
          moved the app's most-used tap target, and the tick already logs. The
          tick logs, the row opens. */}
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
            {/* Once logged, show the amount, unit and time you ACTUALLY logged —
                not the current plan — so an edited or historical dose reads back
                as what happened. Altering the schedule changes what is DUE from
                here on; it must never restate a dose already taken. */}
            {log?.status === "skipped"
              ? "Skipped"
              : log
                ? `${log.amount}${shownUnit}`
                : `${formatDose(dose.dose)}${dose.unit}`}{" "}
            · {formatTimeLabel(log ? log.time24 : dose.schedule.timeOfDay)}
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
        <DotsThree className="h-5 w-5" aria-hidden />
      </button>
    </li>
  )
}

/**
 * The hero card: the cycle scoped to the selected day. The "Next dose" countdown
 * now lives in the greeting's widget grid (see next-tasks.md → RESUME STEP 0), so
 * the card is purely the day's tick-off CHECKLIST grouped by category: every due
 * compound is one always-visible row — a tick (a pure toggle: log, or untick to
 * remove), then the name on top with dose·time below it, plus a "⋯" that (like
 * tapping the name) opens the detail where every edit lives (including the injection
 * site, chosen on the log sheet's body map). Nothing collapses and nothing scrolls
 * inside the card; the compact rows keep the Weight section in view.
 */
export function TodaysCycleCard({
  title,
  dueDoses,
  paused,
  onOpenPaused,
  onOpenPausedMember,
  oneOffs,
  startsNext = null,
  onLog,
  onUnlog,
  onOpenDetail,
  drawSources,
  noVialIds,
  onAddStock,
  dayKey,
  stacks,
  onLogStack,
  onUnlogStack,
  greeting,
}: TodaysCycleCardProps) {
  // ONE partition: a member appears in its stack row and therefore cannot also
  // appear in a category section. Two independent filters could drift; a
  // partition cannot.
  //
  // Partitioned FOR THIS DAY. A stack created after `dayKey` groups nothing here
  // and its compounds fall through to `loose` — which is how the day looked when
  // it was lived, rather than how the protocol is arranged now.
  const byId = new Map(dueDoses.map((d) => [d.id, d]))
  const { stacks: grouped, loose } = partitionByStack(
    dueDoses.map((d) => d.id),
    stacks ?? [],
    dayKey
  )
  const looseDoses = loose
    .map((id) => byId.get(id))
    .filter((d): d is DueDose => Boolean(d))

  return (
    <section className="rounded-2xl bg-bg-surface p-5">
      {greeting}
      <h2 className={cn(CARD_EYEBROW, greeting && "mt-3")}>{title}</h2>

      {dueDoses.length > 0 ? (
        // A tick-off checklist grouped by category: every dose stays visible as one
        // thin row (no collapsing, no inner scroll — A6), so nothing is hidden behind
        // a tap and the compact rows keep the Weight section in view. Each category
        // is a slim divider, not a container.
        <div className="mt-4">
          {/* Stacks first — one row each, expandable to individually tickable
              members (Spec 05). */}
          {grouped.map(({ stack, memberIds }) => (
            <StackDoseRow
              key={stack.id}
              stack={stack}
              members={memberIds
                .map((id) => byId.get(id))
                .filter((d): d is DueDose => Boolean(d))}
              onLog={onLog}
              onUnlog={onUnlog}
              onOpenDetail={onOpenDetail}
              onLogStack={onLogStack}
              onUnlogStack={onUnlogStack}
              drawSources={drawSources}
              noVialIds={noVialIds}
              onAddStock={onAddStock}
            />
          ))}

          {groupByCategory(looseDoses).map((group) => {
            // ANY unlogged slot, not just slot 0. Testing `d.log` alone made a
            // divider read "Logged" while the multi-dose row directly beneath it
            // said "1 of 2". A paused member counts toward neither.
            const pending = group.doses.filter(
              (d) => !d.paused && d.slots.some((s) => s.log == null),
            ).length
            return (
              <div key={group.cat} className="mt-3 first:mt-2">
                {/* Slim category divider — dot + label + hairline rule + an
                    at-a-glance status (amber "N due" / muted "Logged"). */}
                <div className="flex items-center gap-2 px-1 pb-1">
                  <CategoryIcon category={group.cat} className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                    {group.label}
                  </span>
                  <span aria-hidden className="h-[0.5px] flex-1 bg-border-default" />
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
          {/* A compound with a FUTURE start date is in the stack but due on no
              day yet, so this card said "nothing scheduled" while the onboarding
              card (gated on an empty stack) had already gone. The compound
              existed in exactly one place in the whole app, and a new user's
              only reasonable reading was that the add had failed. */}
          {startsNext ? (
            <>
              Nothing scheduled for this day.
              <br />
              {startsNext.name} starts {formatPhotoDateShort(startsNext.startDate)}.
            </>
          ) : (
            <>Nothing scheduled for this day.</>
          )}
        </p>
      )}

      {/* PAUSED — its own category, at the very BOTTOM, so the things that still
          need logging sit above it (Adrian, 2026-08-07). Never hidden: a hidden
          compound reads as a deleted one, and the whole point of Pause is that
          it is not a delete.

          Stack members are NOT here. A paused member stays in its stack row,
          blacked out, so the stack keeps showing everything it contains. */}
      {paused && paused.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 pt-3">
            {/* An icon on the section eyebrow, matching the CategoryIcon a
                compound row carries — HOLLOW, because the filled glyph is the
                one on the rows below and the heading should not out-weigh its
                own contents (Adrian, 2026-08-07). */}
            <Pause className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
            <span className={cn(CARD_EYEBROW, "shrink-0")}>Paused</span>
            <span aria-hidden className="h-[0.5px] flex-1 bg-border-default" />
            {/* COMPOUNDS, not entries — a collapsed stack is one row standing
                for several, and the heading should count the things that are
                paused rather than the rows drawn. */}
            <span className="font-mono text-[11px] tabular-nums text-text-subtle">
              {paused.reduce((n, p) => n + p.count, 0)}
            </span>
          </div>
          <ul className="px-1">
            {paused.map((p) => (
              <PausedRow
                key={p.compound.id}
                entry={p}
                onOpen={() => onOpenPaused?.(p)}
                onOpenMember={onOpenPausedMember}
              />
            ))}
          </ul>
        </div>
      )}

      {/* ALSO LOGGED — off-plan entries, below Paused, and ONLY when there are
          some. No empty state and no standing "log something else" row: most
          days have none, and the calendar is where one is added. */}
      {oneOffs && oneOffs.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 pt-3">
            <Plus className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
            <span className={cn(CARD_EYEBROW, "shrink-0")}>Also logged</span>
            <span aria-hidden className="h-[0.5px] flex-1 bg-border-default" />
          </div>
          <ul className="px-1">
            {oneOffs.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2">
                <Container
                  name={o.compoundName ?? o.label}
                  inventoryType={inventoryTypeForCompound(
                    o.compoundName ?? o.label,
                    o.method ?? "po",
                  )}
                  category={o.category ?? "supplement"}
                  size={24}
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
                  {o.label}
                </span>
                <span className={cn(DATA_MONO, "shrink-0")}>
                  {o.amount ? `${o.amount}${o.unit ?? ""}` : (o.unit ?? "")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/**
 * A stack as ONE row on the dashboard (Spec 05, steps 6–8).
 *
 * Collapsed it shows the stack's name, its members' containers in the stack
 * colour, and a single tick that logs every unlogged member at once. Expanding
 * reveals the members, each individually tickable — so someone who took two of
 * three records exactly that.
 *
 * **Partial reads as partial, never as complete**: the tick only fills white
 * when every member is logged; part-way through it is a BARE white outline (the
 * `Check` inside is `text-transparent`, so there is no inner mark) and the row
 * states the count in words.
 *
 * The container fills all move together simply because logging re-renders them
 * with a new fill and they share the `.container-fill` transition.
 */
function StackDoseRow({
  stack,
  members,
  onLog,
  onUnlog,
  onOpenDetail,
  onLogStack,
  onUnlogStack,
  drawSources,
  noVialIds,
  onAddStock,
}: {
  stack: Stack
  members: DueDose[]
  onLog: (dose: StackCompound, slot: number) => void
  onUnlog: (dose: StackCompound, slot: number) => void
  onOpenDetail: (dose: StackCompound) => void
  onLogStack?: (members: StackCompound[]) => void
  onUnlogStack?: (targets: { compound: StackCompound; slot: number }[]) => void
  drawSources: Record<string, DrawSource>
  noVialIds: ReadonlySet<string>
  onAddStock: (dose: StackCompound) => void
}) {
  const [open, setOpen] = useState(false)
  const colour = paletteColourVar(stack.colour)
  /** When this stack was last unticked as a whole — see {@link logRemaining}. A
   *  ref, not state: it must not re-render, and it is only ever read at the
   *  moment of a click. */
  const untickedAt = useRef(0)

  // Counted in DOSES, not members, and paused members count for nothing — see
  // `stackProgress`. The rules live in `lib/home/stackTicks.ts` because getting
  // them wrong deletes doses, which is worth a test rather than a comment.
  const { logged, total, complete, partial } = stackProgress(members)
  /**
   * What a whole-stack untick would remove — never a paused member, never a
   * Skipped dose. See {@link stackUnlogTargets} for why those two are spared and
   * why a hand-picked injection site is not.
   */
  const unlogTargets = stackUnlogTargets(members)
  /** A stack that is complete only because every live member was SKIPPED has
   *  nothing to untick, so its tick stays inert rather than becoming a button
   *  that does nothing. */
  const canUnlogAll = complete && unlogTargets.length > 0

  /**
   * Log every member that isn't logged yet.
   *
   * ~~There is deliberately NO bulk untick.~~ **Reversed** (Adrian, 2026-08-12):
   * "if I tick a stack, it ticks them all. If I untick a stack, I want it to
   * untick them all … if they want to re-log it, they can always re-log it."
   * The asymmetry was the surprise — the one control that acts on every member
   * worked in one direction only, and there was no way to undo a mis-tapped
   * stack tick short of opening the row and unticking five compounds by hand.
   *
   * The original worry (each log carries its own amount, time and site, and
   * there is no undo anywhere in this app) is real and is answered by scope
   * rather than by a confirm step: {@link stackUnlogTargets} excludes exactly the
   * things that were decided separately, and a single row's tick has always
   * unticked in one tap with no confirmation either.
   */
  function logRemaining() {
    // A tap landing here moments after an untick-all is the SECOND HALF OF A
    // DOUBLE-TAP, not a decision. Unticking flips this same 24px target from
    // "untick all" to "log all", so two quick taps deleted five doses and then
    // re-logged them from the plan — losing every edited amount, the real time
    // each was taken, every injection site and every note, and leaving the row
    // looking exactly as it did before. Nothing on screen would have shown it,
    // and there is no undo. (Cold review, 2026-08-12.)
    //
    // A deliberate re-tick a moment later still works; only the reflex one is
    // refused.
    if (Date.now() - untickedAt.current < RELOG_GUARD_MS) return
    const unlogged = stackLogTargets(members)
    if (onLogStack) onLogStack(unlogged)
    // The fallback logs each member's FIRST unlogged dose, matching what
    // `onLogStack` does. One tap advances every member by one dose; it does not
    // complete a twice-daily member's whole day at once.
    else {
      for (const m of unlogged) {
        const next = m.slots.find((sl) => sl.log == null)
        if (next) onLog(m, next.slot)
      }
    }
  }

  /** Untick the whole stack — the mirror of {@link logRemaining}. */
  function unlogAll() {
    if (unlogTargets.length === 0) return
    untickedAt.current = Date.now()
    if (onUnlogStack) onUnlogStack(unlogTargets)
    else for (const t of unlogTargets) onUnlog(t.compound, t.slot)
  }

  return (
    <div className="mt-3 first:mt-2">
      <div className="flex items-center gap-2 px-1 pb-1">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: colour }}
          aria-hidden
        />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
          {stack.name}
        </span>
        <span aria-hidden className="h-[0.5px] flex-1 bg-border-default" />
        {/* A wholly paused stack has NOTHING live in it, so "0 due" in amber
            was nagging about doses nobody is taking. */}
        {total === 0 ? (
          <span className="text-[11px] text-text-subtle">Paused</span>
        ) : complete ? (
          <span className="text-[11px] text-text-subtle">Logged</span>
        ) : (
          <span className="font-mono text-[11px] tabular-nums text-accent-amber">
            {total - logged} due
          </span>
        )}
      </div>

      {/* A finished stack dims exactly as a finished dose row does, so "done"
          looks the same whether it is one compound or five (Adrian,
          2026-07-31). The filled tick stays the one bright mark. */}
      <div
        className={cn(
          "flex items-center gap-3 px-1 py-2 transition-opacity duration-200",
          complete && "opacity-60"
        )}
      >
        {/* The stack's tick, in the SAME PLACE and the same size as a compound's
            (Adrian, 2026-07-31). It was a text link on the far right while every
            row beneath it ticked on the left, so the one control that acts on all
            of them was the one control that did not look like the others.
            Complete → the filled tick, and tapping it unticks the stack, exactly
            as tapping a finished compound's tick unticks that compound. */}
        {total === 0 ? (
          // Nothing live to log, so the pause glyph rather than a tick that
          // would call `onLogStack([])` and do nothing at all.
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-muted"
          >
            <Pause className="h-3 w-3" weight="fill" />
          </span>
        ) : canUnlogAll ? (
          <button
            type="button"
            onClick={unlogAll}
            // DOSES, which is what is actually removed — a two-member stack with
            // one twice-daily member has three. Said "all N in <stack>", which
            // read as a member count and matched neither the members on screen
            // nor the "N of M logged" line below.
            aria-label={`Untick the ${unlogTargets.length} logged ${
              unlogTargets.length === 1 ? "dose" : "doses"
            } in ${stack.name}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent-primary bg-accent-primary text-bg-base transition-all duration-200 ease-out active:scale-90"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : complete ? (
          // Complete only because every live member was SKIPPED — nothing to
          // untick, so the mark stays a mark rather than a dead button.
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent-primary bg-accent-primary text-bg-base"
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : (
          <button
            type="button"
            onClick={logRemaining}
            aria-label={
              partial
                ? `Log the remaining ${total - logged} in ${stack.name}`
                : `Log all of ${stack.name}`
            }
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-out active:scale-90",
              // Partway through reads as partway through: the ring goes white
              // (the settled accent) without filling, rather than jumping
              // straight to done. NOT the stack's own colour — `colour` is in
              // scope here and is deliberately not used, because a palette ring
              // would read as decoration rather than as progress.
              partial
                ? "border-accent-primary text-transparent"
                : "border-border-strong text-transparent hover:border-text-primary"
            )}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          tabIndex={-1}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex items-end gap-1">
            {members.map((m) => (
              <Container
                key={m.id}
                name={m.name}
                inventoryType={inventoryTypeForCompound(m.name, m.method, m.inventoryForm)}
                category={m.category}
                stackColour={colour}
                // Drops by a dose's worth when logged — all members move at once.
                fill={m.log ? 0.55 : 0.7}
                size={30}
              />
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {stack.name}
            </span>
            <span className="mt-0.5 block font-mono text-xs tabular-nums text-text-muted">
              {total === 0 ? "Paused" : `${logged} of ${total} logged`}
            </span>
          </span>
        </button>

        {/* The expand caret moved to the RIGHT, where a disclosure belongs once
            the tick owns the left. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} the compounds in ${stack.name}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary active:scale-90"
        >
          <CaretDown
            aria-hidden
            className={cn(
              "h-4 w-4 transition-transform duration-300 ease-out motion-reduce:transition-none",
              open && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Kept MOUNTED so it can animate both ways — the grid-rows 0fr↔1fr
          transition is what slides the members open and shut. Same idiom as the
          week strip, rather than a second expand mechanic. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        {/* `inert` while collapsed. `overflow-hidden` clips the members visually
            but leaves them focusable and announced — a keyboard user could tab
            into a collapsed stack and log a dose they cannot see, and
            `aria-expanded={false}` would be lying about exposed content. */}
        <div className="overflow-hidden" inert={!open}>
          <ul className="px-1 pl-4">
            {members.map((dose) => (
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
      </div>
    </div>
  )
}

