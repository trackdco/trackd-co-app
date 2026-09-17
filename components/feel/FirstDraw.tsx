"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react"

import { cn } from "@/lib/utils"

/**
 * GRAPHS DRAW IN ON FIRST LOAD (feel pass §7, approved round 6).
 *
 * Once per session per screen, when the graph is genuinely in view, its line
 * sweeps left to right over 1470ms (quintic ease-out) behind a mask with a 2px
 * soft edge. A small ring in the series colour rides the tip, then fades. The
 * shaded fill stays hidden until the line is down, then fades in over 520ms.
 * A revisit shows everything finished, and range switching is untouched: that
 * stays recharts' own 450ms line.
 *
 * This is a data reveal Adrian asked for, not decoration; `ui-context.md`
 * carries it as a scoped exception to the scroll-triggered-motion ban.
 */

const LOAD_DRAW_MS = 1470
const drawn = new Set<string>()
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5)

export interface FirstDraw {
  key: string | null
  /** This mount is the one that draws. False on a revisit (and without a key). */
  first: boolean
  wrapRef: RefObject<HTMLSpanElement | null>
  clipRef: RefObject<HTMLSpanElement | null>
  tracerRef: RefObject<HTMLSpanElement | null>
}

/** `key` names the graph for the session, e.g. "progress:consistency". */
export function useFirstDraw(key: string | null): FirstDraw {
  const [first] = useState(() => key !== null && !drawn.has(key))
  const wrapRef = useRef<HTMLSpanElement>(null)
  const clipRef = useRef<HTMLSpanElement>(null)
  const tracerRef = useRef<HTMLSpanElement>(null)
  return { key, first, wrapRef, clipRef, tracerRef }
}

function setMask(el: HTMLElement, value: string) {
  el.style.maskImage = value
  el.style.setProperty("-webkit-mask-image", value)
}

/**
 * The frame a graph draws in. `line` selects the path the tracer follows (the
 * active series); `ready` says the chart is on the page (measured, with data);
 * `interrupt` changing mid-draw (a range switch) finishes the draw at once, so
 * the newer drawing owns the chart.
 */
export function DrawFrame({
  draw,
  line,
  color,
  ready = true,
  interrupt,
  className,
  style,
  children,
}: {
  draw: FirstDraw
  line: string
  color: string
  ready?: boolean
  interrupt?: unknown
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const finishRef = useRef<(() => void) | null>(null)
  // Destructured so the effect depends on stable values, not on the object
  // the hook hands out afresh every render.
  const { key, first, wrapRef, clipRef, tracerRef } = draw

  useEffect(() => {
    const wrap = wrapRef.current
    const clip = clipRef.current
    if (!first || !key || !ready || !wrap || !clip) return
    if (wrap.dataset.draw === "done") return
    const tracer = tracerRef.current

    let raf = 0
    let finished = false
    let io: IntersectionObserver | null = null
    const finish = () => {
      if (finished) return
      finished = true
      // A draw finished early (a range switch while it waited) must not start
      // later when the frame comes into view.
      io?.disconnect()
      cancelAnimationFrame(raf)
      setMask(clip, "")
      wrap.dataset.draw = "done"
      if (tracer) delete tracer.dataset.on
      finishRef.current = null
    }
    finishRef.current = finish

    // Already drawn this session (a remounted frame): show it finished.
    if (drawn.has(key)) {
      finish()
      return
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drawn.add(key)
      finish()
      return
    }

    const run = () => {
      if (finished) return
      drawn.add(key)
      const path = clip.querySelector<SVGGeometryElement>(line)
      const box = clip.getBoundingClientRect()
      const wrapBox = wrap.getBoundingClientRect()
      const ox = box.left - wrapBox.left
      const oy = box.top - wrapBox.top
      // The line's own points, in px from the frame's corner, sampled from the
      // RENDERED path so the ring sits on what is actually drawn.
      const pts: [number, number][] = []
      const ctm = path?.getScreenCTM()
      if (path && ctm && typeof path.getTotalLength === "function") {
        const len = path.getTotalLength()
        for (let n = 0; n <= 160; n++) {
          const p = path.getPointAtLength((len * n) / 160)
          pts.push([
            ctm.a * p.x + ctm.c * p.y + ctm.e - box.left,
            ctm.b * p.x + ctm.d * p.y + ctm.f - box.top,
          ])
        }
        pts.sort((a, b) => a[0] - b[0])
      }
      const xMin = pts.length ? pts[0][0] : 0
      const xMax = pts.length ? pts[pts.length - 1][0] : box.width
      const yAt = (x: number) => {
        const i = pts.findIndex((p) => p[0] >= x)
        if (i <= 0) return pts[0]?.[1] ?? 0
        const a = pts[i - 1]
        const b = pts[i]
        return a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0] || 1))
      }

      wrap.dataset.draw = "drawing"
      const t0 = performance.now()
      const step = (now: number) => {
        if (finished) return
        const t = Math.min(1, (now - t0) / LOAD_DRAW_MS)
        const q = easeOutQuint(t)
        // Everything left of the tip is drawn; the edge is 2px soft.
        const tip = q < 1 ? xMin + q * (xMax - xMin) : box.width + 8
        setMask(clip, `linear-gradient(90deg, black ${tip.toFixed(1)}px, transparent ${(tip + 2).toFixed(1)}px)`)
        if (tracer && pts.length && t < 1) {
          tracer.style.transform = `translate(${(ox + tip).toFixed(1)}px, ${(oy + yAt(tip)).toFixed(1)}px)`
          tracer.dataset.on = "true"
        }
        if (t < 1) raf = requestAnimationFrame(step)
        else finish()
      }
      raf = requestAnimationFrame(step)
    }

    // The frame is watched, not the page: the band the tab bar leaves free.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue
          const band = en.rootBounds ? en.rootBounds.height : window.innerHeight
          if (en.intersectionRatio < 0.85 && en.intersectionRect.height < band * 0.9) continue
          observer.disconnect()
          run()
          return
        }
      },
      { rootMargin: "0px 0px -64px 0px", threshold: Array.from({ length: 21 }, (_, n) => n / 20) },
    )
    io = observer
    observer.observe(wrap)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
      // Torn down mid-draw (the series changed): show it finished rather than
      // leave it half-masked.
      if (wrap.dataset.draw === "drawing") finish()
    }
  }, [key, first, wrapRef, clipRef, tracerRef, line, ready])

  // A newer drawing of this chart (a range switch) owns it from here.
  const lastInterrupt = useRef(interrupt)
  const drawKey = draw.key
  useEffect(() => {
    if (Object.is(lastInterrupt.current, interrupt)) return
    lastInterrupt.current = interrupt
    if (!finishRef.current) return
    // Seen and switched before it drew: a revisit shows it finished too.
    if (drawKey !== null) drawn.add(drawKey)
    finishRef.current()
  }, [interrupt, drawKey])

  // Spans with `display: block`, so the frame is valid inside a button.
  return (
    <span
      ref={wrapRef}
      data-draw={first ? "pending" : undefined}
      className={cn("draw-frame relative block", className)}
      style={style}
    >
      <span ref={clipRef} className="draw-clip block h-full">
        {children}
      </span>
      {first ? (
        <span
          ref={tracerRef}
          aria-hidden
          className="chart-tracer"
          style={{ "--tc": color } as CSSProperties}
        />
      ) : null}
    </span>
  )
}
