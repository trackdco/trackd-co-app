"use client"

import { useEffect, useState } from "react"

import { PageScrollTitle } from "@/components/layout/PageScrollTitle"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { PlanView } from "@/components/protocol/PlanView"
import { CyclesView } from "@/components/protocol/CyclesView"
import { StacksView } from "@/components/protocol/StacksView"
import { StockView } from "@/components/protocol/StockView"
import { getActiveCycle } from "@/lib/db/cycles"
import type { StockItem } from "@/lib/db/inventory"
import type { Cycle } from "@/lib/db/types"
import type { StackCompound } from "@/lib/home/stack"
import type { Stack } from "@/lib/home/stacks"

/**
 * The Protocol tab (Protocol Cutover, Step 4): ONE screen with an in-page Plan /
 * Stock toggle — consolidating Angus's "Cycles" + "My Protocol" into a single tab
 * (Adrian-approved change from Spec 11), NOT a second bottom-nav tab. Plan is the
 * cycle builder; Stock is a placeholder until Step 5. Mirrors the Home composition
 * (scroll title + staggered cards). Mounts the cutover hydration so the stack is
 * sourced from Postgres here too.
 */
export function ProtocolScreen({
  userId,
  initialCycle,
  previewStock,
  previewCompounds,
  previewStacks,
  initialTab = "plan",
}: {
  userId: string
  initialCycle: Cycle | null
  /** Dev-only: mock stock for the `/preview/protocol` harness. */
  previewStock?: StockItem[]
  /** Dev-only: mock compounds + stacks so the Cycles / Stacks tabs render. */
  previewCompounds?: StackCompound[]
  previewStacks?: Stack[]
  /** Which tab to open on. Plan by default; `?tab=stock` lands on Stock, so the
   *  Home draw slot's "add stock" tap (Spec 21) arrives at the add-flow rather than
   *  at Plan. The tab stays local state after mount — this only seeds it. */
  initialTab?: "plan" | "cycles" | "stacks" | "stock"
}) {
  useCloudHydration(userId)
  const [cycle, setCycle] = useState<Cycle | null>(initialCycle)
  const [tab, setTab] = useState<string>(initialTab)

  // The cutover migration (in useCloudHydration) may create the active cycle just
  // after this server-rendered with none. Refresh shortly after mount and on focus
  // so the header reflects it without a reload. setState runs after the await.
  useEffect(() => {
    if (!userId || userId === "anon") return
    let cancelled = false
    const refresh = async () => {
      const c = await getActiveCycle()
      if (!cancelled && c) setCycle(c)
    }
    const t = window.setTimeout(() => void refresh(), 1500)
    const onFocus = () => void refresh()
    window.addEventListener("focus", onFocus)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      window.removeEventListener("focus", onFocus)
    }
  }, [userId])

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
        <PageScrollTitle title="Protocol" />
      </div>

      <div className="animate-home-up" style={{ animationDelay: "55ms" }}>
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="cycles">Cycles</TabsTrigger>
            <TabsTrigger value="stacks">Stacks</TabsTrigger>
            <TabsTrigger value="stock">Stock</TabsTrigger>
          </TabsList>

          <TabsContent value="plan" className="mt-5">
            <PlanView userId={userId} cycle={cycle} onCycleSaved={setCycle} />
          </TabsContent>

          {/* Spec 06 · part two. `04-protocol.md` restructures this page into one
              merged view; until then Cycles is its own tab beside Plan and Stock. */}
          <TabsContent value="cycles" className="mt-5">
            <CyclesView userId={userId} previewStack={previewCompounds} />
          </TabsContent>

          {/* Spec 05 · part two. Creation and editing only — logging a stack
              happens on the dashboard, never here. */}
          <TabsContent value="stacks" className="mt-5">
            <StacksView
              userId={userId}
              previewCompounds={previewCompounds}
              previewStacks={previewStacks}
            />
          </TabsContent>

          <TabsContent value="stock" className="mt-5">
            <StockView userId={userId} previewItems={previewStock} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
