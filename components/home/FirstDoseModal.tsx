"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { trapTabIn } from "@/components/feel/PopDialog"
import { SheetLayer, useTopOpenSheet } from "@/components/layout/BottomSheet"
import { SHEET_CONTENT } from "@/lib/feel/overlay"
import { PRIMARY_BUTTON } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const R = 54
const C = 2 * Math.PI * R
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2
  return { x: 70 + Math.cos(a) * R, y: 70 + Math.sin(a) * R, dx: Math.cos(a) * 18, dy: Math.sin(a) * 18 }
})

/**
 * FIRST DOSE LOGGED (build-brief-final §3.1): a centred pop-up over a dimmed
 * Home, not a full screen. An amber ring draws closed, a white check draws
 * inside it, ten amber sparks burst out, then the title, the line and Done rise
 * in. No Kyle here (Adrian: "remove Kyle, make it a tick").
 *
 * The timings are the brief's, to the millisecond. WAAPI keyframes carry
 * numbers only: `var()` inside a keyframe snaps in Safari. Reduced motion: a
 * plain fade, everything already drawn.
 *
 * Like every pop-up (cold review B36): focus moves to Done, Tab stays in the
 * card, and focus goes back to where it was when it closes. If a sheet is up
 * when it opens, it renders inside that sheet (a Radix sheet takes the page's
 * pointer and focus), over the whole window (`SheetLayer`), and it is
 * `pointer-events-auto` either way, because an open sheet leaves
 * `pointer-events: none` on <body>. A sheet under it stays open: Escape
 * stops at the card, and a tap on Done or the dark is not a tap outside the
 * sheet (`data-over-sheet`, which the sheet frame exempts). Once it starts to
 * close it stays where it is until it has faded, so nothing can move it
 * mid-fade and draw it afresh.
 */
export function FirstDoseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(open)
  const [prevOpen, setPrevOpen] = useState(open)
  // Where it stays while it fades out (`undefined`: it follows the top sheet).
  const [pinned, setPinned] = useState<HTMLElement | null | undefined>(undefined)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setMounted(true)
      setPinned(undefined)
    }
  }
  const scrimRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<HTMLButtonElement>(null)
  const closing = useRef(false)
  const returnTo = useRef<Element | null>(null)
  // Inside the top sheet when one is up, else on <body>.
  const liveSheet = useTopOpenSheet(mounted)
  const sheet = pinned === undefined ? liveSheet : pinned

  useLayoutEffect(() => {
    if (!open || !mounted) return
    closing.current = false
    const scrim = scrimRef.current
    const card = cardRef.current
    if (!scrim || !card) return
    const active = document.activeElement
    if (active && !card.contains(active)) returnTo.current = active
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const q = <T extends Element>(sel: string) => Array.from(card.querySelectorAll<T>(sel))
    if (reduce) {
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: "backwards" })
      card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: "backwards" })
    } else {
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out", fill: "backwards" })
      card.animate(
        [
          { opacity: 0, transform: "translateY(18px) scale(0.94)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 420, easing: "cubic-bezier(.34,1.3,.64,1)", fill: "backwards" },
      )
      q<SVGCircleElement>("[data-ring]").forEach((el) =>
        el.animate([{ strokeDashoffset: C }, { strokeDashoffset: 0 }], {
          duration: 760,
          delay: 180,
          easing: "cubic-bezier(.65,0,.35,1)",
          fill: "backwards",
        }),
      )
      q<SVGGElement>("[data-check]").forEach((el) =>
        el.animate(
          [
            { transform: "scale(0.6)", opacity: 0 },
            { transform: "scale(1.06)", opacity: 1, offset: 0.6 },
            { transform: "scale(1)", opacity: 1 },
          ],
          { duration: 520, delay: 260, easing: "cubic-bezier(.34,1.3,.64,1)", fill: "backwards" },
        ),
      )
      q<SVGPathElement>("[data-check] path").forEach((el) =>
        el.animate([{ strokeDashoffset: 60 }, { strokeDashoffset: 0 }], {
          duration: 460,
          delay: 720,
          easing: "cubic-bezier(.65,0,.35,1)",
          fill: "backwards",
        }),
      )
      q<SVGCircleElement>("[data-spark]").forEach((el, i) => {
        const s = SPARKS[i]
        el.animate(
          [
            { transform: "translate(0,0)", opacity: 1 },
            { transform: `translate(${s.dx}px,${s.dy}px)`, opacity: 0 },
          ],
          { duration: 560, delay: 940, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" },
        )
      })
      q<HTMLElement>("[data-rise]").forEach((el, i) =>
        el.animate(
          [
            { opacity: 0, transform: "translateY(8px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 360, delay: [1000, 1110, 1220][i] ?? 1220, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" },
        ),
      )
    }
    doneRef.current?.focus({ preventScroll: true })
  }, [open, mounted])

  // A sheet that closes under the card moves it back to <body>: focus follows.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!open || !card || card.contains(document.activeElement)) return
    doneRef.current?.focus({ preventScroll: true })
  }, [open, sheet])

  /** Back to where focus was before the card opened, if that is still there. */
  const giveFocusBack = () => {
    const back = returnTo.current as HTMLElement | null
    returnTo.current = null
    if (back?.isConnected) back.focus?.({ preventScroll: true })
  }

  const close = () => {
    if (closing.current) return
    closing.current = true
    const scrim = scrimRef.current
    const card = cardRef.current
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!scrim || !card) {
      setMounted(false)
      onClose()
      giveFocusBack()
      return
    }
    // Stays in the sheet (or on <body>) it is fading out in.
    setPinned(card.closest<HTMLElement>(SHEET_CONTENT))
    // Leaves the way it came: the card down and out (180ms), the scrim (220ms).
    card.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: reduce ? "none" : "translateY(12px) scale(0.97)" },
      ],
      { duration: 180, easing: "ease-in", fill: "forwards" },
    )
    scrim
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in", fill: "forwards" })
      .finished.catch(() => {})
      .finally(() => {
        setMounted(false)
        onClose()
        giveFocusBack()
      })
  }

  // Escape closes it and Tab stays in it. Caught on the way down (capture, on
  // the window) and stopped, so a sheet underneath does not act on them too.
  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        close()
        return
      }
      const card = cardRef.current
      if (card && trapTabIn(card, e)) e.stopPropagation()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
    // `close` is stable enough for a keydown listener that lives while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  if (!mounted || typeof document === "undefined") return null
  const layer = (
    <div
      data-over-sheet=""
      className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center p-6"
      role="presentation"
    >
      <div ref={scrimRef} className="absolute inset-0 bg-black/60" onClick={close} aria-hidden />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-dose-title"
        aria-describedby="first-dose-line"
        tabIndex={-1}
        className="inst-card relative w-full max-w-[300px] rounded-[24px] px-5 pt-6 pb-4 text-center outline-none"
      >
        <div className="relative mx-auto h-[140px] w-[140px]">
          <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden className="absolute inset-0 overflow-visible">
            <circle cx="70" cy="70" r={R} fill="none" style={{ stroke: "var(--bg-input)" }} strokeWidth="5" />
            <circle
              data-ring
              cx="70"
              cy="70"
              r={R}
              fill="none"
              style={{ stroke: "var(--accent-amber)" }}
              strokeWidth="5"
              strokeLinecap="round"
              transform="rotate(-90 70 70)"
              strokeDasharray={C.toFixed(1)}
              strokeDashoffset="0"
            />
            {SPARKS.map((s, i) => (
              <circle key={i} data-spark cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r="2.6" style={{ fill: "var(--accent-amber)" }} opacity="0" />
            ))}
            <g data-check style={{ transformOrigin: "70px 70px", transformBox: "view-box" }}>
              <path
                d="M50 71l14 14 27-30"
                fill="none"
                style={{ stroke: "var(--text-primary)" }}
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={60}
                strokeDasharray="60"
                strokeDashoffset="0"
              />
            </g>
          </svg>
        </div>
        <h2 id="first-dose-title" data-rise className="mt-3 text-[19px] font-normal tracking-[-0.01em] text-foreground">
          First Dose Logged
        </h2>
        <p id="first-dose-line" data-rise className="mt-1 text-[13.5px] leading-snug text-text-muted">
          Now that you’ve got the basics down, have a look around.
        </p>
        <button ref={doneRef} data-rise type="button" onClick={close} className={cn(PRESS_WIDE, "mt-4")}>
          Done
        </button>
      </div>
    </div>
  )
  return sheet ? (
    <SheetLayer sheet={sheet} className="z-[80]">
      {layer}
    </SheetLayer>
  ) : (
    createPortal(layer, document.body)
  )
}

const PRESS_WIDE = `${PRIMARY_BUTTON} w-full`
