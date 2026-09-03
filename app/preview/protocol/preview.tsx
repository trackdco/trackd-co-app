"use client"

import { useEffect, useMemo } from "react"
import Image from "next/image"

import { BottomNav } from "@/components/navigation/bottom-nav"
import { QuickActionsFab } from "@/components/shortcuts/QuickActionsFab"
import { useMounted } from "@/components/home/useMounted"
import { ProtocolScreen } from "@/components/protocol/ProtocolScreen"
import {
  recordScheduleStop,
  saveStack,
  notifyStackChanged,
  type StackCompound,
} from "@/lib/home/stack"
import {
  notifyDoseLogsChanged,
  saveDoseLogs,
  type DayLogs,
} from "@/lib/home/doseLog"
import type { DoseLog } from "@/lib/home/mockHomeData"
import { toDateKey } from "@/lib/home/mockHomeData"
import type { StockItem } from "@/lib/db/inventory"

/**
 * Seeds a mock cycle + stack into a throwaway "preview" store, then renders the
 * real ProtocolScreen against it. The live wiring (hydration / dual-writes) no-ops
 * gracefully without a session, so the screen renders populated for a look. Adding
 * a compound in the preview works locally; it resets to this mock on reload.
 */
const USER = "preview"

function dayOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

function buildMock(): { stack: StackCompound[]; stock: StockItem[]; logs: DayLogs } {
  // Ten weeks back, so the week stepper has real history to walk rather than
  // one week and a wall.
  const start = dayOffset(-70)
  const stack: StackCompound[] = [
    {
      id: "pv-test-e",
      name: "Testosterone Enanthate",
      category: "anabolic",
      method: "im",
      dose: 250,
      unit: "mg",
      schedule: { cadence: { type: "everyOtherDay" }, timeOfDay: "09:00", startDate: start },
      rotationSites: ["im-vglute-r", "im-vglute-l", "im-glute-r", "im-glute-l"],
      rotationIndex: 1,
    },
    {
      id: "pv-ipa",
      name: "Ipamorelin",
      category: "peptide",
      method: "subq",
      dose: 200,
      unit: "mcg",
      schedule: { cadence: { type: "daily" }, timeOfDay: "07:00", startDate: start },
      rotationSites: ["sq-abdo-l", "sq-abdo-r", "sq-flank-l", "sq-flank-r"],
      rotationIndex: 2,
    },
    {
      id: "pv-anastrozole",
      name: "Anastrozole",
      category: "ancillary",
      method: "po",
      dose: 0.5,
      unit: "mg",
      schedule: { cadence: { type: "daysOfWeek", days: [1, 4] }, timeOfDay: "20:00", startDate: start },
      rotationSites: [],
      rotationIndex: 0,
    },
  ]

  // A PAUSED compound, so the grid's pause glyph has something to draw. Paused
  // for the whole of last week and still paused, which is the shape that reads
  // as a row of pause bars rather than a gap.
  stack.push({
    id: "pv-nandrolone",
    name: "Nandrolone",
    category: "anabolic",
    method: "im",
    dose: 200,
    unit: "mg",
    schedule: { cadence: { type: "everyOtherDay" }, timeOfDay: "09:00", startDate: start },
    rotationSites: [],
    rotationIndex: 0,
    pauses: [{ id: "pv-pause", startedOn: dayOffset(-13), endsOn: null }],
  })

  // DELETED MID-WEEK, which is Adrian's rule (2026-09-03): it keeps its row for
  // the rest of that week and is gone from the next one. Delete writes a dated
  // `stopped` version AND sets `archived`, so this mirrors both — and the grid
  // must still show it in every week it actually ran in.
  const trest: StackCompound = {
    id: "pv-trestolone",
    name: "Trestolone",
    category: "anabolic",
    method: "im",
    dose: 50,
    unit: "mg",
    schedule: { cadence: { type: "daily" }, timeOfDay: "09:00", startDate: start },
    rotationSites: [],
    rotationIndex: 0,
  }
  const stoppedOn = dayOffset(-16)
  stack.push({
    ...trest,
    archived: true,
    scheduleHistory: recordScheduleStop(trest, stoppedOn),
  })

  // Adrian's own example (2026-09-03): creatine dosed nearly three years ago and
  // then dropped. It is what gives the week stepper enough depth to show the
  // label changing unit (weeks, then months, then years), and the two and a half
  // years of nothing between it and the current run render as empty weeks, which
  // is the honest answer rather than an error.
  const creStart = dayOffset(-950)
  const creatine: StackCompound = {
    id: "pv-creatine",
    name: "Creatine",
    category: "supplement",
    method: "po",
    dose: 5,
    unit: "g",
    schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: creStart },
    rotationSites: [],
    rotationIndex: 0,
  }
  stack.push({
    ...creatine,
    archived: true,
    scheduleHistory: recordScheduleStop(creatine, dayOffset(-880)),
  })

  // Mock "stock left" (as v_inventory_math would derive it) for the Stock tab.
  const stock: StockItem[] = [
    {
      id: "pv-inv-test",
      protocolCompoundId: "pv-test-e",
      compoundName: "Testosterone Enanthate",
      category: "anabolic",
      inventoryType: "preconcentrated",
      baseUnit: "mg",
      acquiredOn: start,
      reconstitutedOn: null,
      totalAmount: 10,
      totalAmountUnit: "ml",
      bacWaterMl: null,
      concentrationMgPerMl: 250,
      strengthPerUnit: null,
      servingSizeG: null,
      priorUsedBase: null,
      remainingDisplay: 8.5,
      dosesRemaining: 17,
      daysToEmpty: null,
    estEmptyDate: dayOffset(48),
      mlPerDose: 1,
      unitsPerDoseOral: null,
      concentrationPerMl: 250,
      remainingBase: 2125,
      totalBase: 2500, // ~85% full
    },
    {
      id: "pv-inv-ipa",
      protocolCompoundId: "pv-ipa",
      compoundName: "Ipamorelin",
      category: "peptide",
      inventoryType: "reconstituted",
      baseUnit: "mg",
      acquiredOn: start,
      reconstitutedOn: start,
      totalAmount: 5,
      totalAmountUnit: "mg",
      bacWaterMl: 2,
      concentrationMgPerMl: null,
      strengthPerUnit: null,
      servingSizeG: null,
      priorUsedBase: null,
      remainingDisplay: 0.6,
      dosesRemaining: 3,
      daysToEmpty: null,
    estEmptyDate: dayOffset(8),
      mlPerDose: 0.1,
      unitsPerDoseOral: null,
      concentrationPerMl: 2.5,
      remainingBase: 1.5,
      totalBase: 5, // ~30% — shows a low bar
    },
  ]
  // Doses across the run, with a few deliberately skipped so past weeks show
  // hollow "missed" rings rather than a clean sweep. The EARLIEST key here is
  // what `historyFloor` uses as the back-stop, so this also decides how far the
  // stepper can walk.
  const dose = (amount: string, unit: string, time24: string): DoseLog => ({
    amount,
    unit,
    siteId: null,
    time24,
  })
  const logs: DayLogs = {}
  for (let d = 950; d >= 880; d--) {
    // The old creatine run. Its EARLIEST key is what `historyFloor` uses, so
    // this is also what decides how far back the stepper can walk.
    if (d % 3 === 0) continue
    logs[dayOffset(-d)] = { "pv-creatine": dose("5", "g", "08:00") }
  }
  for (let d = 70; d >= 0; d--) {
    const key = dayOffset(-d)
    const day: Record<string, DoseLog> = {}
    if (d % 2 === 0 && d % 11 !== 0) day["pv-test-e"] = dose("250", "mg", "09:00")
    if (d % 9 !== 0) day["pv-ipa"] = dose("200", "mcg", "07:00")
    if (d > 16 && d % 2 === 0) day["pv-trestolone"] = dose("50", "mg", "09:00")
    if (Object.keys(day).length > 0) logs[key] = day
  }

  return { stack, stock, logs }
}

export function ProtocolPreview() {
  const mounted = useMounted()
  const { stack, stock, logs } = useMemo(() => buildMock(), [])

  // Seed the throwaway preview store (no setState here → no cascading render).
  useEffect(() => {
    saveStack(USER, stack)
    saveDoseLogs(USER, logs)
    notifyStackChanged()
    // `saveDoseLogs` is intentionally silent (doseLog.ts): the mutators notify.
    // Writing the store directly means this owes the signal itself. Without it
    // the seeded logs only appeared because `notifyStackChanged` happened to
    // wake a subscriber in the same component.
    notifyDoseLogsChanged()
  }, [stack, logs])

  if (!mounted) return null
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom)+4.5rem)]">
      <header
        className="flex items-center justify-between border-b border-border/60 px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingBottom: "0.75rem",
        }}
      >
        <Image src="/trackd-wordmark.png" alt="trackd co" width={1049} height={200} className="h-4 w-auto" />
        <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Preview · Protocol
        </span>
      </header>

      <main className="flex-1">
        <ProtocolScreen userId={USER} previewStock={stock} />
      </main>

      <BottomNav />
      <QuickActionsFab userId={USER} unit="kg" bodySex="male" />
    </div>
  )
}
