"use client"

import { CaretDown, Check, DotsThree } from "@/components/icons"

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
import { partitionByStack, type Stack } from "@/lib/home/stacks"
import { Container } from "@/components/containers"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { paletteColourVar } from "@/lib/palette"
import { formatPhotoDateShort } from "@/lib/progress/photos"
import { useState, type ReactNode } from "react"

/** A due compound plus its log state. */
export type DueDose = StackCompound & {
  log: DoseLog | null
}

interface TodaysCycleCardProps {
  /** Heading for the selected day — "Today's Cycle" or e.g. "Monday's Cycle". */
  title: string
  /** The greeting, rendered ABOVE the eyebrow (Spec 02). As a standalone row it
   *  was a full-width line doing no work between two things that do; inside the
   *  card it introduces the content. */
  greeting?: ReactNode
  dueDoses: DueDose[]
  /** The soonest compound whose start date is still ahead, when nothing is due
   *  on the selected day. Null when there is none. */
  startsNext?: { name: string; startDate: string } | null
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
        onClick={() => (log ? onUnlog(dose) : onLog(dose))}
        aria-label={log ? `Untick ${dose.name}` : `Log ${dose.name}`}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-out active:scale-90",
          log
            ? "border-accent-primary bg-accent-primary text-bg-base"
            : "border-border-strong text-transparent hover:border-text-primary"
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
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
            {/* Once logged, show the amount, unit and time you ACTUALLY logged —
                not the current plan — so an edited or historical dose reads back
                as what happened. Altering the schedule changes what is DUE from
                here on; it must never restate a dose already taken. */}
            {log
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
              drawSources={drawSources}
              noVialIds={noVialIds}
              onAddStock={onAddStock}
            />
          ))}

          {groupByCategory(looseDoses).map((group) => {
            const pending = group.doses.filter((d) => d.log == null).length
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
  drawSources,
  noVialIds,
  onAddStock,
}: {
  stack: Stack
  members: DueDose[]
  onLog: (dose: StackCompound) => void
  onUnlog: (dose: StackCompound) => void
  onOpenDetail: (dose: StackCompound) => void
  onLogStack?: (members: StackCompound[]) => void
  drawSources: Record<string, DrawSource>
  noVialIds: ReadonlySet<string>
  onAddStock: (dose: StackCompound) => void
}) {
  const [open, setOpen] = useState(false)
  const colour = paletteColourVar(stack.colour)

  const logged = members.filter((m) => m.log != null).length
  const total = members.length
  const complete = logged === total && total > 0
  const partial = logged > 0 && !complete

  /**
   * Log every member that isn't logged yet.
   *
   * There is deliberately NO bulk untick. Each member's log carries its own
   * edited amount, real time and injection site, and one mis-tap would delete
   * all of it with nothing to undo. Spec 05 asks for logging in one tap;
   * un-logging in one tap is the direction that destroys data. The button that
   * calls this is hidden once the stack is complete, so there is nothing to
   * guard against here.
   */
  function logRemaining() {
    const unlogged = members.filter((m) => m.log == null)
    if (onLogStack) onLogStack(unlogged)
    else for (const m of unlogged) onLog(m)
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
        {complete ? (
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
            Complete → the filled tick, and tapping it does nothing: un-logging in
            bulk would destroy each dose's own amount, time and site. */}
        {complete ? (
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
                inventoryType={inventoryTypeForCompound(m.name, m.method)}
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
              {logged} of {total} logged
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

