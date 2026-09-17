"use client"

import { useLayoutEffect, useRef, type RefObject } from "react"

/**
 * A one-line figure that is too long for its field steps its font down until
 * it fits, rather than being cut off (feel pass §3). A clipped "10000" reads as
 * "1000", and an ellipsis swaps a digit for "…": both are wrong figures. The
 * font comes back up as soon as there is room again.
 *
 * Put the ref on the element holding the value as its FIRST text node (the
 * caret after it takes no width, see `.pad-value`), inside a box whose width
 * does not follow its content.
 */
export function useFitText<T extends HTMLElement>(value: string): RefObject<T | null> {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ""
      const text = el.firstChild
      if (!(text instanceof Text) || !text.data) return
      const range = document.createRange()
      range.selectNodeContents(text)
      // Both as rects: fractional, and scaled alike while the field is pressed.
      const need = range.getBoundingClientRect().width
      const room = el.getBoundingClientRect().width
      if (room <= 0 || need <= room + 0.5) return
      const base = parseFloat(getComputedStyle(el).fontSize)
      el.style.fontSize = `${Math.max(10, Math.floor(((base * room) / need) * 2) / 2)}px`
    }
    fit()
    let live = true
    // Widths change once the mono face has loaded.
    void document.fonts?.ready.then(() => {
      if (live) fit()
    })
    const box = el.parentElement
    const ro = box && typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null
    if (box) ro?.observe(box)
    return () => {
      live = false
      ro?.disconnect()
    }
  }, [value])
  return ref
}
