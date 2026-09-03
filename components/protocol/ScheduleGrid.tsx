"use client"

import { useMemo } from "react"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import {
  CATEGORY_DISPLAY_ORDER,
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories"
import { type StackCompound } from "@/lib/home/stack"
import { type WeekCellState } from "@/lib/protocol/scheduleWeek"
import { Pause } from "@/components/icons"
import type { DayLogs } from "@/lib/home/doseLog"
import { toDateKey } from "@/lib/home/mockHomeData"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"

/**
 * Rows before the list starts scrolling with a sticky day header.
 *
 * Eight rows plus the header and the key is roughly half a phone viewport; past
 * that it pushes the Cycles section off-screen and the page stops reading as one
 * scroll.
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

/**
 * The week at a glance: one row per compound, seven marks across, grouped by
 * category.
 *
 * Deliberately **not a table** (Adrian's call) — a grid of cells read as a
 * spreadsheet. These are the same status DOTS the week strip already uses, so
 * the section reads as part of the app rather than a data export.
 *
 * **Display only.** The page has no selected date, so a tap here would have to
 * assume today — exactly the bug Spec 01 exists to remove.
 *
 * A due dose becomes MISSED only at the end of its scheduled day, so today's
 * outstanding doses read as due right up until midnight.
 */
export function ScheduleGrid({
  compounds,
  states,
  todayKey,
  weekDays,
  hideHeading = false,
}: {
  compounds: StackCompound[]
  /** Compound id → its seven marks. Computed once by `weekMatrix`, which also
   *  produces the week's figures, so the grid never recomputes what the caller
   *  has already worked out. */
  states: Map<string, WeekCellState[]>
  todayKey: string
  /** The seven dates of the week being shown, Monday first. */
  weekDays: Date[]
  /** Set when a wrapper already titles the section, so the heading is not
   *  printed twice. `ScheduleWeeks` is currently the only caller and always
   *  passes it; the branch is kept because the grid is a general component and
   *  losing its own heading would make it unusable anywhere else. */
  hideHeading?: boolean
}) {
  const groups = groupByCategory(compounds)
  const scrolls = compounds.length > SCHEDULE_SCROLL_AFTER_ROWS

  const stateOf = (c: StackCompound, i: number): CellState =>
    states.get(c.id)?.[i] ?? "none"
  const anyPaused = useMemo(
    () => [...states.values()].some((row) => row.includes("paused")),
    [states],
  )

  if (compounds.length === 0) return null

  return (
    <section className="space-y-3">
      {!hideHeading && <h2 className={`${CARD_EYEBROW} px-1`}>Schedule</h2>}

      <div className="rounded-2xl bg-bg-surface p-5">
      {/* Day header — aligned to the same 7-column track the rows use.
          `schedule-dayhead` is the FAR layer of the week-step parallax (see
          globals.css); the groups below are the near one. */}
      <div className="schedule-dayhead flex items-center gap-3">
        <span className="w-[38%] shrink-0" />
        <div className="grid flex-1 grid-cols-7 gap-1">
          {weekDays.map((d, i) => {
            const isToday = toDateKey(d) === todayKey
            return (
              <span
                key={d.toISOString()}
                className={cn(
                  "flex flex-col items-center leading-none",
                  isToday ? "text-text-muted" : "text-text-subtle"
                )}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide">
                  {DAY_INITIALS[i]}
                </span>
                {/* The DATE, not just the initial. Once the grid can show a week
                    other than this one, "M T W T F S S" alone says nothing about
                    WHICH week you are looking at (Adrian, 2026-09-03). Shown on
                    every week rather than only past ones, so there is no mode to
                    notice and today's column is dated too. */}
                <span
                  className={cn(
                    "mt-0.5 font-mono text-[9px] tabular-nums",
                    isToday && "text-foreground"
                  )}
                >
                  {d.getDate()}
                </span>
              </span>
            )
          })}
        </div>
      </div>

      <div className={cn("mt-2", scrolls && "max-h-64 overflow-y-auto")}>
        {groups.map((g) => {
          const meta =
            CATEGORY_META[g.cat as CompoundCategory] ?? FALLBACK_CATEGORY_META
          return (
            <div key={g.cat} className="schedule-group mt-3 first:mt-0">
              {/* The compound type ICON carries the category colour; the label
                  itself is white, so the row reads as a heading rather than as
                  coloured text. Same treatment the dashboard's log card uses. */}
              <span className="flex items-center gap-1.5 px-0.5 pb-1">
                <CategoryIcon category={g.cat} className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-foreground">
                  {meta.label}
                </span>
              </span>
              {g.compounds.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-[38%] shrink-0 truncate text-xs text-text-muted">
                    {c.name}
                  </span>
                  {/* The marks are decorative; the row carries the meaning as
                      text, so a screen reader gets the whole week rather than
                      just the compound's name. */}
                  <div className="grid flex-1 grid-cols-7 gap-1">
                    <span className="sr-only">
                      {weekDays
                        .map(
                          (_d, i) => `${DAY_NAMES[i]} ${STATE_LABEL[stateOf(c, i)]}`
                        )
                        .join(", ")}
                    </span>
                    {weekDays.map((d, i) => (
                      <Mark key={d.toISOString()} state={stateOf(c, i)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <Key showPaused={anyPaused} />
      </div>
    </section>
  )
}

/**
 * Logged is solid white, DUE is a mid-grey FILL (the spec's word), missed is the
 * hollow one, and a day with nothing due is a bare tick so the row still reads as
 * seven days.
 *
 * Due and missed were both hollow rings differing only in border colour, which
 * made MISSED the fainter of the two and nearly indistinguishable from "nothing
 * due" — the state that most needs to be seen was the least visible. Filling due
 * separates them by shape rather than by a shade of grey.
 */
function Mark({ state }: { state: CellState }) {
  // Paused is a GLYPH, not another dot. A row of pause bars reads as
  // "deliberately off" the length of the week, which is the one thing a row of
  // faint rest-day dots could never say (Adrian, 2026-09-03). A glyph rather
  // than a colour also keeps it clear of the one-amber-beat rule.
  if (state === "paused") {
    return (
      <span className="flex h-5 items-center justify-center">
        <Pause aria-hidden className="h-2.5 w-2.5 text-text-subtle" weight="fill" />
      </span>
    )
  }
  return (
    <span className="flex h-5 items-center justify-center">
      <span
        aria-hidden
        className={cn(
          "rounded-full",
          state === "logged" && "h-2.5 w-2.5 bg-accent-primary",
          state === "due" && "h-2.5 w-2.5 bg-text-muted",
          // Hollow with a thin border, never a slash — and now the only hollow one.
          state === "missed" && "h-2.5 w-2.5 border border-text-muted",
          state === "none" && "h-1 w-1 bg-border-default"
        )}
      />
    </span>
  )
}

const STATE_LABEL: Record<CellState, string> = {
  paused: "paused",
  logged: "logged",
  due: "due",
  missed: "missed",
  none: "nothing due",
}

/** The key, following the injection-site rotation key's pattern. */
function Key({ showPaused }: { showPaused: boolean }) {
  const items: { state: CellState; label: string }[] = [
    { state: "logged", label: "Logged" },
    { state: "due", label: "Due" },
    { state: "missed", label: "Missed" },
    // Only when the week actually contains one. A legend entry for a state
    // nothing on screen is in is noise, and this key is already four items wide
    // on a phone.
    ...(showPaused ? ([{ state: "paused", label: "Paused" }] as const) : []),
    { state: "none", label: "Nothing due" },
  ]
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 hairline-t pt-3">
      {items.map((i) => (
        <li key={i.state} className="flex items-center gap-1.5">
          <Mark state={i.state} />
          <span className="text-[10px] text-text-muted">{i.label}</span>
        </li>
      ))}
    </ul>
  )
}

interface Group {
  cat: string
  compounds: StackCompound[]
}

// The order is deliberate and shared, NOT the object's key order — see
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
    // arrive. Two of the five grouping sites already sorted by name, so the
    // same two compounds sat in one order here and the opposite order under a
    // photo. Ranked first, named second, everywhere.
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((cat) => ({
      cat,
      compounds: [...byCat.get(cat)!].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}
