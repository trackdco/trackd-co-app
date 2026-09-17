"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
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

/** One skeleton block. `w` is any CSS length; `h` is px (omit it to size by class). */
export function Sk({
  w = "100%",
  h,
  round = false,
  className,
  style,
}: {
  w?: string
  h?: number
  round?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      aria-hidden
      className={cn("sk block", round ? "rounded-full" : "rounded-md", className)}
      style={{ width: w, ...(h === undefined ? {} : { height: h }), ...style }}
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
  still = false,
  children,
}: {
  label: string
  className?: string
  /** Already on screen (a route's skeleton handed over): no fade in. */
  still?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useIsoLayoutEffect(() => {
    if (ref.current) indexBlocks(ref.current)
  }, [])
  return (
    <div
      ref={ref}
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn("sk-wrap", still && "sk-wrap-still", className)}
    >
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
 * FLAT: the content is rendered with no wrapper, because a screen's desktop
 * grid places its cards as direct children. The parent must be `relative`.
 * Content that is ready on the first render shows at once, with no skeleton.
 */
export function SkeletonSwap({
  ready,
  skeleton,
  skeletonClassName,
  leaveOnMount = false,
  children,
}: {
  ready: boolean
  skeleton: ReactNode
  /** On the box that holds the skeleton (and its leaving copy). */
  skeletonClassName?: string
  /**
   * Ready at once, but a route skeleton was just on screen: fade it out over
   * the content rather than cutting to it.
   */
  leaveOnMount?: boolean
  children: ReactNode
}) {
  const [leaving, setLeaving] = useState(ready && leaveOnMount)
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

  if (!ready) {
    return (
      <div data-area="full" className={skeletonClassName}>
        {skeleton}
      </div>
    )
  }
  return (
    <>
      {leaving ? <LeavingSkeleton className={skeletonClassName}>{skeleton}</LeavingSkeleton> : null}
      {children}
    </>
  )
}

/**
 * The skeleton on its way out, laid exactly over the first real card: that
 * card starts where the skeleton did. `offsetTop` ignores the card's rise, so
 * the skeleton stays still while the content moves up through it.
 */
function LeavingSkeleton({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useIsoLayoutEffect(() => {
    const el = ref.current
    const anchor = el?.nextElementSibling as HTMLElement | null
    if (!el || !anchor) return
    el.style.top = `${anchor.offsetTop}px`
    el.style.left = `${anchor.offsetLeft}px`
    el.style.width = `${anchor.offsetWidth}px`
    el.style.right = "auto"
    indexBlocks(el)
  }, [])
  return (
    <div ref={ref} aria-hidden className={cn("sk-leaving", className)}>
      {children}
    </div>
  )
}

/* ------------------------------------------------ route loading → page handoff */

/**
 * Which routes' `loading.tsx` skeletons are on screen right now, and which
 * have been on screen and may be handing over to their page.
 *
 * Next swaps a route's loading fallback for its page in one commit. The page
 * RENDERS while the fallback is still mounted, so a flag set by the fallback is
 * readable in the page's first render; the fallback clears it a tick after it
 * unmounts, so a later visit served from the router cache (no fallback) never
 * sees a stale one. The count keeps React's dev double-mount from clearing it.
 */
const skeletonsMounted = new Map<string, number>()
const skeletonsShown = new Set<string>()

/**
 * The body of a route's `loading.tsx`. Its group fades in without moving, and
 * it tells the page it is standing in for (see `useArrivedFromSkeleton`).
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
  useIsoLayoutEffect(() => {
    skeletonsMounted.set(id, (skeletonsMounted.get(id) ?? 0) + 1)
    skeletonsShown.add(id)
    return () => {
      skeletonsMounted.set(id, Math.max(0, (skeletonsMounted.get(id) ?? 1) - 1))
      window.setTimeout(() => {
        if (!skeletonsMounted.get(id)) skeletonsShown.delete(id)
      }, 0)
    }
  }, [id])
  return (
    <SkeletonGroup label={label} className={className}>
      {children}
    </SkeletonGroup>
  )
}

/**
 * Did this page just replace its route's loading skeleton? Read once, on the
 * first render. When true the page's title is already on screen (the fallback
 * drew it), so it must not fade in again, and the skeleton should leave over
 * the content (`RouteSkeletonLeaving`) instead of cutting. A revisit served
 * from the router cache reads false: the screen simply arrives.
 */
export function useArrivedFromSkeleton(id: string): boolean {
  const [arrived] = useState(() => skeletonsShown.has(id))
  return arrived
}

const noSubscribe = () => () => {}

/**
 * Is the route's skeleton (its title, its blocks) ALREADY on screen as this
 * page mounts? For what must not fade in a second time.
 *
 * Wider than `useArrivedFromSkeleton`: on a full page load (a reload, a Safari
 * tab, a cold PWA launch) the loading fallback arrives in the streamed HTML and
 * is never hydrated, so it registers nothing, and the page's HTML then replaces
 * a title that is already visible. So this reads true on the server and during
 * hydration. It is frozen at mount, so hydration finishing does not add a fade
 * class back. The leaving overlay keeps the strict read: a server render cannot
 * place it.
 */
export function useSkeletonOnScreen(id: string): boolean {
  const hydrating = useSyncExternalStore(
    noSubscribe,
    () => false,
    () => true,
  )
  const [onScreen] = useState(() => hydrating || skeletonsShown.has(id))
  return onScreen
}

/**
 * The route skeleton on its way out, over the page's content (feel pass §1).
 * Place it directly BEFORE the first content block, inside a `relative`
 * screen; it lays itself over that block and fades out over 240ms while the
 * content rises through it. Renders nothing unless `show`.
 */
export function RouteSkeletonLeaving({
  show,
  className,
  children,
}: {
  show: boolean
  className?: string
  children: ReactNode
}) {
  const [visible, setVisible] = useState(show)
  useEffect(() => {
    if (!visible) return
    const t = window.setTimeout(() => setVisible(false), 260)
    return () => window.clearTimeout(t)
  }, [visible])
  if (!visible) return null
  return <LeavingSkeleton className={className}>{children}</LeavingSkeleton>
}
