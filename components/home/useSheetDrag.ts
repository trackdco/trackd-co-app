"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

// Release the grab handle past this fraction of the sheet's height → dismiss.
const DISMISS_THRESHOLD = 0.3

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

/**
 * Drag-to-dismiss for a bottom sheet — the shared version of the gesture that
 * `LogDoseSheet` / `ShortcutsMenu` / `AddWeightSheet` each hand-rolled. Put
 * `cardRef` + `cardStyle` on the sheet's card root and spread `handleProps` on
 * the grab-handle element; pulling the handle down past ~30% of the card height
 * calls `onClose`, otherwise it springs back. Pointer-based, no dependency.
 *
 * The handle element should carry `touch-none` so the browser doesn't claim the
 * vertical drag for scrolling.
 *
 * Pass `open` for sheets whose body PERSISTS across open/close (the offset state
 * would otherwise carry a drag-dismiss over to the next open): it resets the card
 * to rest each time the sheet opens. The dismiss path deliberately does NOT snap
 * back to 0 — it lets the exit animation continue from the dragged position.
 */
export function useSheetDrag(onClose: () => void, open?: boolean) {
  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; height: number } | null>(null)
  const [offsetY, setOffsetY] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Back to rest whenever the sheet (re)opens.
  useIsoLayoutEffect(() => {
    if (open) setOffsetY(0)
  }, [open])

  function onPointerDown(e: React.PointerEvent) {
    const height = cardRef.current?.getBoundingClientRect().height ?? 0
    dragRef.current = { startY: e.clientY, height }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    setOffsetY(Math.max(0, Math.min(e.clientY - drag.startY, drag.height)))
  }

  function onPointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (drag && offsetY > drag.height * DISMISS_THRESHOLD) {
      // No snap-back — let the sheet's exit animation continue from the dragged
      // position; `open` resets the offset on the next open.
      onClose()
    } else {
      setOffsetY(0)
    }
  }

  return {
    cardRef,
    /** Spread on the grab-handle element. */
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    /** Spread into the card root's `style`. */
    cardStyle: {
      transform: `translateY(${offsetY}px)`,
      transition: dragging ? "none" : "transform 250ms ease-out",
    } as const,
  }
}
