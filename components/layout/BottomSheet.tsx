"use client"

import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useSheetDrag } from "@/components/home/useSheetDrag"
import { isOverSheet, SHEET_CONTENT, topOpenSheet, windowFrame } from "@/lib/feel/overlay"
import { SHEET_TITLE } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/** A sheet has landed once its own entrance (or desktop slide) has ended:
 *  nothing is animating on the content element itself. */
function landed(sheet: HTMLElement): boolean {
  return (sheet.getAnimations?.() ?? []).length === 0
}

function readTopSheet(): HTMLElement | null {
  return topOpenSheet(document.querySelectorAll<HTMLElement>(SHEET_CONTENT), landed)
}

/** Sheets come and go as portals on <body>; they flip `data-state` as they
 *  start to close, and they land when their entrance animation ends. */
function subscribeSheets(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {}
  const onLanded = (e: Event) => {
    if ((e.target as Element | null)?.matches?.(SHEET_CONTENT)) onChange()
  }
  const settle = ["animationend", "animationcancel", "transitionend", "transitioncancel"]
  settle.forEach((t) => document.addEventListener(t, onLanded, true))
  let portals: MutationObserver | null = null
  let states: MutationObserver | null = null
  if (typeof MutationObserver !== "undefined") {
    portals = new MutationObserver(onChange)
    portals.observe(document.body, { childList: true })
    states = new MutationObserver(onChange)
    states.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-state"] })
  }
  return () => {
    settle.forEach((t) => document.removeEventListener(t, onLanded, true))
    portals?.disconnect()
    states?.disconnect()
  }
}

const noSheet = () => null
const noSubscription = () => () => {}

/**
 * THE TOP OPEN SHEET's content element, or null when no sheet is open (cold
 * review B10, B36). A Radix sheet hides everything outside itself from screen
 * readers and traps Tab inside itself, so a layer that must stay reachable
 * while one is up (the bottom toast's Undo, the first-dose card) renders INTO
 * this element, as the pop-up and the number pad do. A sheet counts once it
 * has landed and stops counting the moment it starts to close
 * (`lib/feel/overlay.ts`). `active` false (a pop-up that is not showing)
 * reads nothing and watches nothing.
 */
export function useTopOpenSheet(active = true): HTMLElement | null {
  return useSyncExternalStore(active ? subscribeSheets : noSubscription, active ? readTopSheet : noSheet, noSheet)
}

/** Where a `fixed; inset: 0` box lands on <body>: the window as fixed
 *  things see it. Measured with a throwaway probe, never drawn. */
function windowBox(doc: Document): DOMRect {
  const probe = doc.createElement("div")
  probe.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none"
  doc.body.appendChild(probe)
  const box = probe.getBoundingClientRect()
  doc.body.removeChild(probe)
  return box
}

/**
 * A LAYER RENDERED INTO A SHEET THAT STILL COVERS THE WINDOW (cold review B10,
 * B36). With `sheet` (from `useTopOpenSheet`) its children go inside that
 * sheet, in a frame laid over the whole window; without, they render where
 * they stand, untouched.
 *
 * The frame is there for desktop's centred dialog, which is placed with a
 * `translate` (`app/desktop.css`): that makes the dialog the box a `fixed`
 * child is placed against, so the toast sat inside the dialog, 9.25rem above
 * its foot. A hidden `fixed; inset: 0` probe shows where that box is, and
 * the same probe on <body> where the window is; when they differ the frame is
 * moved back over the window (`windowFrame`), again whenever the sheet
 * changes size or the window does. The frame is itself the box its
 * children's `fixed` is placed against (`translate: 0 0`), so they sit
 * exactly where they would on <body>. On a phone sheet the two probes agree
 * and the frame is left as it is drawn: `inset: 0`, the window. The frame takes no taps (the layer's own parts do), and
 * `className` gives it its layer (`z-[70]` for the toast).
 */
export function SheetLayer({
  sheet,
  className,
  children,
}: {
  sheet: HTMLElement | null
  className?: string
  children: ReactNode
}) {
  const probeRef = useRef<HTMLSpanElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const probe = probeRef.current
    const frame = frameRef.current
    if (!sheet || !probe || !frame) return
    const place = () => {
      const f = windowFrame(probe.getBoundingClientRect(), windowBox(sheet.ownerDocument))
      frame.style.left = f ? `${f.left}px` : ""
      frame.style.top = f ? `${f.top}px` : ""
      frame.style.width = f ? `${f.width}px` : ""
      frame.style.height = f ? `${f.height}px` : ""
    }
    place()
    const sized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place)
    sized?.observe(sheet)
    window.addEventListener("resize", place)
    return () => {
      sized?.disconnect()
      window.removeEventListener("resize", place)
    }
  }, [sheet])
  if (!sheet) return <>{children}</>
  return createPortal(
    <>
      <span ref={probeRef} aria-hidden className="pointer-events-none invisible fixed inset-0" />
      <div ref={frameRef} data-sheet-layer="" className={cn("pointer-events-none fixed inset-0 [translate:0_0]", className)}>
        {children}
      </div>
    </>,
    sheet,
  )
}

/**
 * THE ONE SHEET FRAME (consistency fix #1): a bottom sheet with a grab handle
 * you pull down to close, a hairline top, the surface, and no ×. Tapping the
 * dark above it and Escape close it too. Its header is one of two kinds:
 *
 * - a title (`SHEET_TITLE`) with a footer of Cancel + the primary action, or
 * - a Cancel / Title / Verb bar (Add, Log), passed as `header`.
 *
 * Content scrolls inside; the frame never grows past 92% of the screen. On a
 * desktop it is the dialog or the rail, as `desktop` says (app/desktop.css
 * hides the handle there).
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  header,
  footer,
  desktop = "dialog",
  onOpenAutoFocus,
  onEscapeKeyDown,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The sheet's name; also its accessible name. */
  title: string
  /** Name it for screen readers only (a sheet whose content says what it is). */
  hideTitle?: boolean
  /** Read out with the title; never shown. */
  description?: string
  /** A Cancel / Title / Verb bar in place of the plain title. */
  header?: ReactNode
  /** Pinned under the scrolling content: Cancel + the primary action. */
  footer?: ReactNode
  /** Desktop: a centred dialog, the side rail, or a full-window viewer. */
  desktop?: "dialog" | "rail" | "viewer"
  /** Focus on open. By default nothing is focused, so no keyboard springs up. */
  onOpenAutoFocus?: (e: Event) => void
  /** Escape, before it closes the sheet: `e.preventDefault()` keeps it open
   *  (a step inside the sheet backs out first). */
  onEscapeKeyDown?: (e: KeyboardEvent) => void
  className?: string
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-desktop={desktop}
        side="bottom"
        showCloseButton={false}
        onOpenAutoFocus={onOpenAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
        // A tap on the toast (its Undo) or on the first-dose card is not a tap
        // outside: the sheet stays. Needed ALWAYS, not only while a sheet
        // rises: once they move into the sheet (`SheetLayer`) they are in its
        // DOM but still outside its React tree, which is how Radix judges
        // "outside". Removing this makes Undo and Done close the sheet.
        onInteractOutside={(e) => {
          if (isOverSheet(e.target as Element | null)) e.preventDefault()
        }}
        className="gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        <Frame
          open={open}
          onClose={() => onOpenChange(false)}
          title={title}
          hideTitle={hideTitle || header != null}
          description={description}
          header={header}
          footer={footer}
          className={className}
        >
          {children}
        </Frame>
      </SheetContent>
    </Sheet>
  )
}

function Frame({
  open,
  onClose,
  title,
  hideTitle,
  description,
  header,
  footer,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  hideTitle: boolean
  description?: string
  header?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(onClose, open)
  return (
    <div
      ref={cardRef}
      style={cardStyle}
      className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl hairline-t bg-bg-surface shadow-lg"
    >
      {/* The grab handle: pull down to close. */}
      <div
        {...handleProps}
        className="flex h-9 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
      </div>
      <SheetTitle className={hideTitle ? "sr-only" : cn(SHEET_TITLE, "shrink-0 px-5 pb-3")}>{title}</SheetTitle>
      {description ? <SheetDescription className="sr-only">{description}</SheetDescription> : null}
      {header ? <div className="shrink-0 px-5 pb-3">{header}</div> : null}
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-5", footer ? "pb-3" : "pb-[calc(1.25rem+env(safe-area-inset-bottom))]", className)}>
        {children}
      </div>
      {footer ? (
        <div className="flex shrink-0 gap-2 px-5 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">{footer}</div>
      ) : null}
    </div>
  )
}
