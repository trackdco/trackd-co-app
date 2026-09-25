"use client"

import { useState, useSyncExternalStore } from "react"

import { BottomSheet } from "@/components/layout/BottomSheet"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { FlowDoseGroups } from "@/components/home/log/FlowRow"
import { LogFlowContext } from "@/components/home/log/LogFlow"
import { TrackBar } from "@/components/home/log/TrackBar"
import { useDrawSources } from "@/components/home/log/useDrawSources"
import { useLogRows } from "@/components/home/log/useLogRows"
import { PRIMARY_BUTTON } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"
import type { BodySex } from "@/lib/db/types"
import { getStackSnapshot, subscribeStack, type StackCompound } from "@/lib/home/stack"
import { commitDoseOn, getDoseLogsSnapshot, subscribeDoseLogs, unlogDose, type DayLogs } from "@/lib/home/doseLog"
import { dayDoseRows } from "@/lib/home/logRows"
import { toDateKey } from "@/lib/home/mockHomeData"
import { getSelectedDayOrToday, subscribeSelectedDay } from "@/lib/home/selectedDay"

// Stable references for useSyncExternalStore's server snapshot.
const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/**
 * "Log a dose" from the desktop rail: the day's doses as the SAME Flow B rows
 * Home draws (consistency fix #0: one way to log, the same words), grouped by
 * type, with the Track bar as the sheet's footer. A first tap on a circle
 * opens the row, the second logs it; a logged circle un-logs it with Undo.
 *
 * It writes to the day Home's week strip is parked on (today everywhere else),
 * never to "now" when a day was supplied (Spec 01).
 */
export function QuickTrackSheet({
  open,
  onOpenChange,
  userId,
  bodySex,
  onAddCompound,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  /** Which figure the Site panel's map draws (from the user's profile). */
  bodySex: BodySex
  /** The empty sheet's one action: open the compound picker. */
  onAddCompound?: () => void
}) {
  const { guard } = useWriteAccess()
  // Read only while open: the rail mounts this on every screen.
  const stack = useSyncExternalStore(
    subscribeStack,
    () => (open ? getStackSnapshot(userId, EMPTY_STACK) : EMPTY_STACK),
    () => EMPTY_STACK,
  )
  const logs = useSyncExternalStore(
    subscribeDoseLogs,
    () => (open ? getDoseLogsSnapshot(userId) : EMPTY_LOGS),
    () => EMPTY_LOGS,
  )
  // "Today" from the device clock, read again each time the sheet opens.
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()))
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setTodayKey(toDateKey(new Date()))
  }
  const day = useSyncExternalStore(
    subscribeSelectedDay,
    () => getSelectedDayOrToday(todayKey),
    () => todayKey,
  )
  const doses = dayDoseRows(stack, logs, day)
  const drawSources = useDrawSources(
    doses.map((d) => d.id),
    day,
    open,
  )

  const rows = useLogRows({
    day,
    todayKey,
    logs,
    guard,
    commit: (id, log, d, slot) => guard(() => commitDoseOn(userId, id, log, d, d, slot)),
    remove: (id, d, slot) => unlogDose(userId, d, id, slot),
    // Read by the row itself when it opens (none is passed in here). No Add
    // stock from a row: it would open a sheet over this one.
    catalogue: [],
    bodySex,
  })

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => {
        // An open row does not outlive its sheet.
        if (!o) rows.close()
        onOpenChange(o)
      }}
      title="Log a dose"
      description="Tap a dose to open it, then Track. Tap a logged circle to undo it."
      desktop="rail"
      // No field focused on open, so no keyboard springs up over the sheet.
      onOpenAutoFocus={(e) => e.preventDefault()}
      footer={doses.length > 0 ? <TrackBar inline {...rows.bar} /> : undefined}
    >
      {doses.length === 0 ? (
        // Empty: say so, and end in the one action that fixes it (fix #24).
        <div data-sheet-body className="pb-2">
          <p className="inst-rows px-4 py-6 text-center text-sm text-text-muted">Nothing scheduled</p>
          {onAddCompound ? (
            <button type="button" onClick={onAddCompound} className={cn(PRIMARY_BUTTON, "mt-3 w-full")}>
              Add compound
            </button>
          ) : null}
        </div>
      ) : (
        <div data-sheet-body>
          <LogFlowContext.Provider value={rows.flow}>
            <FlowDoseGroups flow={rows.flow} doses={doses} drawSources={drawSources} />
          </LogFlowContext.Provider>
        </div>
      )}
    </BottomSheet>
  )
}
