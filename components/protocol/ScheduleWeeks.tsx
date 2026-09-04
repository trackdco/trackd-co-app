"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"

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
  weekMatrix,
} from "@/lib/protocol/scheduleWeek"
import type { StackCompound } from "@/lib/home/stack"
import type { DayLogs } from "@/lib/home/doseLog"

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/**
 * The week's dates, which are the PRECISE half of the header: the label above is
 * deliberately approximate ("3 months ago") and this is the fact under it.
 *
 * So it has to carry a YEAR whenever the week is not in the current one. The
 * first version printed a year only when a week straddled New Year, which meant
 * every week of 2024 read "11 to 17 Mar", indistinguishable from a week of this
 * year, while nothing else on the card said otherwise.
 */
function rangeLabel(weekDays: Date[], todayKey: string): string {
  const a = weekDays[0]
  const b = weekDays[6]
  const am = MONTHS_SHORT[a.getMonth()]
  const bm = MONTHS_SHORT[b.getMonth()]
  const thisYear = Number(todayKey.slice(0, 4))
  // A week straddling New Year needs both years; one wholly in another year
  // needs its own on the end.
  const startYear = a.getFullYear() === b.getFullYear() ? "" : ` ${a.getFullYear()}`
  const endYear = b.getFullYear() === thisYear ? "" : ` ${b.getFullYear()}`
  return am === bm && !startYear
    ? `${a.getDate()} to ${b.getDate()} ${bm}${endYear}`
    : `${a.getDate()} ${am}${startYear} to ${b.getDate()} ${bm}${endYear}`
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

  // `ScheduleGrid` returned null on an empty list, so a brand new account saw no
  // Schedule section at all. Wrapping it lost that: the section appeared saying
  // "Nothing was running this week" in the past tense, over a stepper with both
  // arrows dead. An empty protocol has no schedule to show and no history to
  // walk, so the section stays absent (the bail-out itself sits below, after every
  // hook has run).
  const floor = historyFloor(logs, todayKey, blockStart)
  const canGoBack = daysBetween(floor, monday) >= 7
  const canGoForward = monday < thisMonday

  /* Memoised on purpose. `weekDaysFrom` and the membership filter both build
     fresh arrays, and handing those to `ScheduleGrid` meant its own cell memo
     could never hit: its deps changed identity on every render even when the
     week had not. */
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
   * Replay the step animation without REMOUNTING the grid.
   *
   * This was `key={travel.n}`, which restarted the animation by throwing the
   * whole subtree away and building it again. That also threw away the compound
   * list's scroll position, so a user with more than
   * `SCHEDULE_SCROLL_AFTER_ROWS` compounds was bounced to the top on every tap
   * of an arrow. Removing the class, forcing a reflow and re-adding it restarts
   * the animation with the DOM left alone.
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

  /* Nothing to show AND nothing behind it. `compounds.length === 0` was the
     wrong test once this started receiving the full stack including archived
     ones: a user who deleted their last compound has a non-empty stack and no
     current rows, so Protocol's resting state became a card announcing that
     nothing ran this week. Someone with history keeps the section, because
     stepping back is exactly what they want. */
  if (rows.length === 0 && !canGoBack) return null

  const grid = (
    <div ref={animRef}>
      {rows.length > 0 ? (
        <ScheduleGrid
          compounds={rows}
          states={matrix.states}
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
          /* Without this the accessible name is the button's CONTENT, and the
             content is the whole grid: every compound's screen-reader week
             summary, which on a full protocol is ~175 day-and-state phrases
             read out as the name of one control. */
          aria-label="Schedule. Open to step back through past weeks"
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

      <div
        role="button"
        tabIndex={-1}
        onClick={toggle}
        className="cursor-pointer"
      >
        {grid}
      </div>

      {/* A week with nothing due carries no figure. "0 of 0 logged" states a
          measurement nobody made, which is the same thing `percent()` prints an
          em dash for and the weight card refuses "+0.0 kg" for. A long-cadence
          compound, or one paused all week, lands here routinely. */}
      {(matrix.due > 0 || matrix.pausedDays > 0) && (
        <p className="px-1 font-mono text-[11px] tabular-nums text-text-subtle">
          {matrix.due > 0 && `${matrix.logged} of ${matrix.due} logged`}
          {matrix.due > 0 && matrix.pausedDays > 0 && " · "}
          {matrix.pausedDays > 0 &&
            `paused ${matrix.pausedDays} ${matrix.pausedDays === 1 ? "day" : "days"}`}
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
