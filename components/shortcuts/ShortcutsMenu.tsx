"use client"

import { useLayoutEffect, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, X, type LucideIcon } from "lucide-react"

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { ReconCalculatorSheet } from "@/components/home/ReconCalculatorSheet"
import { AddWeightSheet } from "@/components/home/AddWeightSheet"
import { QuickTrackSheet } from "@/components/home/QuickTrackSheet"
import {
  GRID_ITEMS,
  PRIMARY_ITEM,
  type ShortcutItem,
} from "@/components/shortcuts/shortcutItems"
import { requestProgressAction } from "@/lib/progress/progressAction"
import type { WeightUnit } from "@/lib/weight"

interface ShortcutsMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Forwarded to the Add-to-Stack flow (scopes the user's custom compounds). */
  userId: string
  /** The user's weight unit — the Weight tile's quick-log popup uses it. */
  unit: WeightUnit
}

// Release the handle past this fraction of the sheet's height → dismiss.
const DISMISS_THRESHOLD = 0.3
const STAGGER_MS = 40 // per-item entrance delay

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

/**
 * The "Shortcuts" menu the bottom-nav plus opens (A10). A primary "Log a dose"
 * action sits above one consistent grid of six tiles — Add a compound, Journal,
 * Weight, Blood work, Calculator, Calendar. Routing items navigate (Log a dose →
 * the home log; Weight → the Weight view, its only entry point); Add a compound
 * opens the unchanged Add-to-Stack flow; Calculator opens the reconstitution
 * calculator; Weight opens the quick log-today's-weight popup; Journal and Blood
 * work navigate to Progress and open its real journal-compose / bloodwork-gallery
 * flows (via `requestProgressAction`); Calendar routes to /calendar. Opening any
 * child flow closes this menu first, so only one bottom sheet is on screen at a
 * time.
 */
export function ShortcutsMenu({
  open,
  onOpenChange,
  userId,
  unit,
}: ShortcutsMenuProps) {
  const router = useRouter()
  const cardRef = useRef<HTMLDivElement>(null)
  const handleDragRef = useRef<{ startY: number; height: number } | null>(null)
  const offsetRef = useRef(0)
  const [offsetY, setOffsetY] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Which child flow is open (only one at a time).
  const [quickTrackOpen, setQuickTrackOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)

  // Every open starts at rest. Runs before paint → no flash.
  useIsoLayoutEffect(() => {
    if (!open) return
    offsetRef.current = 0
    setOffsetY(0)
  }, [open])

  function handlePress(item: ShortcutItem) {
    switch (item.action) {
      case "route":
        onOpenChange(false)
        if (item.href) router.push(item.href)
        break
      case "quick-track":
        // The quick "What would you like to track?" popup — log today's doses
        // in place instead of routing to the dashboard.
        onOpenChange(false)
        setQuickTrackOpen(true)
        break
      case "add-stack":
        onOpenChange(false)
        setAddOpen(true)
        break
      case "calculator":
        onOpenChange(false)
        setCalcOpen(true)
        break
      case "weight":
        onOpenChange(false)
        setWeightOpen(true)
        break
      case "journal":
        // Open the real journal compose on the Progress screen (Write / Markers).
        onOpenChange(false)
        requestProgressAction("journal-compose")
        router.push("/progress")
        break
      case "bloodwork":
        // Open the real bloodwork gallery on the Progress screen (view + add).
        onOpenChange(false)
        requestProgressAction("bloodwork-gallery")
        router.push("/progress")
        break
    }
  }

  /* ----------------------------------------------------------- drag-to-dismiss */

  function handlePointerDown(e: React.PointerEvent) {
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
      onOpenChange(false)
    } else {
      offsetRef.current = 0
      setOffsetY(0)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[90dvh] gap-0 border-t-0 bg-transparent p-0 shadow-none"
        >
          <div
            ref={cardRef}
            style={{
              transform: `translateY(${offsetY}px)`,
              transition: dragging ? "none" : "transform 250ms ease-out",
            }}
            className="flex max-h-[90dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
          >
            {/* Grab handle — drag down to dismiss. */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
            >
              <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
            </div>

            {/* Header — close left, title centred. */}
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
              <span aria-hidden className="justify-self-end" />
            </div>

            <SheetDescription className="sr-only">
              Quick actions. Log a dose, add a compound, or open a tracking section.
            </SheetDescription>

            <div className="flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              {/* Primary action — Log a dose. */}
              <div className="animate-shortcut-in" style={{ animationDelay: "0ms" }}>
                <PrimaryAction
                  item={PRIMARY_ITEM}
                  onPress={() => handlePress(PRIMARY_ITEM)}
                />
              </div>

              {/* One consistent grid of six tiles. */}
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {GRID_ITEMS.map((item, i) => (
                  <div
                    key={item.id}
                    className="animate-shortcut-in"
                    style={{ animationDelay: `${(i + 1) * STAGGER_MS}ms` }}
                  >
                    <GridTile item={item} onPress={() => handlePress(item)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* "Log a dose" → the quick-track popup (tick today's doses → confirm). */}
      <QuickTrackSheet
        open={quickTrackOpen}
        onOpenChange={setQuickTrackOpen}
        userId={userId}
      />

      {/* "Add a compound" → the existing, unchanged Add-to-Stack flow. */}
      <AddToStackMenu open={addOpen} onOpenChange={setAddOpen} userId={userId} />

      {/* "Calculator" → the reconstitution calculator (A8). */}
      <ReconCalculatorSheet open={calcOpen} onOpenChange={setCalcOpen} />

      {/* "Weight" → quick log of today's bodyweight + optional progress photos. */}
      <AddWeightSheet
        open={weightOpen}
        onOpenChange={setWeightOpen}
        unit={unit}
        userId={userId}
      />
    </>
  )
}

/** The prominent primary row at the top of the menu. */
function PrimaryAction({
  item,
  onPress,
}: {
  item: ShortcutItem
  onPress: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onPress}
      className="group flex w-full items-center gap-4 rounded-2xl border border-accent-amber/30 bg-accent-amber/10 px-4 py-4 text-left transition-colors duration-200 ease-out hover:border-accent-amber/50 active:scale-[0.99]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-amber text-bg-base">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-foreground">
          {item.title}
        </span>
        <span className="block truncate text-sm text-text-muted">
          {item.subtitle}
        </span>
      </span>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-text-muted transition-colors group-hover:text-accent-amber"
        aria-hidden
      />
    </button>
  )
}

/** One square tile in the consistent grid. */
function GridTile({
  item,
  onPress,
}: {
  item: ShortcutItem
  onPress: () => void
}) {
  const [ripples, setRipples] = useState<
    { id: number; x: number; y: number; size: number }[]
  >([])
  const seq = useRef(0)
  const Icon: LucideIcon = item.icon

  function spawnRipple(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const size =
      2 *
      Math.max(
        Math.hypot(x, y),
        Math.hypot(rect.width - x, y),
        Math.hypot(x, rect.height - y),
        Math.hypot(rect.width - x, rect.height - y),
      )
    setRipples((cur) => [...cur, { id: seq.current++, x, y, size }])
  }

  return (
    <button
      type="button"
      onClick={onPress}
      onPointerDown={spawnRipple}
      className="group relative flex aspect-square w-full flex-col items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-border-default bg-bg-surface-raised p-2 text-center transition-colors duration-200 ease-out hover:border-border-strong hover:bg-bg-input active:bg-bg-input"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-default bg-bg-input text-accent-amber transition-colors group-hover:border-accent-amber/30">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-xs font-medium leading-tight text-text-muted">
        {item.shortLabel ?? item.title}
      </span>

      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden
          onAnimationEnd={() =>
            setRipples((cur) => cur.filter((x) => x.id !== r.id))
          }
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
          className="animate-shortcut-ripple pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-amber/20"
        />
      ))}
    </button>
  )
}
