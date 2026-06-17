"use client"

import { useEffect, useState } from "react"

import { PageScrollTitle } from "@/components/layout/PageScrollTitle"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { PlanView } from "@/components/protocol/PlanView"
import { StockView } from "@/components/protocol/StockView"
import { getActiveCycle } from "@/lib/db/cycles"
import type { StockItem } from "@/lib/db/inventory"
import type { Cycle } from "@/lib/db/types"

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
}: {
  userId: string
  initialCycle: Cycle | null
  /** Dev-only: mock stock for the `/preview/protocol` harness. */
  previewStock?: StockItem[]
}) {
  useCloudHydration(userId)
  const [cycle, setCycle] = useState<Cycle | null>(initialCycle)
  const [tab, setTab] = useState("plan")

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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="stock">Stock</TabsTrigger>
          </TabsList>

          <TabsContent value="plan" className="mt-5">
            <PlanView userId={userId} cycle={cycle} onCycleSaved={setCycle} />
          </TabsContent>

          <TabsContent value="stock" className="mt-5">
            <StockView userId={userId} previewItems={previewStock} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
