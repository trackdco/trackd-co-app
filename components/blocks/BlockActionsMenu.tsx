"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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
 *
 * ## Why this is PORTALLED rather than absolutely positioned
 *
 * It used to be `absolute … z-30` inside the page's `.animate-home-up` wrapper.
 * That class sets a `transform`, and a transformed element creates its own
 * STACKING CONTEXT — so the menu's `z-30` only ever competed with its siblings
 * inside that wrapper, never with the sections below it. On a LIVE block (the
 * only case with two items) the second item fell past the wrapper and the next
 * `.animate-home-up` section painted straight over it.
 *
 * Measured at 360, 390 and 430: "End or extend" hit-tested to itself, "Delete
 * block" hit-tested to the section beneath it, and was not merely unclickable
 * but visually clipped. A real tap dismissed the menu instead of deleting;
 * forcing the click did the same. So the one irreversible action in Blocks was
 * unreachable in exactly the case it was built for — a mistyped block that is
 * still running. The finished-block menu was fine, which is why it survived
 * the author's own check.
 *
 * `BlockDeleteConfirm` already documents this hazard and portals for it; this
 * menu never got the same treatment. Position comes from the trigger's own rect
 * and is recomputed on scroll and resize, so a fixed-position menu still tracks
 * the button it belongs to.
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
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  /** Pin the menu under the trigger, right edges aligned. */
  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }, [])

  useEffect(() => {
    if (!open) return

    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      // The menu is no longer a descendant of the trigger's wrapper, so the
      // outside-click test has to know about both.
      if (triggerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    // Capture, so a scroll in any container reaches this and not just the page.
    const reposition = () => place()

    document.addEventListener("pointerdown", onDown)
    window.addEventListener("keydown", onKey)
    window.addEventListener("scroll", reposition, true)
    window.addEventListener("resize", reposition)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
    }
  }, [open, place])

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    // Measured before the menu exists, so it never paints in the wrong place.
    place()
    setOpen(true)
  }

  const menu =
    open && pos ? (
      <div
        ref={menuRef}
        role="menu"
        style={{ top: pos.top, right: pos.right }}
        className="animate-in fade-in-0 zoom-in-95 fixed z-[60] w-48 overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-lg duration-150 motion-reduce:animate-none"
      >
        {onEndOrExtend && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onEndOrExtend()
            }}
            className="flex min-h-11 w-full items-center px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:outline-none"
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
    ) : null

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Block actions"
        className="flex h-11 w-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <DotsThree className="h-5 w-5" aria-hidden />
      </button>

      {/* Escapes every ancestor stacking context, which is the whole point. */}
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
