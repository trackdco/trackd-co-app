"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { CARD, GHOST_BUTTON, ROW_META } from "@/lib/ui-presets"
import { CaretLeft, CaretRight } from "@/components/icons"
import { ScheduleGrid } from "@/components/protocol/ScheduleGrid"
import {
  compoundsInWeek,
  historyFloor,
  mondayOf,
  relativeWeekLabel,
  shiftWeeks,
  weekDaysFrom,
  weekMatrix,
  weekNav,
} from "@/lib/protocol/scheduleWeek"
import type { StackCompound } from "@/lib/home/stack"
import type { DayLogs } from "@/lib/home/doseLog"
import { toDateKey } from "@/lib/home/mockHomeData"
import { dayRange } from "@/lib/format/date"

/**
 * The week's dates, which are the PRECISE half of the header: the label above is
 * deliberately approximate ("3 months ago") and this is the fact under it.
 *
 * So it has to carry a YEAR whenever the week is not in the current one. The
 * first version printed a year only when a week straddled New Year, which meant
 * every week of 2024 read "11 to 17 Mar", indistinguishable from a week of this
 * year, while nothing else on the card said otherwise. `dayRange` (the one
 * range format, consistency fix #26) carries the year the same way.
 */
function rangeLabel(weekDays: Date[], todayKey: string): string {
  return dayRange(toDateKey(weekDays[0]), toDateKey(weekDays[6]), Number(todayKey.slice(0, 4)))
}

/**
 * The Schedule page's body (build-brief-final §3.7): the week grid, steppable
 * back through past weeks (Adrian, 2026-09-03), in the same squares as the
 * Protocol card. It always opens on THIS week; the page is a fresh mount each
 * visit, so leaving and coming back never lands you in August.
 *
 * **Rows are decided per week, not per day.** A compound stopped on the
 * Wednesday keeps its row for the rest of that week and is gone from the next
 * one, which is Adrian's rule and also the only one that makes sense for a row
 * that IS a week. Membership comes from the dated `stopped` version Delete
 * writes, never the undated `archived` flag, so deleting a compound today does
 * not erase it from every week it ever ran in.
 *
 * **How far back** is the user's first logged dose, or a block's start when
 * scoped to one. Weeks in between with nothing in them draw empty, which is a
 * fact rather than an error.
 *
 * **Read-only. Nothing on the grid is tappable** (Adrian, 2026-09-03). The only
 * controls are the two arrows and, off this week, "This week", and a mark is
 * never a button: tapping a hollow square to log a backdated dose was
 * considered and explicitly rejected.
 *
 * **"This week"** (Adrian's walk, W19) jumps straight back from any week in
 * one step, with the same parallax as a step forward. It sits centred under the
 * week, as the calendar's "Today" sits under its month (`DatePickerPanel`), on
 * the arrows' own ghost surface, and it is there only while you are off this
 * week: on it, it is hidden and inert. It stays mounted so its entrance and
 * exit are one interruptible transition on the same path (`.schedule-thisweek`
 * in globals.css), and its slot is the last thing on the page, so appearing
 * moves nothing you are reading.
 */
export function ScheduleWeeks({
  compounds,
  logs,
  todayKey,
  blockStart,
}: {
  /** The FULL stack, archived compounds included: a past week needs the ones
   *  that are no longer current, and `compoundsInWeek` dates them properly. */
  compounds: StackCompound[]
  logs: DayLogs
  todayKey: string
  /** Scopes the floor to a block's start. Omitted on Protocol, where the floor
   *  is the first dose ever logged. */
  blockStart?: string | null
}) {
  const thisMonday = mondayOf(todayKey)
  const [monday, setMonday] = useState(thisMonday)
  /** Which way the last step went, and a counter to re-trigger the animation on
   *  a repeat tap in the same direction (a class alone would not restart it). */
  const [travel, setTravel] = useState<{ dir: "back" | "forward"; n: number } | null>(null)

  function step(dir: "back" | "forward") {
    setMonday((m) => shiftWeeks(m, dir === "back" ? -1 : 1))
    setTravel((t) => ({ dir, n: (t?.n ?? 0) + 1 }))
  }

  const floor = historyFloor(logs, todayKey, blockStart)
  // A day rolling over into a new week while the page sits open leaves the
  // grid one week back, with the forward arrow and "This week" live to catch
  // up. The rules are `weekNav`'s, tested in lib.
  const { canGoBack, canGoForward, away, toThisWeek } = weekNav(monday, thisMonday, floor)

  const backRef = useRef<HTMLButtonElement>(null)
  const thisWeekRef = useRef<HTMLButtonElement>(null)

  /** Back to this week in one step. The button hides once there, so focus that
   *  was on it moves to the back arrow rather than falling to the page. */
  function jumpToThisWeek() {
    if (!toThisWeek) return
    const hadFocus = document.activeElement === thisWeekRef.current
    setMonday(thisMonday)
    setTravel((t) => ({ dir: toThisWeek, n: (t?.n ?? 0) + 1 }))
    if (hadFocus) backRef.current?.focus()
  }

  /* Memoised on purpose. `weekDaysFrom` and the membership filter both build
     fresh arrays, and handing those to `ScheduleGrid` meant its own memos could
     never hit: their deps changed identity on every render even when the week
     had not. */
  const weekDays = useMemo(() => weekDaysFrom(monday), [monday])
  const rows = useMemo(
    () => compoundsInWeek(compounds, weekDays, logs),
    [compounds, weekDays, logs],
  )
  /* Marks and figures from ONE pass, so the grid does not recompute what the
     tally already worked out. */
  const matrix = useMemo(
    () => weekMatrix(rows, weekDays, logs, todayKey),
    [rows, weekDays, logs, todayKey],
  )

  const heading = relativeWeekLabel(monday, thisMonday)

  /**
   * Replay the step animation without REMOUNTING the grid: removing the class,
   * forcing a reflow and re-adding it restarts the animation with the DOM left
   * alone (a `key` would rebuild the subtree on every tap of an arrow).
   */
  const animRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = animRef.current
    if (!el || !travel) return
    const cls = travel.dir === "back" ? "animate-schedule-back" : "animate-schedule-forward"
    el.classList.remove("animate-schedule-back", "animate-schedule-forward")
    // Reading a layout property flushes the removal, which is what makes the
    // re-add count as a new animation rather than a no-op.
    void el.offsetWidth
    el.classList.add(cls)
  }, [travel])

  return (
    <section aria-label="Schedule by week" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <StepButton
          ref={backRef}
          label="Previous week"
          disabled={!canGoBack}
          onClick={() => step("back")}
        >
          <CaretLeft className="h-4 w-4" aria-hidden />
        </StepButton>

        {/* Announced on change, so stepping says which week it landed on. */}
        <div className="min-w-0 text-center" aria-live="polite">
          <p className="truncate text-sm text-foreground">{heading}</p>
          <p className={cn(ROW_META, "mt-0.5")}>
            {rangeLabel(weekDays, todayKey)}
          </p>
        </div>

        <StepButton
          label="Next week"
          disabled={!canGoForward}
          onClick={() => step("forward")}
        >
          <CaretRight className="h-4 w-4" aria-hidden />
        </StepButton>
      </div>

      <div ref={animRef} className={cn(CARD, "px-4 pt-3.5 pb-4")}>
        {rows.length > 0 ? (
          <ScheduleGrid
            compounds={rows}
            states={matrix.states}
            todayKey={todayKey}
            weekDays={weekDays}
            dates
            legend
          />
        ) : (
          /* An empty week is a fact, not an error. Someone who logged one dose
             three years ago earns every week between then and now, and most of
             them look like this. */
          <p className="py-1 text-sm text-text-muted">
            {monday === thisMonday
              ? "Nothing is running this week."
              : "Nothing was running this week."}
          </p>
        )}
      </div>

      {/* A week with nothing due carries no figure. "0 of 0 logged" states a
          measurement nobody made. A long-cadence compound, or one paused all
          week, lands here routinely. */}
      {(matrix.due > 0 || matrix.pausedDays > 0) && (
        <p className="px-1 font-mono text-[11px] tabular-nums text-text-muted">
          {matrix.due > 0 && `${matrix.logged} of ${matrix.due} logged`}
          {matrix.due > 0 && matrix.pausedDays > 0 && " · "}
          {matrix.pausedDays > 0 &&
            `paused ${matrix.pausedDays} ${matrix.pausedDays === 1 ? "day" : "days"}`}
        </p>
      )}

      {/* "This week" (W19). The wrapper carries the show and hide, so the
          button's own press (scale and dim) never fights it. */}
      <div className="flex justify-center">
        <span className="schedule-thisweek" data-shown={away ? "true" : "false"} inert={!away}>
          <button
            ref={thisWeekRef}
            type="button"
            onClick={jumpToThisWeek}
            className={GHOST_BUTTON}
          >
            This week
          </button>
        </span>
      </div>
    </section>
  )
}

/** A ghost button, radius 9 (rounded rectangles everywhere, §2.4), 44px square:
 *  the arrows are the only way through the history. */
function StepButton({
  ref,
  label,
  disabled,
  onClick,
  children,
}: {
  ref?: React.Ref<HTMLButtonElement>
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(GHOST_BUTTON, "h-11 w-11 shrink-0 p-0 disabled:opacity-40")}
    >
      {children}
    </button>
  )
}
