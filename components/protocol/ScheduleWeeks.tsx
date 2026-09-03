"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import { CaretLeft, CaretRight, CaretDown } from "@/components/icons"
import { ScheduleGrid } from "@/components/protocol/ScheduleGrid"
import {
  compoundsInWeek,
  daysBetween,
  historyFloor,
  mondayOf,
  relativeWeekLabel,
  shiftWeeks,
  weekDaysFrom,
  weekTally,
} from "@/lib/protocol/scheduleWeek"
import type { StackCompound } from "@/lib/home/stack"
import type { DayLogs } from "@/lib/home/doseLog"

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function rangeLabel(weekDays: Date[]): string {
  const a = weekDays[0]
  const b = weekDays[6]
  const am = MONTHS_SHORT[a.getMonth()]
  const bm = MONTHS_SHORT[b.getMonth()]
  const year = a.getFullYear() === b.getFullYear() ? "" : ` ${a.getFullYear()}`
  return am === bm
    ? `${a.getDate()} to ${b.getDate()} ${bm}`
    : `${a.getDate()} ${am}${year} to ${b.getDate()} ${bm}`
}

/**
 * The Schedule grid, steppable back through past weeks (Adrian, 2026-09-03).
 *
 * The grid itself already took the week it draws as a prop; this adds the week
 * to draw, the floor it may not step past, and the rows that week contained.
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
 * controls are the two arrows, and a mark is never a button: tapping a hollow
 * ring to log a backdated dose was considered and explicitly rejected.
 *
 * **Collapsed by default, and it always opens on THIS week.** The arrows only
 * exist once the card is expanded, so the resting state of Protocol is exactly
 * the week grid it has always been. The week resets on collapse as well as on
 * mount, so leaving Protocol and coming back never lands you in August.
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
  const [expanded, setExpanded] = useState(false)
  /** Which way the last step went, and a counter to re-trigger the animation on
   *  a repeat tap in the same direction (a class alone would not restart it). */
  const [travel, setTravel] = useState<{ dir: "back" | "forward"; n: number } | null>(null)

  /** Collapsing returns to the present. Together with the mount default this is
   *  what makes "click off Protocol and back on" always show this week
   *  (Adrian, 2026-09-03) rather than wherever you had wandered to. */
  /**
   * One target, both ways: the card IS the toggle and there is no Done button
   * (Adrian, 2026-09-03).
   *
   * Collapsing returns to the present. It has to: the collapsed card is
   * Protocol's resting state and always draws this week, so remembering week
   * -8 behind it would mean the two states disagreed about what you were
   * looking at. The cost is that a mis-tap on the grid loses your place, and
   * stepping back is the cheap half of that trade.
   */
  function toggle() {
    if (expanded) {
      setExpanded(false)
      setMonday(thisMonday)
      setTravel(null)
    } else {
      setExpanded(true)
    }
  }

  function step(dir: "back" | "forward") {
    setMonday((m) => shiftWeeks(m, dir === "back" ? -1 : 1))
    setTravel((t) => ({ dir, n: (t?.n ?? 0) + 1 }))
  }
  // A day rolling over while the page sits open must not strand the grid on a
  // week that no longer contains today.
  if (!expanded && monday !== thisMonday) setMonday(thisMonday)

  const floor = historyFloor(logs, todayKey, blockStart)
  const canGoBack = daysBetween(floor, monday) >= 7
  const canGoForward = monday < thisMonday

  const weekDays = weekDaysFrom(monday)
  const rows = compoundsInWeek(compounds, weekDays)
  const tally = weekTally(rows, weekDays, logs, todayKey)

  const heading = relativeWeekLabel(monday, thisMonday)

  /* Keyed on the step counter so tapping "back" twice replays the slide; a bare
     class change would not restart an animation that is already finished. */
  const grid = (
    <div
      key={travel?.n ?? "rest"}
      className={cn(
        travel?.dir === "back" && "animate-schedule-back",
        travel?.dir === "forward" && "animate-schedule-forward",
      )}
    >
      {rows.length > 0 ? (
        <ScheduleGrid
          compounds={rows}
          logs={logs}
          todayKey={todayKey}
          weekDays={weekDays}
          hideHeading
        />
      ) : (
      /* An empty week is a fact, not an error. Someone who logged one dose three
         years ago earns every week between then and now, and most of them look
         like this. */
        <div className="rounded-2xl bg-bg-surface p-5">
          <p className="text-sm text-text-muted">Nothing was running this week.</p>
        </div>
      )}
    </div>
  )

  // ── Collapsed: Protocol's resting state, unchanged apart from the chevron ──
  if (!expanded) {
    return (
      <section className="space-y-3">
        <div
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              toggle()
            }
          }}
          aria-expanded={false}
          /* A div rather than a <button> because the grid scrolls its own rows
             past eight compounds, and a scroll container inside a button is a
             fight on touch. Keyboard and role are carried explicitly instead. */
          className="cursor-pointer rounded-2xl transition-transform active:scale-[0.98] active:opacity-90"
        >
          <div className="flex items-center justify-between gap-2 px-1 pb-3">
            <h2 className={CARD_EYEBROW}>Schedule</h2>
            <CaretDown className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
          </div>
          {grid}
        </div>
      </section>
    )
  }

  // ── Expanded: the same grid, with the weeks behind it reachable ──
  return (
    <section className="animate-schedule-open space-y-3">
      {/* The header closes it again. The ARROWS are separate buttons below and
          stop their clicks from reaching this, so stepping never collapses. */}
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            toggle()
          }
        }}
        aria-expanded
        /* 44px. Measured at 16 first, which is the height of a `CARD_EYEBROW`
           and not a tap target: the primary way to close this cannot be four
           pixels of chevron. The grid below closes it too, so this is the
           deliberate target rather than the only one. */
        className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-1"
      >
        <h2 className={CARD_EYEBROW}>Schedule</h2>
        <CaretDown className="h-4 w-4 shrink-0 rotate-180 text-text-subtle" aria-hidden />
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <StepButton
          label="Previous week"
          disabled={!canGoBack}
          onClick={() => step("back")}
        >
          <CaretLeft className="h-4 w-4" aria-hidden />
        </StepButton>

        <div className="min-w-0 text-center">
          <p className="truncate text-sm text-foreground">{heading}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-subtle">
            {rangeLabel(weekDays)}
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

      <div
        role="button"
        tabIndex={-1}
        onClick={toggle}
        className="cursor-pointer"
      >
        {grid}
      </div>

      {rows.length > 0 && (
        <p className="px-1 font-mono text-[11px] tabular-nums text-text-subtle">
          {tally.logged} of {tally.due} logged
          {tally.paused > 0 && ` · ${tally.paused} paused`}
        </p>
      )}
    </section>
  )
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // 44px target: this is the only way through the history.
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors",
        disabled
          ? "border-border-default text-text-subtle opacity-40"
          : "border-border-strong text-text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
