"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { FOCUSABLE, SHEET_CONTENT, trapTab } from "@/lib/feel/overlay"
import { cn } from "@/lib/utils"

/** Whether Tab can land on `el` (one of `FOCUSABLE`): shown, not inert, and
 *  not taken out of the Tab order (`tabindex="-1"`, a waiting close arrow). */
export function canTakeFocus(el: HTMLElement): boolean {
  if (el.getAttribute("tabindex") === "-1") return false
  if (el.closest("[inert]")) return false
  const rects = el.getClientRects?.()
  return !rects || rects.length > 0
}

/** What Tab can land on inside `root`, in document order. */
export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(canTakeFocus)
}

/**
 * Keeps Tab inside `card` (a pop-up with `aria-modal`), wrapping at both ends
 * (cold review B36). Returns true when it took the key. Shared by the pop-up
 * and the first-dose card, which run it from a capturing window listener and
 * stop the event there, so a sheet's own focus trap underneath never moves
 * focus a second time.
 */
export function trapTabIn(card: HTMLElement, e: KeyboardEvent): boolean {
  if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return false
  const items = focusablesIn(card)
  const next = trapTab(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey)
  e.preventDefault()
  ;(next < 0 ? card : items[next]).focus({ preventScroll: true })
  return true
}

/** The first thing to focus when a pop-up opens: its first control, else the card. */
export function firstFocusIn(card: HTMLElement): HTMLElement {
  return focusablesIn(card)[0] ?? card
}

/**
 * THE POP-UP (build-brief-final §3.16): a centred card over a dimmed screen,
 * for a key, an explainer ("What is a stack?") or a confirm ("Delete this
 * cycle for good?"). It scales in from 16px below at .96 (340ms,
 * cubic-bezier(.34,1.3,.64,1)) and leaves the way it came (170ms). A tap on
 * the dark around it, Escape, or the caller's own button closes it.
 *
 * WAAPI keyframes carry numbers only (`var()` snaps in Safari). Reduced motion:
 * a short fade. Focus moves into the card, Tab stays inside it, and focus goes
 * back to where it was on close.
 *
 * EVERY open waits for its host (cold review B9). The card renders into its
 * host (the sheet around it, or `<body>`), which a probe finds after mount; the
 * scale-in and the focus move run once the card is really there, on the first
 * open of an instance as on every later one.
 */
export function PopDialog({
  open,
  onClose,
  title,
  children,
  className,
  role = "dialog",
}: {
  open: boolean
  onClose: () => void
  /** The card's heading; also its accessible name. */
  title?: ReactNode
  children: ReactNode
  className?: string
  /** "alertdialog" for a confirm that asks before something destructive. */
  role?: "dialog" | "alertdialog"
}) {
  const [mounted, setMounted] = useState(open)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setMounted(true)
  }
  const scrimRef = useRef<HTMLDivElement>(null)
  // Opened from inside a sheet, it renders INSIDE that sheet, as the number pad
  // does: a Radix sheet makes everything outside itself inert (no pointer, no
  // focus), so a pop-up on <body> could be seen and not pressed.
  const probeRef = useRef<HTMLSpanElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!mounted) return
    setHost(probeRef.current?.closest<HTMLElement>(SHEET_CONTENT) ?? document.body)
  }, [mounted])
  const cardRef = useRef<HTMLDivElement>(null)
  const returnTo = useRef<Element | null>(null)
  // Bumped on every open, so a close still fading out when the pop-up opens
  // again cannot unmount it.
  const generation = useRef(0)
  const titleId = useId()

  // In. Only once the card is in its host: on a first open the host is found
  // one render later, and this runs again then.
  useLayoutEffect(() => {
    if (!open || !mounted || !host) return
    const scrim = scrimRef.current
    const card = cardRef.current
    if (!scrim || !card) return
    generation.current += 1
    scrim.getAnimations?.().forEach((a) => a.cancel())
    card.getAnimations?.().forEach((a) => a.cancel())
    // Where focus was, unless it is already in the card (a re-run).
    const active = document.activeElement
    if (active && !card.contains(active)) returnTo.current = active
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 120 : 220, easing: "ease-out", fill: "backwards" })
    card.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(16px) scale(0.96)" },
            { opacity: 1, transform: "none" },
          ],
      { duration: reduce ? 120 : 340, easing: "cubic-bezier(.34,1.3,.64,1)", fill: "backwards" },
    )
    firstFocusIn(card).focus({ preventScroll: true })
  }, [open, mounted, host])

  // Out: the way it came.
  useEffect(() => {
    if (open || !mounted) return
    const scrim = scrimRef.current
    const card = cardRef.current
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const gen = generation.current
    const finish = () => {
      if (gen !== generation.current) return
      setMounted(false)
      // The next open looks for its host afresh (the sheet may be a new one).
      setHost(null)
      const back = returnTo.current as HTMLElement | null
      returnTo.current = null
      if (back?.isConnected) back.focus?.({ preventScroll: true })
    }
    if (!scrim || !card) {
      finish()
      return
    }
    card.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: reduce ? "none" : "translateY(16px) scale(0.96)" },
      ],
      { duration: 170, easing: "ease-in", fill: "forwards" },
    )
    const a = scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: "ease-in", fill: "forwards" })
    a.finished.catch(() => {}).finally(finish)
  }, [open, mounted])

  // Escape closes THIS pop-up only, and Tab stays inside it. Both are caught on
  // the way down (capture, on the window) and stopped there, so a sheet
  // underneath neither closes with it nor moves focus behind the scrim.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
        return
      }
      const card = cardRef.current
      if (card && trapTabIn(card, e)) e.stopPropagation()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open, onClose])

  if (!mounted || typeof document === "undefined") return null
  const probe = <span ref={probeRef} hidden />
  if (!host) return probe
  return (<>{probe}{createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center p-6" role="presentation">
      <div ref={scrimRef} className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        ref={cardRef}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn("inst-card relative w-full max-w-[320px] rounded-[20px] p-5 outline-none", className)}
      >
        {title ? (
          <h2 id={titleId} className="text-[17px] font-normal tracking-[-0.01em] text-foreground">
            {title}
          </h2>
        ) : null}
        {children}
      </div>
    </div>,
    host,
  )}</>)
}
