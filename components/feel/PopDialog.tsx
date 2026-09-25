"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

/**
 * THE POP-UP (build-brief-final §3.16): a centred card over a dimmed screen,
 * for a key, an explainer ("What is a stack?") or a confirm ("Delete this
 * cycle for good?"). It scales in from 16px below at .96 (340ms,
 * cubic-bezier(.34,1.3,.64,1)) and leaves the way it came (170ms). A tap on
 * the dark around it, Escape, or the caller's own button closes it.
 *
 * WAAPI keyframes carry numbers only (`var()` snaps in Safari). Reduced motion:
 * a short fade. Focus moves into the card and back to where it was on close.
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
    setHost(probeRef.current?.closest<HTMLElement>('[data-slot="sheet-content"]') ?? document.body)
  }, [mounted])
  const cardRef = useRef<HTMLDivElement>(null)
  const returnTo = useRef<Element | null>(null)
  const titleId = useId()

  // In.
  useLayoutEffect(() => {
    if (!open || !mounted) return
    const scrim = scrimRef.current
    const card = cardRef.current
    if (!scrim || !card) return
    returnTo.current = document.activeElement
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
    const first = card.querySelector<HTMLElement>("button, [href], input, textarea, [tabindex]:not([tabindex='-1'])")
    ;(first ?? card).focus({ preventScroll: true })
  }, [open, mounted])

  // Out: the way it came.
  useEffect(() => {
    if (open || !mounted) return
    const scrim = scrimRef.current
    const card = cardRef.current
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!scrim || !card) {
      setMounted(false)
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
    a.finished
      .catch(() => {})
      .finally(() => {
        setMounted(false)
        const back = returnTo.current as HTMLElement | null
        back?.focus?.({ preventScroll: true })
      })
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
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
