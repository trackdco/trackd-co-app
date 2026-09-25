"use client"

import { useEffect, useLayoutEffect, useRef } from "react"

import { cn } from "@/lib/utils"
import { PRESS } from "@/lib/ui-presets"

/**
 * A damped spring sampled once per 60Hz frame into WAAPI keyframes, the way
 * the motion-set prototype drives every spring (ui-context → Motion). `w` is
 * the angular frequency per ms and `z` the damping ratio.
 */
function spring(from: number, to: number, w: number, z: number): { vals: number[]; dur: number } {
  const dt = 1000 / 60
  const range = Math.abs(to - from) || 1
  let x = from - to
  let v = 0
  let t = 0
  const vals = [from]
  while (t < 2400) {
    const a = -w * w * x - 2 * z * w * v
    v += a * dt
    x += v * dt
    t += dt
    vals.push(to + x)
    if (Math.abs(x) < range * 0.0015 && Math.abs(v) < range * 0.00004) break
  }
  vals[vals.length - 1] = to
  return { vals, dur: Math.max(t, 120) }
}

/** The prototype's A1 rise: from below the edge, springy (w .021, z .72). */
const RISE = spring(110, 0, 0.021, 0.72)
const DROP_MS = 230
/** Save confirms in place for this long before the bar goes down. */
export const SAVE_CONFIRM_MS = 620

/**
 * The Track bar (A1, Adrian 2026-09-24): it rises from the bottom edge on a
 * spring when a row opens with a valid dose, reads "Track 2 mg · Abdomen L",
 * and on Track simply DROPS while the row takes the tick. It drops early only
 * when the dose is emptied. In edit mode it reads "Save" and confirms with a
 * calm circled tick before dropping.
 *
 * It sits over the tab bar and the + while it is up (z 48: above the nav's 40
 * and the +'s 46, under a sheet's 50, so Add stock opens over it): the open
 * row is the one thing on the screen, and the bar is its action.
 *
 * `inline`: inside a sheet (Quick log, the Calendar's day) the same bar is the
 * sheet's footer, and it opens and shuts in place instead of rising over the
 * page, which the sheet covers.
 */
export function TrackBar({
  up,
  label,
  confirming,
  busy = false,
  onTrack,
  inline = false,
}: {
  /** A row is open with a dose to track. */
  up: boolean
  label: string
  /** Save was tapped: the label gives way to the tick, then the bar drops. */
  confirming: boolean
  /** Track is already running: a second tap must not log it twice. */
  busy?: boolean
  onTrack: () => void
  /** The sheet's footer rather than the page's bar. */
  inline?: boolean
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const shown = useRef(false)

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (up && !shown.current) {
      shown.current = true
      bar.style.visibility = "visible"
      bar.getAnimations().forEach((a) => a.cancel())
      if (!reduce) {
        bar.animate(
          RISE.vals.map((p) => ({ transform: `translateY(${p}%)` })),
          { duration: RISE.dur, easing: "linear" },
        )
      }
    } else if (!up && shown.current) {
      shown.current = false
      bar.getAnimations().forEach((a) => a.cancel())
      if (reduce) {
        bar.style.visibility = "hidden"
        return
      }
      const drop = bar.animate(
        [{ transform: "translateY(0)" }, { transform: "translateY(110%)" }],
        { duration: DROP_MS, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
      )
      drop.finished
        .then(() => {
          if (!shown.current) {
            bar.style.visibility = "hidden"
            drop.cancel()
          }
        })
        .catch(() => {})
    }
  }, [up])

  // While the bar is up the + steps aside (see `body[data-log-open]`).
  useEffect(() => {
    if (!up || inline) return
    document.body.dataset.logOpen = "true"
    return () => {
      delete document.body.dataset.logOpen
    }
  }, [up, inline])

  // A label that changes while up (a site picked) lands softly rather than
  // snapping: the prototype's 320ms settle.
  const labelRef = useRef<HTMLSpanElement>(null)
  const lastLabel = useRef(label)
  useEffect(() => {
    const el = labelRef.current
    if (!el || lastLabel.current === label) return
    lastLabel.current = label
    if (!(inline ? up : shown.current) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 320, easing: "ease-out" })
  }, [label, inline, up])

  const button = (
    <button
      type="button"
      onClick={onTrack}
      disabled={!up || confirming || busy}
      className={cn(
        PRESS.button,
        "relative h-[46px] w-full overflow-hidden inst-btn text-sm font-medium text-bg-base",
      )}
    >
      <span
        ref={labelRef}
        className={cn(
          "absolute inset-0 flex items-center justify-center whitespace-nowrap transition-opacity duration-150",
          confirming && "opacity-0",
        )}
      >
        {label}
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-center",
          confirming ? "animate-track-confirm" : "opacity-0",
        )}
      >
        <svg width="26" height="26" viewBox="0 0 26 26">
          <circle cx="13" cy="13" r="11" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8.2 13.4l3.2 3.2 6.6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  )

  if (inline) {
    // The app's one expand mechanic: grid-rows 0fr ↔ 1fr.
    return (
      <div
        data-track-bar=""
        className="grid w-full transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: up ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden" inert={!up}>
          <div className="pt-1.5">{button}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={barRef}
      data-track-bar=""
      className="fixed inset-x-0 bottom-0 z-[48] px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+14px)]"
      style={{ visibility: "hidden" }}
    >
      <div aria-hidden className="track-bar-ground absolute inset-0 hairline-t" />
      <div className="relative mx-auto max-w-md">{button}</div>
    </div>
  )
}
