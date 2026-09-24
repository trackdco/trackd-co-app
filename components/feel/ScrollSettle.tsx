"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * THE SCROLL SETTLE, "Lighter" (Adrian, 2026-09-24; ui-context → Scroll). The
 * page keeps its native scroll and edge bounce; on top of it every card is
 * nudged by the scroll and springs back a beat behind, softer the nearer it sits
 * to the middle of the screen. Ported from the whole-app preview's
 * `nativeSettle`, whose constants are already the Lighter setting (0.6 of Light).
 *
 * A card is a screen's top-level `data-area` block, or, on a page without them,
 * a direct child of its `data-screen` root. The title, anything sticky or fixed,
 * and anything holding a fixed layer are left alone: moving an ancestor of a
 * fixed element would carry it along.
 *
 * It writes the CSS `translate` property, not `transform`, so it composes with
 * a card's own animations instead of overriding them. Phones only (a coarse
 * pointer) and never under reduced motion.
 */
const NEAR = 0.03
const FAR = 0.09
const CLAMP = 16
const W = 0.032
const Z = 0.82
const RECOLLECT_MS = 1000

interface Item {
  el: HTMLElement
  o: number
  v: number
}

function eligible(el: HTMLElement): boolean {
  if (el.dataset.area === "title") return false
  const pos = getComputedStyle(el).position
  if (pos === "fixed" || pos === "sticky") return false
  return !el.querySelector("[data-track-bar], .shortcuts-layer, [data-no-settle]")
}

function collect(): HTMLElement[] {
  const root = document.querySelector<HTMLElement>("[data-screen]")
  if (!root) return []
  const areas = [...root.querySelectorAll<HTMLElement>("[data-area]")].filter(
    (el) => !el.parentElement?.closest("[data-area]"),
  )
  const cards = areas.length > 0 ? areas : ([...root.children] as HTMLElement[])
  return cards.filter(eligible)
}

export function ScrollSettle() {
  const pathname = usePathname()

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let items: Item[] = []
    let collectedAt = 0
    let last = window.scrollY
    let raf = 0
    let lt = 0

    const refresh = () => {
      const els = collect()
      const keep = new Map(items.map((s) => [s.el, s]))
      for (const s of items) if (!els.includes(s.el)) s.el.style.removeProperty("translate")
      items = els.map((el) => keep.get(el) ?? { el, o: 0, v: 0 })
      collectedAt = performance.now()
    }

    const step = (t: number) => {
      let dt = Math.min(40, t - lt)
      lt = t
      let moving = false
      while (dt > 0) {
        const h = Math.min(4, dt)
        dt -= h
        for (const s of items) {
          const a = -W * W * s.o - 2 * Z * W * s.v
          s.v += a * h
          s.o += s.v * h
        }
      }
      for (const s of items) {
        if (Math.abs(s.o) < 0.05) s.el.style.removeProperty("translate")
        else s.el.style.translate = `0 ${s.o.toFixed(2)}px`
        if (Math.abs(s.o) > 0.05 || Math.abs(s.v) > 0.002) moving = true
      }
      raf = moving ? requestAnimationFrame(step) : 0
    }

    const onScroll = () => {
      const y = window.scrollY
      const d = y - last
      last = y
      if (performance.now() - collectedAt > RECOLLECT_MS) refresh()
      const vh = window.innerHeight
      const mid = vh / 2
      for (const s of items) {
        const r = s.el.getBoundingClientRect()
        const c = r.top + r.height / 2 - s.o
        const f = NEAR + FAR * Math.min(1, Math.abs(c - mid) / vh)
        s.o = Math.max(-CLAMP, Math.min(CLAMP, s.o + d * f))
      }
      if (!raf) {
        lt = performance.now()
        raf = requestAnimationFrame(step)
      }
    }

    refresh()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
      for (const s of items) s.el.style.removeProperty("translate")
    }
  }, [pathname])

  return null
}
