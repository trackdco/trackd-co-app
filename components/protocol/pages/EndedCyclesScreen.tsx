"use client"

import { useMemo, useState, useSyncExternalStore } from "react"

import { Container } from "@/components/containers"
import { ConfirmDialog } from "@/components/feel/ConfirmDialog"
import { ListBlocks } from "@/components/feel/RouteSkeletons"
import { SkeletonGroup } from "@/components/feel/Skeleton"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { Fold, SquareActions, SubpageShell } from "@/components/protocol/pages/Subpage"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import {
  EMPTY_HIDDEN,
  endCycle,
  hiddenEndedCycles,
  hideEndedCycle,
  restartCycle,
  subscribeHiddenEndedCycles,
  unhideEndedCycle,
} from "@/lib/home/endedCycleActions"
import { getHydrationState, subscribeHydrationState, type HydrationState } from "@/lib/home/hydrationState"
import { toDateKey } from "@/lib/home/mockHomeData"
import { getStackSnapshot, subscribeStack, type StackCompound } from "@/lib/home/stack"
import { cycleColourVar } from "@/lib/protocol/cycleRule"
import { shortDate } from "@/lib/protocol/cyclePage"
import { endedCycles, type EndedCycle } from "@/lib/protocol/endedCycles"
import { showToast } from "@/lib/toast"
import { PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const EMPTY_STACK: StackCompound[] = []

/** Play a row's leaving motion, then act. Reduced motion: act at once. */
function leave(key: string, frames: Keyframe[], duration: number, then: () => void) {
  const el = document.querySelector<HTMLElement>(`[data-ended="${CSS.escape(key)}"]`)
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  if (!el || reduce) {
    then()
    return
  }
  el.animate(frames, { duration, easing: "ease-in", fill: "forwards" }).finished.then(then, then)
}

/**
 * Cycles → Ended (build-brief-final §3.10): the cycles you ended, and the ones
 * that ran their course. A row: the name, the pattern, the day it ended. A tap
 * opens Restart and Delete. Restart puts the cycle back from today, with Undo.
 * Delete asks, then removes it for good from this list; the dose logs stay.
 */
export function EndedCyclesScreen({
  userId,
  backHref = "/protocol/cycles",
  previewCompounds,
}: {
  userId: string
  backHref?: string
  previewCompounds?: StackCompound[]
}) {
  useCloudHydration(userId)
  const { guard } = useWriteAccess()
  const live = useSyncExternalStore(subscribeStack, () => getStackSnapshot(userId, EMPTY_STACK), () => EMPTY_STACK)
  const hidden = useSyncExternalStore(subscribeHiddenEndedCycles, () => hiddenEndedCycles(userId), () => EMPTY_HIDDEN)
  const hydration = useSyncExternalStore<HydrationState>(
    subscribeHydrationState,
    () => getHydrationState(userId),
    () => "pending",
  )
  const compounds = previewCompounds ?? live
  const known = previewCompounds !== undefined || compounds.length > 0 || hydration !== "pending"
  const todayKey = toDateKey(new Date())
  const byId = useMemo(() => new Map(compounds.map((c) => [c.id, c])), [compounds])
  const rows = useMemo(() => endedCycles(compounds, todayKey, hidden), [compounds, todayKey, hidden])

  const [openKey, setOpenKey] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<EndedCycle | null>(null)

  const restart = (e: EndedCycle) =>
    leave(
      e.key,
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateX(-18px)" },
      ],
      260,
      () => {
        const r = restartCycle(userId, e, todayKey)
        setOpenKey(null)
        if (!r.ok) {
          showToast("Couldn’t restart it. Try again.")
          return
        }
        showToast(`Restarted. ${e.compoundName} is back on its cycle.`, {
          undo: () => void endCycle(userId, e.compoundId, todayKey),
        })
      },
    )

  const remove = (e: EndedCycle) => {
    const el = document.querySelector<HTMLElement>(`[data-ended="${CSS.escape(e.key)}"]`)
    const h = el?.offsetHeight ?? 0
    leave(
      e.key,
      [
        { opacity: 1, height: `${h}px` },
        { opacity: 0, height: "0px" },
      ],
      300,
      () => {
        hideEndedCycle(userId, e.key)
        setOpenKey(null)
        showToast("Cycle deleted", { undo: () => void unhideEndedCycle(userId, e.key) })
      },
    )
  }

  return (
    <SubpageShell screen="protocol-cycles-ended" title="Ended" backHref={backHref} backLabel="Cycles">
      {!known ? (
        <SkeletonGroup label="Loading ended cycles" className="space-y-4">
          <ListBlocks cards={1} />
        </SkeletonGroup>
      ) : (
        <section className="animate-home-up inst-card px-4 py-0.5">
          {rows.length === 0 ? (
            <p className="py-4 text-center text-[13.5px] text-text-muted">Nothing ended</p>
          ) : (
            rows.map((e, i) => {
              const c = byId.get(e.compoundId)
              const open = openKey === e.key
              return (
                <div
                  key={e.key}
                  data-ended={e.key}
                  className={cn("overflow-hidden", i > 0 && "hairline-t border-border-default")}
                >
                  <button
                    type="button"
                    onClick={() => setOpenKey(open ? null : e.key)}
                    aria-expanded={open}
                    className={cn(PRESS.row, "flex w-full items-center gap-2.5 py-3 text-left")}
                  >
                    {c ? (
                      <Container
                        name={c.name}
                        inventoryType={inventoryTypeForCompound(c.name, c.method, c.inventoryForm)}
                        category={c.category}
                        stackColour={cycleColourVar(e.rule.colour)}
                        fill={0.6}
                        size={22}
                      />
                    ) : null}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13.5px] text-foreground">{e.compoundName}</span>
                      <span className="text-[11.5px] text-text-muted">{e.pattern}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] text-text-muted">{shortDate(e.endedOn)}</span>
                  </button>
                  <Fold open={open} className="pb-3">
                    <SquareActions
                      actions={[
                        { label: "Restart", icon: "restart", onClick: () => guard(() => restart(e)) },
                        { label: "Delete", icon: "discard", destructive: true, onClick: () => setDeleting(e) },
                      ]}
                    />
                  </Fold>
                </div>
              )
            })
          )}
        </section>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this cycle for good?"
        line="You can’t restart it. Your dose logs stay."
        confirmLabel="Delete cycle"
        onConfirm={() => {
          if (deleting) remove(deleting)
        }}
      />
    </SubpageShell>
  )
}
