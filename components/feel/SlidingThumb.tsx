"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type RefObject,
} from "react"

import { cn } from "@/lib/utils"

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

/** What marks the selected item inside a thumb group. */
const ACTIVE =
  ':scope [aria-pressed="true"], :scope [aria-checked="true"], :scope [data-thumb-on="true"]'

/**
 * The item's layout box relative to `container`, ignoring transforms.
 *
 * `offsetLeft` rather than `getBoundingClientRect`, because the pill being
 * measured is usually mid-press (scaled to 0.94) at the exact moment it is
 * selected, and a transformed rect would fit the thumb to the shrunken pill.
 */
function boxIn(item: HTMLElement, container: HTMLElement) {
  let left = 0
  let top = 0
  let el: HTMLElement | null = item
  while (el && el !== container) {
    left += el.offsetLeft
    top += el.offsetTop
    const parent = el.offsetParent as HTMLElement | null
    // The container is not on the offset chain (it is not positioned): stop,
    // the numbers so far are the best available.
    if (parent && !container.contains(parent) && parent !== container) break
    el = parent
  }
  return { left, top, width: item.offsetWidth, height: item.offsetHeight }
}

/**
 * The journal's sliding thumb (`MarkerDialer`'s `WordScale`), made shared
 * (feel pass §6): a surface measured from the selected pill that glides
 * left/top/width/height over 300ms ease-out when the selection moves.
 *
 * - **No slide on first placement.** The thumb appears where it belongs.
 * - **It re-fits** when the selected pill changes size (a pad chip whose value
 *   grows) and snaps when the whole group resizes (rotation, fonts landing).
 * - **Reduced motion:** no transition (CSS).
 *
 * `selection` is anything that changes when the selected item does; the item
 * itself is found by `aria-pressed` / `aria-checked` / `data-thumb-on`.
 */
export function useSlidingThumb(
  containerRef: RefObject<HTMLElement | null>,
  thumbRef: RefObject<HTMLElement | null>,
  selection: unknown,
  /** What marks the selected item, when `aria-pressed` would match a wrapper. */
  activeSelector: string = ACTIVE,
) {
  const placed = useRef(false)

  useIsoLayoutEffect(() => {
    const container = containerRef.current
    const thumb = thumbRef.current
    if (!container || !thumb) return

    const find = () => container.querySelector<HTMLElement>(activeSelector)
    const place = (animate: boolean) => {
      const item = find()
      if (!item || item.offsetWidth === 0) {
        thumb.style.opacity = "0"
        placed.current = false
        delete container.dataset.thumbReady
        return
      }
      const b = boxIn(item, container)
      const instant = !animate || !placed.current
      if (instant) thumb.style.transition = "none"
      thumb.style.left = `${b.left}px`
      thumb.style.top = `${b.top}px`
      thumb.style.width = `${b.width}px`
      thumb.style.height = `${b.height}px`
      thumb.style.opacity = "1"
      // Until this is set (a server render, before hydration) the group can
      // paint its own selection (the `[&:not([data-thumb-ready])>[aria-checked=true]]`
      // class on the group, as the segmented rails use it).
      container.dataset.thumbReady = "true"
      if (instant) {
        // Read once so the jump commits before the transition comes back.
        void thumb.offsetWidth
        thumb.style.transition = ""
      }
      placed.current = true
    }

    place(true)

    if (typeof ResizeObserver === "undefined") return
    let item = find()
    // A ResizeObserver reports every target once as soon as it is observed, so
    // "the group was reported" is not "the group resized": compare sizes, or
    // that first report snaps the thumb mid-glide.
    let groupW = container.offsetWidth
    let groupH = container.offsetHeight
    const ro = new ResizeObserver(() => {
      const w = container.offsetWidth
      const h = container.offsetHeight
      // The group itself resized: snap. Only the pill changed size: glide.
      const groupResized = w !== groupW || h !== groupH
      groupW = w
      groupH = h
      place(!groupResized)
    })
    ro.observe(container)
    if (item) ro.observe(item)
    // The selected item can change without React re-running this effect (a
    // parent re-render that only flips aria-pressed); follow it.
    const mo = new MutationObserver(() => {
      const next = find()
      if (next === item) return
      if (item) ro.unobserve(item)
      item = next
      if (item) ro.observe(item)
      place(true)
    })
    mo.observe(container, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-pressed", "aria-checked", "data-thumb-on"],
    })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [containerRef, thumbRef, selection, activeSelector])
}

type ThumbGroupProps = ComponentPropsWithoutRef<"div"> & {
  /** Anything that changes when the selected item does. */
  selection: unknown
  /** The thumb's paint: its surface and radius (e.g. `rounded-full bg-bg-surface-raised`). */
  thumbClassName: string
  children: ReactNode
}

/**
 * A pill group with a sliding thumb. The children are the pills, each with
 * `aria-pressed` (or `aria-checked`); the selected one should carry NO
 * background of its own, because the thumb is the selection.
 */
export function ThumbGroup({
  selection,
  thumbClassName,
  className,
  children,
  ...rest
}: ThumbGroupProps) {
  const ref = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  useSlidingThumb(ref, thumbRef, selection)
  return (
    <div ref={ref} className={cn("thumb-group relative isolate", className)} {...rest}>
      <span ref={thumbRef} aria-hidden className={cn("pill-thumb", thumbClassName)} />
      {children}
    </div>
  )
}

/** The thumb element on its own, for a group that cannot be a `ThumbGroup`. */
export function PillThumb({
  thumbRef,
  className,
}: {
  thumbRef: RefObject<HTMLSpanElement | null>
  className: string
}) {
  return <span ref={thumbRef} aria-hidden className={cn("pill-thumb", className)} />
}
