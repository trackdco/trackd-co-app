"use client"

import Link from "next/link"
import { useMemo } from "react"

import { cn } from "@/lib/utils"
import { CARD, CARD_EYEBROW, PRESS, ROW_CHEVRON } from "@/lib/ui-presets"
import { CaretRight } from "@/components/icons"
import {
  ScheduleGrid,
  SCHEDULE_SCROLL_AFTER_ROWS,
} from "@/components/protocol/ScheduleGrid"
import {
  compoundsInWeek,
  daysBetween,
  historyFloor,
  mondayOf,
  weekDaysFrom,
  weekMatrix,
} from "@/lib/protocol/scheduleWeek"
import type { StackCompound } from "@/lib/home/stack"
import type { DayLogs } from "@/lib/home/doseLog"

/**
 * Protocol's Schedule card (build-brief-final §3.7): THIS week as the square
 * grid, today lit, and the whole card a link to the Schedule page, where the
 * weeks behind it can be walked. Mock: `sched9` in `r6/round4.js`.
 *
 * Absent when there is nothing to show AND nothing behind it (a brand new
 * account). Someone whose week is empty but who has history keeps the card,
 * because stepping back is exactly what they want.
 */
export function ScheduleCard({
  compounds,
  logs,
  todayKey,
  href = "/protocol/schedule",
}: {
  /** The FULL stack, archived compounds included (the same list the Schedule
   *  page takes): `compoundsInWeek` decides which of them ran this week. */
  compounds: StackCompound[]
  logs: DayLogs
  todayKey: string
  /** Where the page lives. The dev preview has its own. */
  href?: string
}) {
  const monday = mondayOf(todayKey)
  const weekDays = useMemo(() => weekDaysFrom(monday), [monday])
  const rows = useMemo(
    () => compoundsInWeek(compounds, weekDays, logs),
    [compounds, weekDays, logs],
  )
  const matrix = useMemo(
    () => weekMatrix(rows, weekDays, logs, todayKey),
    [rows, weekDays, logs, todayKey],
  )
  const hasHistory = daysBetween(historyFloor(logs, todayKey), monday) >= 7

  if (rows.length === 0 && !hasHistory) return null

  /* The link's name is a sentence, not the grid: without it a screen reader
     reads every row's seven-day summary as the name of one link. The page it
     opens carries the full week. */
  const summary =
    matrix.due > 0 ? `, ${matrix.logged} of ${matrix.due} logged this week` : ""

  return (
    <Link
      href={href}
      aria-label={`Schedule${summary}. Open to see past weeks`}
      className={cn(CARD, PRESS.card, "block px-4 pt-3.5 pb-4")}
    >
      <div className="flex items-center justify-between gap-2 pb-2.5">
        <h2 className={CARD_EYEBROW}>Schedule</h2>
        {/* It GOES somewhere (the Schedule page): the row chevron (fix #11). */}
        <CaretRight className={ROW_CHEVRON} aria-hidden />
      </div>
      {rows.length > 0 ? (
        <ScheduleGrid
          compounds={rows}
          states={matrix.states}
          todayKey={todayKey}
          weekDays={weekDays}
          maxRows={SCHEDULE_SCROLL_AFTER_ROWS}
        />
      ) : (
        <p className="text-sm text-text-muted">Nothing is running this week.</p>
      )}
    </Link>
  )
}
