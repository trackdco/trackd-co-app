"use client"

import { useLayoutEffect, useRef, useState } from "react"

import { canTakeFocus } from "@/components/feel/PopDialog"
import { FOCUSABLE, focusHandoff, SHEET_CONTENT } from "@/lib/feel/overlay"
import { CLOSE_ARROW, PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/** A control focus can go back to: still on the page, reachable by Tab, and
 *  not hidden from screen readers (a twin stepping back is). */
function canReturnTo(el: HTMLElement): boolean {
  return el.isConnected && el.matches(FOCUSABLE) && canTakeFocus(el) && !el.closest('[aria-hidden="true"]')
}

/**
 * The arrow hid while it held focus (its panel closed from the keyboard): focus
 * goes back to what opened the panel, else its twin in the same spot, else the
 * next control that can take it, else the one before (`focusHandoff`),
 * inside the sheet it is in. Never left on a button out of the Tab order.
 */
function handFocusOn(arrow: HTMLElement, opener: HTMLElement | null) {
  const root = arrow.closest<HTMLElement>(SHEET_CONTENT) ?? arrow.ownerDocument.body
  const all = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
  const at = all.indexOf(arrow)
  const after = at < 0 ? all : all.slice(at + 1)
  const before = at < 0 ? [] : all.slice(0, at)
  const near = Array.from(arrow.parentElement?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el !== arrow)
  const target = focusHandoff(opener, canReturnTo, after, before, near)
  if (target) target.focus({ preventScroll: true })
  else arrow.blur()
}

/** The up arrow itself, for a caller that draws its own button. */
export function CloseArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 14.5l6-6 6 6" />
    </svg>
  )
}

/**
 * THE ONE CLOSE ARROW (consistency fix #11; build-brief-final §2.4): a 30px
 * rounded square (radius 9) on the ghost surface with an up arrow, for
 * everything that opens in place (the log panel, the half-life card, a type
 * group, the Schedule). While `shown` is false it waits turned and small, and
 * spins in when its panel opens.
 *
 * Drawn at 30px, pressed at 44 (a transparent reach 7px out; cold review D8).
 * While it waits it is out of the way for everyone: faded and untappable,
 * out of the Tab order, and hidden from screen readers, which would otherwise
 * hear it twice beside its twin (cold review S4).
 *
 * FOCUS NEVER STAYS ON IT AS IT HIDES (S4). Closing a panel with the keyboard
 * on this arrow hands focus back to the control that opened the panel (a
 * journal tile, the half-life card, a row's down arrow), or the next one there
 * is, before the arrow leaves the accessibility tree: it keeps no
 * `aria-hidden` for as long as it holds focus. And when its twin in the same
 * spot (FoldArrow's down arrow) steps back holding focus as the panel opens,
 * focus steps onto this arrow, so Enter closes what Enter opened.
 *
 * A CaretRight is for "goes somewhere", never for this.
 */
export function CloseArrow({
  onClick,
  label = "Close",
  shown = true,
  className,
}: {
  onClick: () => void
  label?: string
  /** False while the thing it closes is shut: it waits turned and faded. */
  shown?: boolean
  className?: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  // What had focus when the arrow came in (its panel opening, not a first
  // render already open): where focus goes back as it hides.
  const opener = useRef<HTMLElement | null>(null)
  const wasShown = useRef(shown)
  const [holdsFocus, setHoldsFocus] = useState(false)

  useLayoutEffect(() => {
    const arrow = ref.current
    const cameIn = shown && !wasShown.current
    wasShown.current = shown
    if (!arrow) return
    const active = arrow.ownerDocument.activeElement as HTMLElement | null
    const elsewhere = active && active !== arrow && active !== arrow.ownerDocument.body ? active : null
    if (shown) {
      if (!cameIn) return
      opener.current = elsewhere
      // Its twin in the same spot stepped back (out of the Tab order) with
      // focus on it: focus steps onto the arrow standing in its place.
      if (elsewhere && arrow.parentElement?.contains(elsewhere) && elsewhere.getAttribute("tabindex") === "-1") {
        arrow.focus({ preventScroll: true })
      }
      return
    }
    if (active !== arrow) return
    handFocusOn(arrow, opener.current)
    opener.current = null
  }, [shown])

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onFocus={() => setHoldsFocus(true)}
      onBlur={() => setHoldsFocus(false)}
      aria-label={label}
      tabIndex={shown ? 0 : -1}
      aria-hidden={shown || holdsFocus ? undefined : true}
      data-shown={shown ? "true" : "false"}
      className={cn(PRESS.icon, CLOSE_ARROW, className)}
    >
      <CloseArrowIcon />
    </button>
  )
}
