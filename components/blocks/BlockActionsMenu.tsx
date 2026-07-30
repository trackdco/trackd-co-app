"use client"

import { useEffect, useRef, useState } from "react"
import { DotsThree } from "@/components/icons"

/**
 * The live block's actions, on the block's own page (Adrian, 2026-07-30).
 *
 * They used to be a second button on the card in the list — so getting to a
 * retrospective meant choosing between "Look back" and "End or extend" before
 * you had seen anything. The card is now simply a link, and ending or extending
 * lives here, beside the block it acts on, one tap from the thing it changes.
 *
 * A finished block has nothing to end, so the caller renders this only while one
 * is running. Deliberately not a Radix menu: two items, no submenus, no typeahead
 * — a popover and an outside-click is the whole requirement.
 */
export function BlockActionsMenu({ onEndOrExtend }: { onEndOrExtend: () => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Block actions"
        className="flex h-11 w-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <DotsThree className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-in fade-in-0 zoom-in-95 absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-lg duration-150 motion-reduce:animate-none"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onEndOrExtend()
            }}
            className="flex min-h-11 w-full items-center px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-bg-surface-raised"
          >
            End or extend
          </button>
        </div>
      )}
    </div>
  )
}
