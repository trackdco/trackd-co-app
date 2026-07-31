"use client"

import { useEffect, useRef, useState } from "react"
import { DotsThree } from "@/components/icons"
import { DANGER_ROW } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/**
 * The live block's actions, on the block's own page (Adrian, 2026-07-30).
 *
 * They used to be a second button on the card in the list — so getting to a
 * retrospective meant choosing between "Look back" and "End or extend" before
 * you had seen anything. The card is now simply a link, and ending or extending
 * lives here, beside the block it acts on, one tap from the thing it changes.
 *
 * A finished block has nothing to END, so `onEndOrExtend` is omitted for one and
 * the menu shows Delete alone — it still has to be reachable, because a block
 * mistyped and closed is exactly the one a user wants rid of (Adrian,
 * 2026-07-31).
 *
 * Deliberately not a Radix menu: two items, no submenus, no typeahead — a
 * popover and an outside-click is the whole requirement.
 */
export function BlockActionsMenu({
  onEndOrExtend,
  onDelete,
}: {
  /** Omitted for a finished block: there is nothing left to end or extend. */
  onEndOrExtend?: () => void
  onDelete: () => void
}) {
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
          {onEndOrExtend && (
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
          )}
          {/* DANGER_ROW itself, not a hand-rolled copy of it. The copy had
              drifted in every way that matters: it hovered to the same
              --bg-surface-raised as the non-destructive row above it, so the
              one irreversible action in this menu gave identical press feedback
              to the reversible one, and it carried no focus ring at all. */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
            className={cn(DANGER_ROW, "min-h-11")}
          >
            Delete block
          </button>
        </div>
      )}
    </div>
  )
}
