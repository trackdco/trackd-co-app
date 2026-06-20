"use client"

import { useEffect, useMemo } from "react"
import Image from "next/image"

import { BottomNav } from "@/components/navigation/bottom-nav"
import { useMounted } from "@/components/home/useMounted"
import { ProtocolScreen } from "@/components/protocol/ProtocolScreen"
import { saveStack, notifyStackChanged, type StackCompound } from "@/lib/home/stack"
import { toDateKey } from "@/lib/home/mockHomeData"
import type { StockItem } from "@/lib/db/inventory"
import type { Cycle } from "@/lib/db/types"

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

function buildMock(): { cycle: Cycle; stack: StackCompound[]; stock: StockItem[] } {
  const start = dayOffset(-14) // ~2 weeks in → "Week 3 of 12"
  const end = dayOffset(70)
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
  const cycle: Cycle = {
    id: "pv-cycle",
    user_id: USER,
    name: "Summer Cut 2026",
    started_on: start,
    ended_on: end,
    is_active: true,
    notes: "12-week cut into the June classic — lean out while holding strength on the big lifts.",
    created_at: start,
    updated_at: start,
  }
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
      strengthPerUnitMg: null,
      remainingDisplay: 8.5,
      dosesRemaining: 17,
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
      strengthPerUnitMg: null,
      remainingDisplay: 0.6,
      dosesRemaining: 3,
      estEmptyDate: dayOffset(8),
      mlPerDose: 0.1,
      unitsPerDoseOral: null,
      concentrationPerMl: 2.5,
      remainingBase: 1.5,
      totalBase: 5, // ~30% — shows a low bar
    },
  ]
  return { cycle, stack, stock }
}

export function ProtocolPreview() {
  const mounted = useMounted()
  const { cycle, stack, stock } = useMemo(() => buildMock(), [])

  // Seed the throwaway preview store (no setState here → no cascading render).
  useEffect(() => {
    saveStack(USER, stack)
    notifyStackChanged()
  }, [stack])

  if (!mounted) return null
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
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
        <ProtocolScreen userId={USER} initialCycle={cycle} previewStock={stock} />
      </main>

      <BottomNav userId={USER} unit="kg" />
    </div>
  )
}
