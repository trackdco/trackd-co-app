"use client"

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react"

import { AnimatedContainer } from "@/components/containers"
import { PopDialog } from "@/components/feel/PopDialog"
import { listStock } from "@/lib/db/inventory"
import { resolveProtocolCompoundIds } from "@/lib/home/protocolSync"
import { getStackSnapshot, subscribeStack, type StackCompound } from "@/lib/home/stack"
import { toDateKey } from "@/lib/home/mockHomeData"
import { compoundStockViews } from "@/lib/protocol/stockPage"
import { stockPickRows, type HeldStock } from "@/lib/shortcuts/stockPick"
import { GHOST_BUTTON, PRESS, PRIMARY_BUTTON, ROWS, SHEET_RISE } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const EMPTY: StackCompound[] = []
/** The container's drawn height in a row: a little under the row's name block. */
const CONTAINER_SIZE = 36

/**
 * THE +'S "WHICH COMPOUND?" (W43). A pop-up of the compounds Protocol shows,
 * each with its container, in Protocol's order; choosing one opens that
 * compound's Add stock. With nothing on the protocol it says so and offers
 * Add compound instead, so the pop-up always holds a working control.
 *
 * The containers are drawn at once from the device's stack, then settle to
 * the level of the one in use when the stock read lands (the same read
 * Protocol makes). A failed read leaves them drawn as Protocol draws a
 * compound with no figure, and claims nothing about what is on hand.
 */
export function StockCompoundPicker({
  open,
  onClose,
  userId,
  onPick,
  onAddCompound,
}: {
  open: boolean
  onClose: () => void
  userId: string
  /** The CLIENT stack id of the compound chosen. */
  onPick: (compoundId: string) => void
  onAddCompound: () => void
}) {
  const compounds = useSyncExternalStore(
    subscribeStack,
    () => (userId === "anon" ? EMPTY : getStackSnapshot(userId, EMPTY)),
    () => EMPTY,
  )
  // Each open reads afresh, on the day it is then.
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()))
  const [held, setHeld] = useState<ReadonlyMap<string, HeldStock> | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setTodayKey(toDateKey(new Date()))
      setHeld(null)
    }
  }

  const rows = useMemo(() => stockPickRows(compounds, todayKey, held), [compounds, todayKey, held])
  const membersKey = rows.map((r) => `${r.id}\u0000${r.name}`).join("\u0001")

  useEffect(() => {
    if (!open || membersKey === "") return
    let cancelled = false
    const members = membersKey.split("\u0001").map((m) => {
      const [id, name] = m.split("\u0000")
      return { id, name }
    })
    void (async () => {
      try {
        const [read, idMap] = await Promise.all([listStock(), resolveProtocolCompoundIds(members)])
        if (cancelled || !read.ok) return
        const pcToClient = new Map(Object.entries(idMap).map(([clientId, pcId]) => [pcId, clientId]))
        setHeld(compoundStockViews(read, pcToClient))
      } catch {
        // Offline or refused: the containers stay as drawn, claiming nothing.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, membersKey])

  return (
    <PopDialog open={open} onClose={onClose} title="Which compound?">
      {rows.length === 0 ? (
        <>
          <p className="mt-2 text-[13.5px] leading-snug text-text-muted">Nothing on your protocol yet.</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={onClose} className={cn(GHOST_BUTTON, "flex-1 py-2.5")}>
              Cancel
            </button>
            <button type="button" onClick={onAddCompound} className={cn(PRIMARY_BUTTON, "flex-1 py-2.5")}>
              Add compound
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={cn(ROWS, "mt-4 max-h-[min(56dvh,26rem)] overflow-y-auto overscroll-contain")}>
            {rows.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onPick(r.id)}
                className={cn(
                  PRESS.row,
                  SHEET_RISE,
                  "flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                )}
                style={{ "--rise-i": i } as CSSProperties}
              >
                <span aria-hidden className="flex h-10 w-7 shrink-0 items-end justify-center">
                  <AnimatedContainer
                    name={r.name}
                    inventoryType={r.inventoryType}
                    category={r.category}
                    fill={r.fill}
                    size={CONTAINER_SIZE}
                  />
                </span>
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block text-[14px] text-foreground [overflow-wrap:anywhere]">{r.name}</span>
                  {r.onHand === false ? (
                    <span className="mt-0.5 block text-[12px] text-text-muted">None on hand</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className={cn(GHOST_BUTTON, "mt-4 w-full py-2.5")}>
            Cancel
          </button>
        </>
      )}
    </PopDialog>
  )
}
