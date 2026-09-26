"use client"

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { Container } from "@/components/containers"
import { ConfirmDialog } from "@/components/feel/ConfirmDialog"
import { ListBlocks } from "@/components/feel/RouteSkeletons"
import { SkeletonGroup } from "@/components/feel/Skeleton"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { Presence } from "@/components/protocol/pages/Presence"
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
import { shortDate } from "@/lib/protocol/cyclePage"
import { addLeaving, dropLeaving, restartOutcome, withLeaving, type Leaving } from "@/lib/protocol/cycleExits"
import { endedCycles, type EndedCycle } from "@/lib/protocol/endedCycles"
import { showToast } from "@/lib/toast"
import { PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const EMPTY_STACK: StackCompound[] = []

/** A leaving row folds shut (the Fold's 280ms), then goes. */
const LEAVE_MS = 320

const endedKey = (e: EndedCycle) => e.key

/**
 * Cycles → Ended (build-brief-final §3.10): the cycles you ended, and the ones
 * that ran their course. A row: the name, the pattern, the day it ended. A tap
 * opens Restart and Delete. Restart puts the cycle back from today, with Undo.
 * Delete asks, then removes it for good from this list; the dose logs stay.
 *
 * THE WRITE COMES FIRST (cold review B34). The row's leave used to play
 * before `restartCycle`, with a fill that held it at nothing: a failed write
 * left the row invisible for good, and a reload inside the 260ms lost the tap.
 * Now Restart and Delete write, then the row leaves: kept on screen from where
 * it was (`withLeaving`) while it slides out and folds shut. A write that
 * fails never starts a leave, so the row stays as it was and the toast says
 * why. An Undo inside the leave opens it again from wherever it is.
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
  const [leaving, setLeaving] = useState<Leaving<EndedCycle>[]>([])
  /** How each leaving row goes: Restart slides it out to the left as well. */
  const [slides, setSlides] = useState<ReadonlySet<string>>(() => new Set())
  const drawn = useMemo(() => withLeaving(rows, leaving, endedKey), [rows, leaving])

  /** Keep a row on screen, from where it was, while it leaves. */
  const leave = (e: EndedCycle, slide: boolean) => {
    const at = Math.max(0, rows.findIndex((r) => r.key === e.key))
    setOpenKey(null)
    setLeaving((l) => addLeaving(l, { item: e, at }, endedKey))
    setSlides((s) => {
      const next = new Set(s)
      if (slide) next.add(e.key)
      else next.delete(e.key)
      return next
    })
    window.setTimeout(() => {
      setLeaving((l) => dropLeaving(l, e.key, endedKey))
      setSlides((s) => {
        if (!s.has(e.key)) return s
        const next = new Set(s)
        next.delete(e.key)
        return next
      })
    }, LEAVE_MS)
  }

  const restart = (e: EndedCycle) => {
    // Write first; leave only when it took (B34).
    const out = restartOutcome(restartCycle(userId, e, todayKey), e.compoundName)
    if (!out.leave) {
      showToast(out.toast)
      return
    }
    leave(e, true)
    showToast(out.toast, { undo: () => void endCycle(userId, e.compoundId, todayKey) })
  }

  const remove = (e: EndedCycle) => {
    // The row goes either way; storage only remembers it past this session.
    hideEndedCycle(userId, e.key)
    leave(e, false)
    showToast("Cycle deleted", { undo: () => void unhideEndedCycle(userId, e.key) })
  }

  return (
    <SubpageShell screen="protocol-cycles-ended" title="Ended" backHref={backHref} backLabel="Cycles">
      {!known ? (
        <SkeletonGroup label="Loading ended cycles" className="space-y-4">
          <ListBlocks cards={1} />
        </SkeletonGroup>
      ) : (
        <section className="animate-home-up inst-card px-4 py-0.5">
          {drawn.length === 0 ? (
            <p className="py-4 text-center text-[13.5px] text-text-muted">Nothing ended</p>
          ) : (
            drawn.map(({ item: e, leaving: gone }, i) => (
              <Presence key={e.key} show={!gone}>
                <EndedRow
                  e={e}
                  c={byId.get(e.compoundId)}
                  first={i === 0}
                  open={openKey === e.key}
                  slide={gone && slides.has(e.key)}
                  onToggle={() => setOpenKey(openKey === e.key ? null : e.key)}
                  onRestart={() => guard(() => restart(e))}
                  onDelete={() => setDeleting(e)}
                />
              </Presence>
            ))
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

/**
 * An ended cycle: name, pattern, the day it ended; opens onto Restart and
 * Delete. Its container is in the compound's own look, as the Cycles rows are
 * (D14; `r6/cycles8.js` `endRow8` draws `holder(y.c)`).
 *
 * `slide`: leaving after a Restart, it slides 18px left as it fades (260ms,
 * the brief's leave) while its Presence folds it shut. Interruptible: an Undo
 * inside the leave cancels the slide and the row is simply back. Reduced
 * motion: no slide; the fold snaps.
 */
function EndedRow({
  e,
  c,
  first,
  open,
  slide,
  onToggle,
  onRestart,
  onDelete,
}: {
  e: EndedCycle
  c: StackCompound | undefined
  first: boolean
  open: boolean
  slide: boolean
  onToggle: () => void
  onRestart: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !slide) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const anim = el.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateX(-18px)" },
      ],
      { duration: 260, easing: "ease-in", fill: "forwards" },
    )
    return () => anim.cancel()
  }, [slide])
  return (
    <div ref={ref} data-ended={e.key} className={cn(!first && "hairline-t border-border-default")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(PRESS.row, "flex w-full items-center gap-2.5 py-3 text-left")}
      >
        {c ? (
          <Container
            name={c.name}
            inventoryType={inventoryTypeForCompound(c.name, c.method, c.inventoryForm)}
            category={c.category}
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
            { label: "Restart", icon: "restart", onClick: onRestart },
            { label: "Delete", icon: "discard", destructive: true, onClick: onDelete },
          ]}
        />
      </Fold>
    </div>
  )
}
