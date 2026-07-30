"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

/** Per device, per browser. Not per account: it is the device that shows it. */
const SEEN_KEY = "trackd:calculator-disclaimer-seen"
const SEEN_EVENT = "trackd:calculator-disclaimer-seen-changed"

/**
 * `true` when this device has already been shown the notice. Storage being
 * unavailable (private mode, cookies off) also reads as seen: a notice we could
 * never remember dismissing would reappear on every single visit, and the
 * permanent disclaimer at the bottom of the page still carries the standing line.
 */
function getSeen(): boolean {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1"
  } catch {
    return true
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1")
  } catch {
    /* storage off — the in-session flag below still closes the dialog */
  }
  window.dispatchEvent(new CustomEvent(SEEN_EVENT))
}

function subscribeSeen(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(SEEN_EVENT, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(SEEN_EVENT, cb)
    window.removeEventListener("storage", cb)
  }
}

/**
 * The one-time notice on the calculator's first open (spec 07). Copy approved by
 * Adrian, 2026-07-30.
 *
 * It does NOT replace the permanent disclaimer at the bottom of the page, which
 * renders on every visit regardless. This is the first-open framing; that is the
 * standing legal line.
 *
 * Dismissal is the button or Escape, never a backdrop tap: a stray touch on the
 * scrim should not count as having read it. Escape stays because a modal with no
 * keyboard exit is a trap.
 *
 * Read through `useSyncExternalStore` rather than an effect, per the house idiom
 * (`useMounted`, the week strip): the server snapshot is "seen", so SSR and the
 * hydration render agree on showing nothing, and the real answer arrives on the
 * next render without a set-state-in-effect or a flash of the wrong state.
 *
 * Portalled to `<body>` for the same reason the sign-out confirm is: inside the
 * page's `animate-home-up` wrapper, a transformed ancestor contains `position:
 * fixed` and traps z-index in its own stacking context, which would drop the
 * dialog behind the fixed bottom nav.
 */
export function FirstRunDisclaimer() {
  const seen = useSyncExternalStore(subscribeSeen, getSeen, () => true)
  // Belt and braces: if the write above is refused, `seen` never flips and the
  // dialog would have no way to close. This flag is what actually dismisses it.
  const [dismissed, setDismissed] = useState(false)
  const open = !seen && !dismissed
  const buttonRef = useRef<HTMLButtonElement>(null)

  const dismiss = useCallback(() => {
    setDismissed(true)
    markSeen()
  }, [])

  useEffect(() => {
    if (!open) return
    buttonRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, dismiss])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calc-disclaimer-title"
        aria-describedby="calc-disclaimer-body"
        className="w-full max-w-xs rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
      >
        <h2
          id="calc-disclaimer-title"
          className="text-base font-medium text-foreground"
        >
          A calculator, not advice
        </h2>
        <p
          id="calc-disclaimer-body"
          className="mt-1.5 text-sm leading-relaxed text-text-muted"
        >
          This does arithmetic on the numbers you type, nothing more. It does not
          know your compound, your vial, or your dose. Check every figure against
          the product in your hand before you draw.
        </p>
        <button
          ref={buttonRef}
          type="button"
          onClick={dismiss}
          className="mt-5 w-full rounded-xl bg-accent-primary py-2.5 text-sm font-medium text-bg-base transition-opacity hover:opacity-90"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  )
}
