"use client"

import { useEffect } from "react"

import {
  PRESS_RELEASE_MS,
  PRESS_ROW_PART,
  PRESS_SELECTOR,
  movedPastSlop,
  pressDelayFor,
  releaseDelay,
  variantOf,
} from "@/lib/feel/press"

/**
 * THE PRESS SYSTEM'S ONE LISTENER (feel pass §2). Mounted once, in the root
 * layout; renders nothing.
 *
 * `pointerdown` on anything carrying a `press-<variant>` class puts
 * `data-pressed` on it (after 45ms for rows and cards, at once for keys, ticks
 * and the rest). On release it stays on until it has been visible for at least
 * 110ms, then `data-press-release` carries the 180ms return. A cancel, or more
 * than 10px of travel, drops it at once: that was a scroll, not a press.
 *
 * Why an attribute for the state: React rewrites `className` whenever the
 * component renders, and most taps DO make it render (a pill selects, a row
 * opens a sheet), so a class added here would vanish mid-press and the release
 * would snap. React never touches an attribute it did not set.
 *
 * What each variant LOOKS like is CSS only (`globals.css`, "PRESS").
 */
export function PressFeedback() {
  useEffect(() => {
    type Timers = { apply?: number; release?: number; clear?: number }
    const timers = new WeakMap<Element, Timers>()
    let host: Element | null = null
    let pointerId = -1
    let appliedAt = 0
    let x0 = 0
    let y0 = 0

    const timersOf = (el: Element): Timers => {
      let t = timers.get(el)
      if (!t) {
        t = {}
        timers.set(el, t)
      }
      return t
    }
    const clearTimers = (el: Element) => {
      const t = timers.get(el)
      if (!t) return
      window.clearTimeout(t.apply)
      window.clearTimeout(t.release)
      window.clearTimeout(t.clear)
      timers.delete(el)
    }
    const apply = (el: Element) => {
      el.removeAttribute("data-press-release")
      el.setAttribute("data-pressed", "")
      appliedAt = performance.now()
    }
    const release = (el: Element) => {
      el.removeAttribute("data-pressed")
      el.setAttribute("data-press-release", "")
      timersOf(el).clear = window.setTimeout(() => {
        el.removeAttribute("data-press-release")
        timers.delete(el)
      }, PRESS_RELEASE_MS)
    }

    const isDisabled = (el: Element) =>
      el.matches(":disabled, [aria-disabled='true']") || el.closest("[inert]") !== null

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary) return
      if (e.pointerType === "mouse" && e.button !== 0) return
      const target = e.target
      if (!(target instanceof Element)) return
      const hit = target.closest(PRESS_SELECTOR)
      if (!hit || isDisabled(hit)) return
      // A row part presses its row, not itself.
      const el = hit.classList.contains(PRESS_ROW_PART) ? hit.closest(".press-row") : hit
      if (!el) return
      const variant = variantOf(el.classList)
      if (!variant) return

      if (host && host !== el) cancel()
      clearTimers(el)
      host = el
      pointerId = e.pointerId
      x0 = e.clientX
      y0 = e.clientY
      appliedAt = 0
      const delay = pressDelayFor(variant)
      if (delay === 0) apply(el)
      else timersOf(el).apply = window.setTimeout(() => apply(el), delay)
    }

    const onUp = (e: PointerEvent) => {
      if (!host || e.pointerId !== pointerId) return
      const el = host
      host = null
      window.clearTimeout(timersOf(el).apply)
      // A tap quicker than the row's 45ms wait still shows its press.
      if (!appliedAt) apply(el)
      timersOf(el).release = window.setTimeout(
        () => release(el),
        releaseDelay(appliedAt, performance.now()),
      )
    }

    const cancel = () => {
      if (!host) return
      const el = host
      host = null
      clearTimers(el)
      el.removeAttribute("data-pressed")
      el.removeAttribute("data-press-release")
    }

    const onMove = (e: PointerEvent) => {
      if (!host || e.pointerId !== pointerId) return
      if (movedPastSlop(e.clientX - x0, e.clientY - y0)) cancel()
    }

    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId) cancel()
    }

    const opts = { capture: true, passive: true } as const
    document.addEventListener("pointerdown", onDown, opts)
    document.addEventListener("pointerup", onUp, opts)
    document.addEventListener("pointermove", onMove, opts)
    document.addEventListener("pointercancel", onCancel, opts)
    return () => {
      document.removeEventListener("pointerdown", onDown, opts)
      document.removeEventListener("pointerup", onUp, opts)
      document.removeEventListener("pointermove", onMove, opts)
      document.removeEventListener("pointercancel", onCancel, opts)
    }
  }, [])

  return null
}
