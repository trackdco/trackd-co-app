"use client"

import { useEffect, useMemo } from "react"
import Image from "next/image"

import { BottomNav } from "@/components/navigation/bottom-nav"
import { QuickActionsFab } from "@/components/shortcuts/QuickActionsFab"
import { useMounted } from "@/components/home/useMounted"
import { ScrollSettle } from "@/components/feel/ScrollSettle"
import { Toast } from "@/components/feel/Toast"
import { ProtocolScreen } from "@/components/protocol/ProtocolScreen"
import { StacksScreen } from "@/components/protocol/pages/StacksScreen"
import { CyclesScreen } from "@/components/protocol/pages/CyclesScreen"
import { EndedCyclesScreen } from "@/components/protocol/pages/EndedCyclesScreen"
import { HalfLifeScreen } from "@/components/protocol/pages/HalfLifeScreen"
import { HalfLifeCompoundScreen } from "@/components/protocol/pages/HalfLifeCompoundScreen"
import { ScheduleScreen } from "@/components/protocol/pages/ScheduleScreen"
import { saveStacks, notifyStacksChanged, type Stack } from "@/lib/home/stacks"
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
import type { StockItem, StockRead } from "@/lib/db/inventory"

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

/** Cycled compounds for the demo scale (`?n=`), real names, four patterns. */
const DEMO: [string, StackCompound["category"], StackCompound["method"]][] = [
  ["Testosterone Cypionate", "anabolic", "im"],
  ["BPC-157", "peptide", "subq"],
  ["TB-500", "peptide", "subq"],
  ["CJC-1295", "peptide", "subq"],
  ["Semaglutide", "peptide", "subq"],
  ["Anastrozole", "ancillary", "po"],
  ["Enclomiphene", "ancillary", "po"],
  ["Oxandrolone", "oral", "po"],
  ["MK-677", "sarm", "po"],
  ["Ostarine", "sarm", "po"],
  ["Levothyroxine", "thyroid", "po"],
  ["Creatine", "supplement", "po"],
  ["Caffeine", "stimulant", "po"],
  ["Masteron", "anabolic", "im"],
]

function demoCycles(n: number, start: string): StackCompound[] {
  const pats: [number, number][] = [[5, 2], [42, 14], [56, 28], [14, 7]]
  return Array.from({ length: n }, (_, i) => {
    const [name, category, method] = DEMO[i % DEMO.length]
    const [onDays, offDays] = pats[i % pats.length]
    return {
      id: `pv-demo-${i}`,
      name: i >= DEMO.length ? `${name} ${Math.floor(i / DEMO.length) + 1}` : name,
      category,
      method,
      dose: 1,
      unit: "mg",
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: start },
      rotationSites: [],
      rotationIndex: 0,
      cycle: {
        pattern: { type: "onOff", onDays, offDays },
        end: { type: "never" },
        colour: (["steel", "bronze", "moss", "rosewood"] as const)[i % 4],
        anchor: dayOffset(-((i * 9) % 60)),
      },
      ...(i % 10 === 7 ? { pauses: [{ id: `pv-demo-p${i}`, startedOn: dayOffset(-3), endsOn: null }] } : {}),
    } as StackCompound
  })
}

function buildMock(demo = 0): { stack: StackCompound[]; stock: StockItem[]; logs: DayLogs; stacks: Stack[]; read: StockRead } {
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
      cycle: { pattern: { type: "onOff", onDays: 14, offDays: 7 }, end: { type: "afterRounds", rounds: 3 }, colour: "steel", anchor: dayOffset(-16) },
    },
  ]
  stack[1] = {
    ...stack[1],
    cycle: { pattern: { type: "onOff", onDays: 56, offDays: 28 }, end: { type: "never" }, colour: "bronze", anchor: dayOffset(-18) },
  }

  // A PAUSED compound, so the grid's pause glyph has something to draw. Paused
  // for the whole of last week and still paused, which is the shape that reads
  // as a row of pause bars rather than a gap.
  // Half-life build: a weekly-ish injection and a blend, so both half-life
  // cards have a real curve to draw.
  stack.push(
    {
      id: "pv-reta",
      name: "Retatrutide",
      category: "peptide",
      method: "subq",
      dose: 2,
      unit: "mg",
      schedule: { cadence: { type: "daysOfWeek", days: [1, 4] }, timeOfDay: "08:00", startDate: dayOffset(-28) },
      rotationSites: ["sq-abdo-l", "sq-abdo-r"],
      rotationIndex: 0,
    },
    {
      id: "pv-glow",
      name: "Glow (BPC-157 + TB-500 + GHK-Cu)",
      category: "peptide",
      method: "subq",
      dose: 1750,
      unit: "mcg",
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: dayOffset(-21) },
      rotationSites: ["sq-abdo-l", "sq-abdo-r"],
      rotationIndex: 0,
    },
  )

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

  // Ended: Enclomiphene's 5-on-2-off ended by hand nine days ago, and BPC-157's
  // six weeks that ran their course five days ago. Both show under Ended.
  const enclo: StackCompound = {
    id: "pv-enclo",
    name: "Enclomiphene",
    category: "ancillary",
    method: "po",
    dose: 12.5,
    unit: "mg",
    schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: dayOffset(-60) },
    rotationSites: [],
    rotationIndex: 0,
    scheduleHistory: [
      { effectiveFrom: dayOffset(-60), cadence: { type: "daily" }, timeOfDay: "08:00", dose: 12.5, unit: "mg", cycle: { pattern: { type: "onOff", onDays: 5, offDays: 2 }, end: { type: "never" }, colour: "moss", anchor: dayOffset(-60) } },
      { effectiveFrom: dayOffset(-9), cadence: { type: "daily" }, timeOfDay: "08:00", dose: 12.5, unit: "mg" },
    ],
  }
  const bpcCycle = { pattern: { type: "onOff" as const, onDays: 42, offDays: 14 }, end: { type: "onDate" as const, date: dayOffset(-5) }, colour: "rosewood" as const, anchor: dayOffset(-47) }
  stack.push(enclo, {
    id: "pv-bpc",
    name: "BPC-157",
    category: "peptide",
    method: "subq",
    dose: 250,
    unit: "mcg",
    schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: dayOffset(-47) },
    rotationSites: ["sq-abdo-l", "sq-abdo-r"],
    rotationIndex: 0,
    cycle: bpcCycle,
  })
  stack.push(...demoCycles(demo, start))

  // Mock "stock left" (as v_inventory_math would derive it) for the Stock tab.
  const stock: StockItem[] = [
    {
      id: "pv-inv-test",
      createdAt: null,
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
      createdAt: null,
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
    const dow = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - d).getDay()
    if (d <= 28 && d > 0 && (dow === 1 || dow === 4)) day["pv-reta"] = dose("2", "mg", "08:00")
    if (d <= 70 && d > 0 && (dow === 1 || dow === 4)) day["pv-anastrozole"] = dose("0.5", "mg", "20:00")
    if (d <= 21 && d > 0) day["pv-glow"] = dose("1750", "mcg", "08:00")
    if (Object.keys(day).length > 0) logs[key] = day
  }

  // A stack of two, and stock with spares for the Stock page: Retatrutide
  // holds two open vials and three unmixed; Test E one open and one unopened.
  const stacks: Stack[] = [
    {
      id: "pv-stack-mt",
      name: "Monday & Thursday",
      colour: "steel",
      effectiveFrom: start,
      members: ["pv-reta", "pv-anastrozole"].map((compoundId, position) => ({ compoundId, from: start, position })),
    },
  ]
  const vial = (id: string, pc: string, name: string, over: Partial<StockItem> = {}): StockItem => ({
    ...stock[1],
    id,
    protocolCompoundId: pc,
    compoundName: name,
    ...over,
  })
  const spare = (id: string, pc: string, name: string, over: Partial<StockItem> = {}): StockItem =>
    vial(id, pc, name, {
      acquiredOn: null, reconstitutedOn: null, bacWaterMl: null, remainingDisplay: null,
      dosesRemaining: null, remainingBase: null, ...over,
    })
  const items: StockItem[] = [
    stock[0],
    spare("pv-inv-test-2", "pv-test-e", "Testosterone Enanthate", { inventoryType: "preconcentrated", category: "anabolic", totalAmountUnit: "ml", totalBase: 2500 }),
    stock[1],
    vial("pv-inv-reta-1", "pv-reta", "Retatrutide", { dosesRemaining: 4, remainingBase: 2, totalBase: 10, createdAt: "2026-09-01T00:00:00Z" }),
    vial("pv-inv-reta-2", "pv-reta", "Retatrutide", { dosesRemaining: 7, remainingBase: 7, totalBase: 10, createdAt: "2026-09-20T00:00:00Z" }),
    spare("pv-inv-reta-s1", "pv-reta", "Retatrutide"),
    spare("pv-inv-reta-s2", "pv-reta", "Retatrutide"),
    spare("pv-inv-reta-s3", "pv-reta", "Retatrutide"),
  ]
  const read: StockRead = {
    ok: true,
    items,
    compounds: [
      { protocolCompoundId: "pv-test-e", dosesReady: 17, openCount: 1, sparesHeld: 1 },
      { protocolCompoundId: "pv-ipa", dosesReady: 3, openCount: 1, sparesHeld: 0 },
      { protocolCompoundId: "pv-reta", dosesReady: 11, openCount: 2, sparesHeld: 3 },
    ],
  }

  return { stack, stock, logs, stacks, read }
}

export function ProtocolPreview({
  page,
  demo = 0,
  compoundId,
}: {
  page?: "stacks" | "cycles" | "ended" | "schedule" | "half-life" | "half-life-compound"
  demo?: number
  compoundId?: string
}) {
  const mounted = useMounted()
  const { stack, stock, logs, stacks, read } = useMemo(() => buildMock(demo), [demo])

  // Seed the throwaway preview store (no setState here → no cascading render).
  useEffect(() => {
    saveStack(USER, stack)
    saveDoseLogs(USER, logs)
    saveStacks(USER, stacks)
    notifyStacksChanged()
    notifyStackChanged()
    // `saveDoseLogs` is intentionally silent (doseLog.ts): the mutators notify.
    // Writing the store directly means this owes the signal itself. Without it
    // the seeded logs only appeared because `notifyStackChanged` happened to
    // wake a subscriber in the same component.
    notifyDoseLogsChanged()
  }, [stack, logs, stacks])

  if (!mounted) return null
  return (
    <div className="flow-canvas-fixed flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom)+4.5rem)]">
      <header
        className="flex items-center justify-between border-b border-border/60 px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingBottom: "0.75rem",
        }}
      >
        <Image src="/trackd-wordmark.png" alt="Trakabl" width={1044} height={200} className="h-4 w-auto" />
        <span className="rounded-lg bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Preview · Protocol
        </span>
      </header>

      <main className="flex-1">
        {page === "stacks" ? (
          <StacksScreen userId={USER} backHref="/preview/protocol" />
        ) : page === "cycles" ? (
          <CyclesScreen userId={USER} backHref="/preview/protocol" endedHref="/preview/protocol/ended" />
        ) : page === "half-life" ? (
          <HalfLifeScreen userId={USER} backHref="/preview/protocol" hrefBase="/preview/protocol/half-life" />
        ) : page === "half-life-compound" ? (
          <HalfLifeCompoundScreen userId={USER} compoundId={compoundId ?? ""} backHref="/preview/protocol/half-life" />
        ) : page === "ended" ? (
          <EndedCyclesScreen userId={USER} backHref="/preview/protocol/cycles" />
        ) : page === "schedule" ? (
          <ScheduleScreen userId={USER} backHref="/preview/protocol" />
        ) : (
          <ProtocolScreen userId={USER} previewStock={stock} previewRead={read} footBase="/preview/protocol" />
        )}
      </main>

      <ScrollSettle />
      <Toast />
      <BottomNav />
      <QuickActionsFab userId={USER} unit="kg" bodySex="male" />
    </div>
  )
}
