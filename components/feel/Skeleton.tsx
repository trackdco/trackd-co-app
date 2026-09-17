"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"

import { cn } from "@/lib/utils"
import { sparkGeometry } from "@/lib/progress/spark"

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

/**
 * LOADING SKELETONS (feel pass §1).
 *
 * Shaped like the real cards, in `--bg-surface-raised` on the card surface, and
 * breathing with the "wave": each block's opacity runs 0.5 → 1 → 0.5 over 1.9s,
 * delayed by its row, so the breath travels down the page. It is the one
 * sanctioned loop outside `/onboarding`, and only while something is loading.
 * Reduced motion holds it still. The CSS is in `globals.css` ("SKELETONS").
 */

/** One skeleton block. `w` is any CSS length; `h` is px. */
export function Sk({
  w = "100%",
  h,
  round = false,
  className,
  style,
}: {
  w?: string
  h: number
  round?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      aria-hidden
      className={cn("sk block", round ? "rounded-full" : "rounded-md", className)}
      style={{ width: w, height: h, ...style }}
    />
  )
}

/**
 * A GHOST GRAPH: the real chart's smooth monotone curve and tapered fill, in
 * skeleton tones, so a graph card loads as a graph rather than a flat block.
 * The curve is fixed per `seed`, never random, so server and client agree.
 */
export function SkGraph({ height, seed = 0, className }: { height: number; seed?: number; className?: string }) {
  const values = Array.from(
    { length: 9 },
    (_, i) => 50 + Math.sin(i * 0.9 + seed) * 14 + Math.cos(i * 0.5 + seed) * 8,
  )
  const { line, area } = sparkGeometry(values, 300, height, 6)
  const id = `sk-graph-${seed}`
  return (
    <span aria-hidden className={cn("sk block", className)} style={{ height }}>
      <svg
        viewBox={`0 0 300 ${height}`}
        preserveAspectRatio="none"
        className="block h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--skeleton-line)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--skeleton-line)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--skeleton-line)"
          strokeWidth={2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  )
}

/** Row index per block (one row per 70px), so the wave travels top to bottom. */
function indexBlocks(wrap: HTMLElement) {
  const top = wrap.getBoundingClientRect().top
  wrap.querySelectorAll<HTMLElement>(".sk").forEach((b) => {
    const i = Math.max(0, Math.round((b.getBoundingClientRect().top - top) / 70))
    b.style.setProperty("--i", String(i))
  })
}

/**
 * A group of skeleton blocks standing in for a screen's content. Fades in
 * (320ms) without moving, and is announced once as busy.
 */
export function SkeletonGroup({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useIsoLayoutEffect(() => {
    if (ref.current) indexBlocks(ref.current)
  }, [])
  return (
    <div ref={ref} role="status" aria-busy="true" aria-label={label} className={cn("sk-wrap", className)}>
      {children}
    </div>
  )
}

/**
 * THE CROSSFADE HELPER. While `ready` is false it shows `skeleton`. When
 * `ready` turns true the real content mounts (and rises on its own
 * `animate-home-up`), while the skeleton fades out (240ms) where it stood,
 * absolutely positioned over the content, so the two never stack and nothing
 * shifts. One rise per arrival: the skeleton never moves.
 *
 * Content that is ready on the first render shows at once, with no skeleton.
 */
export function SkeletonSwap({
  ready,
  skeleton,
  className,
  children,
}: {
  ready: boolean
  skeleton: ReactNode
  /** Applied to both the content box and the leaving skeleton (e.g. `space-y-5`). */
  className?: string
  children: ReactNode
}) {
  const [leaving, setLeaving] = useState(false)
  const [prevReady, setPrevReady] = useState(ready)
  if (ready !== prevReady) {
    setPrevReady(ready)
    setLeaving(ready)
  }
  useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(() => setLeaving(false), 260)
    return () => window.clearTimeout(t)
  }, [leaving])

  return (
    <div className="relative">
      <div className={className}>{ready ? children : skeleton}</div>
      {leaving ? (
        <div aria-hidden className={cn("sk-leaving", className)}>
          {skeleton}
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------ route loading → page handoff */

/** When each route's loading skeleton last left the screen (performance.now()). */
const routeSkeletonExits = new Map<string, number>()

/**
 * The body of a route's `loading.tsx`. Records the moment it unmounts, which is
 * the moment Next swaps the real page in, so the page can fade the same
 * skeleton out over itself (`SkeletonHandoff`) instead of cutting.
 */
export function RouteSkeleton({
  id,
  label,
  className,
  children,
}: {
  id: string
  label: string
  className?: string
  children: ReactNode
}) {
  useIsoLayoutEffect(() => () => {
    routeSkeletonExits.set(id, performance.now())
  }, [id])
  return (
    <SkeletonGroup label={label} className={className}>
      {children}
    </SkeletonGroup>
  )
}

/**
 * Mounted at the top of a route's content box (which must be `relative`).
 * If that route's `loading.tsx` skeleton left in this same commit, it shows the
 * skeleton once more, absolutely positioned, fading out over 240ms while the
 * content rises through it. On a revisit served from the router cache there was
 * no skeleton, so this stays hidden.
 */
export function SkeletonHandoff({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useIsoLayoutEffect(() => {
    const el = ref.current
    const at = routeSkeletonExits.get(id)
    if (!el || at === undefined || performance.now() - at > 80) return
    el.hidden = false
    indexBlocks(el)
    const t = window.setTimeout(() => {
      el.hidden = true
    }, 260)
    return () => {
      window.clearTimeout(t)
      el.hidden = true
    }
  }, [id])
  return (
    <div ref={ref} hidden aria-hidden className={cn("sk-leaving", className)}>
      {children}
    </div>
  )
}
