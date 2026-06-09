"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Pencil, X } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { ShortcutItem } from "@/components/shortcuts/ShortcutItem"
import { PlaceholderActionSheet } from "@/components/shortcuts/PlaceholderActionSheet"
import {
  SHORTCUT_ITEMS,
  type ShortcutItem as ShortcutItemConfig,
} from "@/components/shortcuts/shortcutItems"
import { loadShortcutOrder, saveShortcutOrder } from "@/lib/shortcutOrder"

interface ShortcutsMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Forwarded to the Add-to-Stack flow (scopes the user's custom compounds). */
  userId: string
}

// Release the handle past this fraction of the sheet's height → dismiss. Matches
// the Add-to-Stack sheet so the two feel identical. (The shadcn Sheet supplies the
// container, slide-up and backdrop/Esc dismiss; this only adds the drag handle —
// deliberately not extracted into a shared piece so the protected Add-to-Stack
// flow stays untouched.)
const DISMISS_THRESHOLD = 0.3

// Reorder gesture tuning.
const GAP_PX = 12 // matches the card list's gap-3
const MOVE_LIFT_PX = 6 // movement past this counts as a real drag (vs a confirming tap)
const SNAP_MS = 180 // settle animation when a dragged card is dropped
const STAGGER_MS = 45 // per-item delay for the open entrance (top to bottom)

const ITEM_BY_ID = new Map(SHORTCUT_ITEMS.map((item) => [item.id, item]))
// Top tier — fixed-order circle quick-actions (not reorderable yet).
const CIRCLE_ITEMS = SHORTCUT_ITEMS.filter((item) => item.variant === "circle")
// Bottom tier — full-width cards. All reorderable in edit mode; `pinnedBottom`
// cards (e.g. "Add a compound") just default to the bottom of the stack.
const CARD_ITEMS = SHORTCUT_ITEMS.filter((item) => item.variant === "card")
const DEFAULT_CARD_ORDER = [
  ...CARD_ITEMS.filter((item) => !item.pinnedBottom),
  ...CARD_ITEMS.filter((item) => item.pinnedBottom),
].map((item) => item.id)

/**
 * Build the effective card order from a saved id array: drop unknown ids, then slot
 * any default card missing from the saved order back at its default position (so a
 * newly-added card appears where it was declared, not jammed at the end).
 */
function reconcileOrder(saved: string[] | null): string[] {
  if (!saved || saved.length === 0) return DEFAULT_CARD_ORDER
  const known = new Set(DEFAULT_CARD_ORDER)
  const result = saved.filter((id) => known.has(id))
  const present = new Set(result)
  DEFAULT_CARD_ORDER.forEach((id, defaultIndex) => {
    if (!present.has(id)) result.splice(Math.min(defaultIndex, result.length), 0, id)
  })
  return result
}

// useLayoutEffect on the client (before paint, no flash), useEffect on the server.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

/**
 * The "Shortcuts" menu the bottom-nav plus now opens. Two tiers: a fixed top row of
 * circle quick-actions, and below it a stack of full-width action cards. Only "Add a
 * compound" is wired to real functionality — it presents the existing (unchanged)
 * Add-to-Stack flow; every other item opens the shared `PlaceholderActionSheet`.
 *
 * The three-line button in the header top-right enters edit mode: every card shows a
 * grip and can be dragged up/down (the top circles stay fixed). Dropping keeps you in
 * edit mode; tapping any shortcut, "Done", or dismissing commits the order, which
 * persists per-device and restores on open. Outside edit mode, tapping a card plays a
 * soft "light-up" ripple and opens it.
 */
export function ShortcutsMenu({ open, onOpenChange, userId }: ShortcutsMenuProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const handleDragRef = useRef<{ startY: number; height: number } | null>(null)
  const offsetRef = useRef(0)
  const [offsetY, setOffsetY] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Which child flow is open. Opening either closes this menu first, so only one
  // bottom sheet is ever on screen at a time.
  const [addOpen, setAddOpen] = useState(false)
  const [placeholder, setPlaceholder] = useState<ShortcutItemConfig | null>(null)

  // Card order + reorder gesture state.
  const [order, setOrder] = useState<string[]>(DEFAULT_CARD_ORDER)
  const [reordering, setReordering] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null) // card the pointer holds
  const [liftedId, setLiftedId] = useState<string | null>(null) // card actually being dragged
  const [dragDy, setDragDy] = useState(0)
  const [snapping, setSnapping] = useState(false)

  const orderRef = useRef<string[]>(DEFAULT_CARD_ORDER)
  useEffect(() => {
    orderRef.current = order
  }, [order])

  const rowDragRef = useRef<{ id: string; startY: number; rowH: number } | null>(null)
  const movedRef = useRef(false)
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearSnap() {
    if (snapTimerRef.current) {
      clearTimeout(snapTimerRef.current)
      snapTimerRef.current = null
    }
  }
  function resetReorder() {
    clearSnap()
    rowDragRef.current = null
    movedRef.current = false
    setReordering(false)
    setDragId(null)
    setLiftedId(null)
    setDragDy(0)
    setSnapping(false)
  }

  // Every open starts at rest, in browse mode, with this user's saved order applied.
  // Runs before paint → no flash.
  useIsoLayoutEffect(() => {
    if (!open) return
    offsetRef.current = 0
    setOffsetY(0)
    const next = reconcileOrder(loadShortcutOrder(userId))
    orderRef.current = next
    setOrder(next)
    clearSnap()
    rowDragRef.current = null
    movedRef.current = false
    setReordering(false)
    setDragId(null)
    setLiftedId(null)
    setDragDy(0)
    setSnapping(false)
  }, [open, userId])

  // Drop any pending snap timer if the menu unmounts mid-drag.
  useEffect(() => {
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    }
  }, [])

  function persistOrder() {
    saveShortcutOrder(userId, orderRef.current)
  }

  function handleOpenChange(next: boolean) {
    // Dismissing while editing exits edit mode and commits the order.
    if (!next) {
      if (reordering) persistOrder()
      resetReorder()
    }
    onOpenChange(next)
  }

  function enterReorder() {
    setReordering(true)
  }

  function exitReorder() {
    persistOrder()
    resetReorder()
  }

  function handlePress(item: ShortcutItemConfig) {
    // In edit mode a tap on any shortcut just commits + exits (no navigation).
    if (reordering) {
      exitReorder()
      return
    }
    onOpenChange(false)
    if (item.id === "add-compound") {
      setAddOpen(true)
    } else {
      setPlaceholder(item)
    }
  }

  /* ------------------------------------------------------- card reorder (edit mode) */

  function markMoved(id: string) {
    if (movedRef.current) return
    movedRef.current = true
    setLiftedId(id) // lift (shadow/scale) only once it's a real drag, not a tap
  }

  function onRowPointerDown(e: React.PointerEvent, id: string) {
    if (!reordering) return // normal mode: the card itself handles tap + ripple
    const el = e.currentTarget as HTMLElement
    const rowH = el.getBoundingClientRect().height + GAP_PX
    el.setPointerCapture(e.pointerId)
    clearSnap()
    movedRef.current = false
    rowDragRef.current = { id, startY: e.clientY, rowH }
    setDragId(id)
    setDragDy(0)
  }

  function onRowPointerMove(e: React.PointerEvent) {
    if (rowDragRef.current) updateRowDrag(e.clientY)
  }

  function updateRowDrag(clientY: number) {
    const d = rowDragRef.current
    if (!d) return
    const cur = orderRef.current
    const curIndex = cur.indexOf(d.id)
    if (curIndex === -1) return
    const step = d.rowH || 1
    const target = Math.max(
      0,
      Math.min(curIndex + Math.round((clientY - d.startY) / step), cur.length - 1)
    )
    if (target !== curIndex) {
      const next = [...cur]
      next.splice(curIndex, 1)
      next.splice(target, 0, d.id)
      orderRef.current = next
      setOrder(next)
      // Re-anchor so the lifted card keeps tracking the finger after the reflow.
      d.startY += (target - curIndex) * step
      markMoved(d.id)
    }
    const dy = clientY - d.startY
    if (Math.abs(dy) > MOVE_LIFT_PX) markMoved(d.id)
    setDragDy(dy)
  }

  function onRowPointerUp() {
    const drag = rowDragRef.current
    const moved = movedRef.current
    rowDragRef.current = null
    if (!drag) return

    if (!moved) {
      // A tap in edit mode → commit + exit.
      exitReorder()
      return
    }

    // A real drag → persist on drop, settle the card into its slot, stay editing.
    persistOrder()
    setDragDy(0)
    setSnapping(true)
    clearSnap()
    snapTimerRef.current = setTimeout(() => {
      snapTimerRef.current = null
      setSnapping(false)
      setDragId(null)
      setLiftedId(null)
    }, SNAP_MS)
  }

  /* ----------------------------------------------------------- drag-to-dismiss */

  function handlePointerDown(e: React.PointerEvent) {
    if (reordering) return // don't let the sheet pan fight a card drag.
    const height = cardRef.current?.getBoundingClientRect().height ?? 0
    handleDragRef.current = { startY: e.clientY, height }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = handleDragRef.current
    if (!drag) return
    const next = Math.max(0, Math.min(e.clientY - drag.startY, drag.height))
    offsetRef.current = next
    setOffsetY(next)
  }

  function handlePointerUp() {
    const drag = handleDragRef.current
    handleDragRef.current = null
    setDragging(false)
    if (drag && offsetRef.current > drag.height * DISMISS_THRESHOLD) {
      handleOpenChange(false)
    } else {
      offsetRef.current = 0
      setOffsetY(0)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[90dvh] gap-0 border-t-0 bg-transparent p-0 shadow-none"
        >
          {/* The visible card. Its transform is the drag offset; the sheet's own
              open/close slide lives on the (transparent) parent, so they never fight. */}
          <div
            ref={cardRef}
            style={{
              transform: `translateY(${offsetY}px)`,
              transition: dragging ? "none" : "transform 250ms ease-out",
            }}
            className="flex max-h-[90dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
          >
            {/* Grab handle — drag down to dismiss (≈44px tap target). Inert while
                editing so it can't fight a card drag. */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={cn(
                "flex h-11 shrink-0 items-center justify-center",
                reordering
                  ? "cursor-default"
                  : "cursor-grab touch-none active:cursor-grabbing"
              )}
            >
              <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
            </div>

            {/* Header — title centred; close on the left, edit/Done on the right. */}
            <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 pb-3">
              <SheetClose
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center justify-self-start rounded-full text-text-muted transition-colors hover:bg-bg-input hover:text-text-primary"
              >
                <X className="h-5 w-5" aria-hidden />
              </SheetClose>

              <SheetTitle className="justify-self-center text-[1.75rem] font-semibold tracking-tight text-foreground">
                Shortcuts
              </SheetTitle>

              {/* Edit ⇄ Done — both stacked and cross-faded so neither is a hard cut. */}
              <div className="relative flex items-center justify-end justify-self-end">
                <button
                  type="button"
                  onClick={enterReorder}
                  aria-label="Edit shortcut order"
                  aria-hidden={reordering}
                  tabIndex={reordering ? -1 : 0}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium text-text-muted transition-opacity duration-200 hover:bg-bg-input hover:text-text-primary",
                    reordering && "pointer-events-none opacity-0"
                  )}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={exitReorder}
                  aria-hidden={!reordering}
                  tabIndex={reordering ? 0 : -1}
                  className={cn(
                    "absolute right-0 rounded-full px-3 py-1 text-base font-medium text-accent-amber transition-opacity duration-200 hover:bg-accent-amber/10",
                    !reordering && "pointer-events-none opacity-0"
                  )}
                >
                  Done
                </button>
              </div>
            </div>

            {/* Edit-mode hint — eases its height open/closed and fades the text in/out
                (grid-rows 0fr→1fr), which also makes the cards + sheet rise smoothly. */}
            <div
              className={cn(
                "grid shrink-0 transition-all duration-300 ease-out",
                reordering
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-3 text-center text-xs text-text-muted">
                  Drag the cards to reorder — tap any card when you&apos;re done
                </p>
              </div>
            </div>

            <SheetDescription className="sr-only">
              Quick actions. Add a compound, or open a tracking section. Use the menu
              button to rearrange the cards.
            </SheetDescription>

            {/* Top tier — fixed circle quick-actions. */}
            {CIRCLE_ITEMS.length > 0 && (
              <div className="grid shrink-0 grid-cols-4 gap-2 px-5 pb-6">
                {CIRCLE_ITEMS.map((item, i) => (
                  <div
                    key={item.id}
                    className="animate-shortcut-in"
                    style={{ animationDelay: `${i * STAGGER_MS}ms` }}
                  >
                    <CircleShortcut item={item} onPress={() => handlePress(item)} />
                  </div>
                ))}
              </div>
            )}

            {/* Bottom tier — the reorderable card stack. */}
            <ul className="flex flex-1 list-none flex-col gap-3 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              {order.map((id, j) => {
                const item = ITEM_BY_ID.get(id)
                if (!item) return null
                const isHeld = id === dragId
                const isLifted = id === liftedId
                return (
                  <li
                    key={id}
                    onPointerDown={(e) => onRowPointerDown(e, id)}
                    onPointerMove={onRowPointerMove}
                    onPointerUp={onRowPointerUp}
                    onPointerCancel={onRowPointerUp}
                    style={
                      isHeld
                        ? {
                            transform: `translateY(${dragDy}px)`,
                            transition: snapping
                              ? `transform ${SNAP_MS}ms ease-out`
                              : "none",
                          }
                        : undefined
                    }
                    className={cn(
                      "rounded-2xl",
                      reordering && "touch-none",
                      isLifted && "relative z-10 shadow-lg"
                    )}
                  >
                    {/* Entrance lives on an inner wrapper so it can't clash with the
                        li's drag transform. */}
                    <div
                      className="animate-shortcut-in"
                      style={{
                        animationDelay: `${(CIRCLE_ITEMS.length + j) * STAGGER_MS}ms`,
                      }}
                    >
                      <ShortcutItem
                        title={item.title}
                        subtitle={item.subtitle}
                        icon={item.icon}
                        reordering={reordering}
                        onPress={() => handlePress(item)}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </SheetContent>
      </Sheet>

      {/* "Add a compound" → the existing, unchanged Add-to-Stack flow. */}
      <AddToStackMenu open={addOpen} onOpenChange={setAddOpen} userId={userId} />

      {/* The six other items → one shared placeholder. */}
      <PlaceholderActionSheet
        open={placeholder !== null}
        onClose={() => setPlaceholder(null)}
        title={placeholder?.title ?? ""}
        warning={placeholder?.warning}
      />
    </>
  )
}

/** A single top-tier circle quick-action (icon in a ring + short label below). */
function CircleShortcut({
  item,
  onPress,
}: {
  item: ShortcutItemConfig
  onPress: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onPress}
      className="group flex w-full flex-col items-center gap-2 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent-amber focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-border-default bg-bg-surface-raised text-accent-amber transition-all duration-200 ease-out group-hover:border-accent-amber/40 group-hover:bg-bg-input group-active:scale-95">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <span className="text-center text-xs font-medium leading-tight text-text-muted">
        {item.shortLabel ?? item.title}
      </span>
    </button>
  )
}
