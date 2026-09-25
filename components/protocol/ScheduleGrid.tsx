"use client"

import { useMemo } from "react"

import { cn } from "@/lib/utils"
import {
  CATEGORY_DISPLAY_ORDER,
  type CompoundCategory,
} from "@/lib/compound-categories"
import { containerColour } from "@/lib/containers/colour"
import { type StackCompound } from "@/lib/home/stack"
import { type WeekCellState } from "@/lib/protocol/scheduleWeek"
import { Pause } from "@/components/icons"
import { toDateKey } from "@/lib/home/mockHomeData"

/**
 * Rows the Protocol card shows before it says "+N more". The card is a glance
 * and a link; the Schedule page shows every row. Eight is where the old inline
 * grid started scrolling, for the same reason: past it the card pushes the foot
 * tiles off the screen.
 */
export const SCHEDULE_SCROLL_AFTER_ROWS = 8

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"]
/** Spelled out for the screen-reader summary, where "T" twice says nothing. */
const DAY_NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
]

/** What a single day/compound mark is showing. Owned by `scheduleWeek.ts`, which
 *  is where the states are decided and unit-tested. */
type CellState = WeekCellState

/** The name column. `data-schedule-namecol` lets the desktop stylesheet give it a
 *  fixed width on a wide card (`app/desktop.css`). */
const NAME_COL = "w-[38%] shrink-0"
/** The seven-day track every row and the day header share. */
const DAY_TRACK = "grid flex-1 grid-cols-7 gap-1"

/**
 * The week at a glance, in the Instrument look (build-brief-final §3.7): one row
 * per compound, seven SQUARES across (3px corners), each in the compound's own
 * colour, today's column lit, and a hairline between types with no type labels.
 *
 * Deliberately **not a table** (Adrian's call): a grid of cells with headers and
 * rules read as a spreadsheet.
 *
 * The states are the app's existing ones, unchanged in meaning, carried by the
 * square: filled in the colour = logged, outlined in the colour = due, a hollow
 * grey square = missed (the old hollow ring, squared), a bare hairline = nothing
 * due, the pause bars = paused. Due and missed never meet: a due dose becomes
 * MISSED only at the end of its day, so due lives on today and after, missed
 * only before.
 *
 * **Display only.** The page has no selected date, so a tap on a mark would have
 * to assume today, exactly the bug Spec 01 exists to remove. The card that holds
 * this is a link to the Schedule page; nothing inside is a control.
 *
 * Renders the grid alone. The caller supplies the card around it.
 */
export function ScheduleGrid({
  compounds,
  states,
  todayKey,
  weekDays,
  dates = false,
  legend = false,
  maxRows,
}: {
  compounds: StackCompound[]
  /** Compound id → its seven marks. Computed once by `weekMatrix`, which also
   *  produces the week's figures, so the grid never recomputes what the caller
   *  has already worked out. */
  states: Map<string, WeekCellState[]>
  todayKey: string
  /** The seven dates of the week being shown, Monday first. */
  weekDays: Date[]
  /** Print each day's date under its initial. The Schedule page steps through
   *  weeks, where "M T W T F S S" alone says nothing about WHICH week you are
   *  looking at (Adrian, 2026-09-03). The Protocol card only ever shows this
   *  week and leaves them off, as the mock does. */
  dates?: boolean
  /** The key under the grid (the page shows it; the card is a glance). */
  legend?: boolean
  /** Cap on rows, with "+N more" under them. Unset shows every row. */
  maxRows?: number
}) {
  const groups = useMemo(() => groupByCategory(compounds), [compounds])
  const anyPaused = useMemo(
    () => [...states.values()].some((row) => row.includes("paused")),
    [states],
  )
  const todayIndex = weekDays.findIndex((d) => toDateKey(d) === todayKey)

  if (compounds.length === 0) return null

  const stateOf = (c: StackCompound, i: number): CellState =>
    states.get(c.id)?.[i] ?? "none"

  // Trim to the cap across groups, keeping their order, so the rows cut are the
  // least consequential ones (supplements sort last, `CATEGORY_DISPLAY_ORDER`).
  let budget = maxRows ?? Number.POSITIVE_INFINITY
  const shown: Group[] = []
  for (const g of groups) {
    if (budget <= 0) break
    const take = g.compounds.slice(0, budget)
    budget -= take.length
    shown.push({ cat: g.cat, compounds: take })
  }
  const hidden =
    compounds.length - shown.reduce((n, g) => n + g.compounds.length, 0)

  return (
    <div>
      {/* `isolate` so the lit column can sit BEHIND the squares (z -10) without
          dropping behind the card's own surface. */}
      <div className="relative isolate">
        {todayIndex >= 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-y-1 inset-x-0 -z-10 flex items-stretch gap-3"
          >
            <span data-schedule-namecol className={NAME_COL} />
            <div className={DAY_TRACK}>
              <span
                className="rounded-[6px] bg-foreground/[0.05]"
                style={{ gridColumnStart: todayIndex + 1 }}
              />
            </div>
          </div>
        )}

        {/* Day header, on the same track as the rows. `schedule-dayhead` is the
            FAR layer of the week-step parallax (globals.css); the groups below
            are the near one. */}
        <div className="schedule-dayhead flex items-center gap-3 pt-0.5 pb-1.5">
          <span data-schedule-namecol className={NAME_COL} />
          <div className={DAY_TRACK}>
            {weekDays.map((d, i) => {
              const isToday = i === todayIndex
              return (
                <span
                  key={d.toISOString()}
                  className={cn(
                    "flex flex-col items-center font-mono leading-none tabular-nums",
                    isToday ? "text-foreground" : "text-text-muted",
                  )}
                >
                  <span className="text-[10px]">{DAY_INITIALS[i]}</span>
                  {dates && <span className="mt-1 text-[10px]">{d.getDate()}</span>}
                </span>
              )
            })}
          </div>
        </div>

        {shown.map((g, gi) => (
          <div
            key={g.cat}
            className={cn(
              "schedule-group",
              // A hairline between types, and no label: the colour already says
              // which type a row is.
              gi > 0 && "mt-1 hairline-t pt-1",
            )}
          >
            {g.compounds.map((c) => {
              const colour = containerColour({ category: c.category })
              return (
                <div key={c.id} className="flex items-center gap-3 py-1">
                  <span
                    data-schedule-namecol
                    className={cn(NAME_COL, "truncate text-xs text-foreground")}
                  >
                    {c.name}
                  </span>
                  {/* The marks are decorative; the row carries the meaning as
                      text, so a screen reader gets the whole week rather than
                      just the compound's name. */}
                  <div className={DAY_TRACK}>
                    <span className="sr-only">
                      {weekDays
                        .map((_d, i) => `${DAY_NAMES[i]} ${STATE_LABEL[stateOf(c, i)]}`)
                        .join(", ")}
                    </span>
                    {weekDays.map((d, i) => (
                      <span key={d.toISOString()} className="flex h-4 items-center justify-center">
                        <Mark state={stateOf(c, i)} colour={colour} />
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {hidden > 0 && (
        <p className="mt-1.5 font-mono text-[11px] tabular-nums text-text-muted">
          +{hidden} more
        </p>
      )}

      {legend && <Key showPaused={anyPaused} />}
    </div>
  )
}

/**
 * One day's square, 12px with 3px corners.
 *
 * Logged is FILLED in the compound's colour and due is the same square
 * OUTLINED in it, so logging a dose reads as filling its square in. Missed is
 * the hollow grey one (the old hollow ring, squared: never a slash), and a day
 * with nothing due is a bare hairline so the row still reads as seven days.
 * Missed is drawn in `--text-muted` against the hairline's `--border-default`,
 * so the state that most needs seeing is never the faintest thing in the row.
 */
function Mark({ state, colour }: { state: CellState; colour: string }) {
  // Paused is a GLYPH, not another square. A row of pause bars reads as
  // "deliberately off" the length of the week, which a row of empty squares
  // could never say (Adrian, 2026-09-03).
  if (state === "paused") {
    return <Pause aria-hidden className="h-2.5 w-2.5 text-text-muted" weight="fill" />
  }
  const style =
    state === "logged"
      ? { backgroundColor: colour }
      : state === "due"
        ? { boxShadow: `inset 0 0 0 1.5px ${colour}` }
        : state === "missed"
          ? { boxShadow: "inset 0 0 0 1px var(--text-muted)" }
          : { boxShadow: "inset 0 0 0 1px var(--border-default)" }
  return <span aria-hidden className="block h-3 w-3 rounded-[3px]" style={style} />
}

const STATE_LABEL: Record<CellState, string> = {
  paused: "paused",
  logged: "logged",
  due: "due",
  missed: "missed",
  none: "nothing due",
}

/** The key. Logged and due are drawn in white here: on the grid each takes its
 *  compound's colour. */
function Key({ showPaused }: { showPaused: boolean }) {
  const items: { state: CellState; label: string }[] = [
    { state: "logged", label: "Logged" },
    { state: "due", label: "Due" },
    { state: "missed", label: "Missed" },
    // Only when the week actually contains one. A key entry for a state nothing
    // on screen is in is noise.
    ...(showPaused ? ([{ state: "paused", label: "Paused" }] as const) : []),
    { state: "none", label: "Nothing due" },
  ]
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 hairline-t pt-3">
      {items.map((i) => (
        <li key={i.state} className="flex items-center gap-1.5">
          <span className="flex h-3 w-3 items-center justify-center">
            <Mark state={i.state} colour="var(--text-primary)" />
          </span>
          <span className="text-[11px] text-text-muted">{i.label}</span>
        </li>
      ))}
    </ul>
  )
}

interface Group {
  cat: string
  compounds: StackCompound[]
}

// The order is deliberate and shared, NOT the object's key order: see
// `CATEGORY_DISPLAY_ORDER`. Sorting by key order put orals and SARMs above
// peptides and supplements above stimulants, which nobody chose.
const CATEGORY_ORDER = CATEGORY_DISPLAY_ORDER

function groupByCategory(items: StackCompound[]): Group[] {
  const byCat = new Map<string, StackCompound[]>()
  for (const c of items) {
    const arr = byCat.get(c.category)
    if (arr) arr.push(c)
    else byCat.set(c.category, [c])
  }
  const rank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c as CompoundCategory)
    return i < 0 ? CATEGORY_ORDER.length : i
  }
  return [...byCat.keys()]
    // The name tiebreak is not cosmetic. Every UNRECOGNISED category ties at
    // rank = CATEGORY_ORDER.length, and without it the order falls through to
    // Map insertion order, i.e. whatever order the compounds happened to
    // arrive. Ranked first, named second, everywhere.
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((cat) => ({
      cat,
      compounds: [...byCat.get(cat)!].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}
