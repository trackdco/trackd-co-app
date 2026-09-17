"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { CommandPalette } from "@/components/desktop/CommandPalette"
import { DESKTOP_QUERY } from "@/lib/desktop/breakpoint"

/**
 * Number keys to their screens. Same order as the sidebar, because the sidebar
 * prints these keys beside each item and the two must agree.
 */
const JUMP: Record<string, string> = {
  "1": "/dashboard",
  "2": "/protocol",
  "3": "/calculator",
  "4": "/progress",
  "5": "/calendar",
  "6": "/profile",
}

/**
 * True when something modal is open over the page.
 *
 * A cold review found the hole: with the log-dose sheet open, pressing `5`
 * navigated to Calendar while the sheet stayed mounted over it, and because
 * Radix pins `pointer-events: none` on the body for an open modal, the sidebar
 * and the rail were both dead. Escape recovered, but nothing said so.
 *
 * It only missed the review's earlier passes because it depends on whether the
 * open sheet happens to autofocus a text field. "Log weight" does, so
 * {@link isTyping} covered it; "Log a dose" does not, so nothing did.
 *
 * Three sources, and each is a real one rather than a guess at the DOM:
 *  - every one of the app's 40 sheets renders `[data-slot="sheet-content"]` and
 *    Radix stamps `data-state` on it;
 *  - the command palette and the quick-actions layer both carry
 *    `role="dialog"` with `aria-modal` while open;
 *  - `body[data-inline-edit="true"]` is the in-place edit flag (globals.css
 *    uses the same attribute to stand the FAB down). Navigating out of an open
 *    edit would discard it, which is worse than the dead-pointer bug.
 */
function modalOpen(): boolean {
  if (typeof document === "undefined") return false
  return Boolean(
    document.querySelector('[data-slot="sheet-content"][data-state="open"]') ||
      document.querySelector('[role="dialog"][aria-modal="true"]') ||
      // The Trackd number pad, open on a page (the Weight screen, the
      // Calculator): leaving would throw the figure away.
      document.querySelector("[data-pad-layer]") ||
      document.body.dataset.inlineEdit === "true",
  )
}

/**
 * True when the keystroke belongs to whatever the user is typing into.
 *
 * Without this, typing a dose of "4 mg" into a field navigates to Progress
 * mid-word. `isContentEditable` covers the journal editor; the `closest`
 * check covers a custom control that has put focus on a wrapper rather than on
 * the input itself.
 */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable ||
    // A number field is a button that opens the Trackd pad (feel pass §3);
    // typing on it is typing.
    Boolean(el.closest?.("input, textarea, select, [contenteditable='true'], .pad-input, [data-pad-field]"))
  )
}

/**
 * The keyboard layer. Renders nothing but the palette it owns.
 *
 * ## Why every handler starts by asking the media query
 *
 * This component is mounted by the (app) layout, so it is mounted on a phone
 * too. A phone has no keyboard shortcuts to offer and a Bluetooth keyboard
 * attached to one should not start teleporting somebody between tabs, so each
 * handler checks {@link DESKTOP_QUERY} before doing anything. Checking inside
 * the handler rather than gating the `useEffect` means a laptop that changes
 * pointer type mid-session (a trackpad unplugged from an iPad) is correct
 * immediately, with no listener to tear down and re-add.
 *
 * ## What is deliberately NOT here
 *
 * No single-key shortcut writes anything. `L` for "log the next dose" was drawn
 * in the proposal and is not built: a bare letter that records a dose is one
 * mistyped keystroke away from a false entry in someone's medical log, and the
 * undo for it lives two screens away. Logging stays a deliberate act through the
 * rail or the palette, both of which open the normal sheet with its normal
 * confirm. Navigation and search are safe to make instant because neither
 * changes data.
 */
export function DesktopKeyboard() {
  const router = useRouter()
  const [paletteOpen, setPaletteOpen] = useState(false)

  const desktop = useCallback(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
    [],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!desktop()) return

      // Command palette. Cmd+K on a Mac, Ctrl+K everywhere else.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }

      // Everything below is a bare key, so it must never fire while the user is
      // typing, never while a modifier is held (Cmd+1 is "switch browser tab"
      // and taking it would be rude), and never out from under an open sheet,
      // dialog or in-place edit.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target) || modalOpen()) return

      const href = JUMP[e.key]
      if (href) {
        e.preventDefault()
        router.push(href)
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [desktop, router])

  /* MOUNTED only while open, rather than mounted-and-returning-null. That is
     what lets the palette hold no state between openings: a fresh mount cannot
     carry a stale query or a stale highlight, so it needs no effect to clear
     them. */
  return paletteOpen ? <CommandPalette onOpenChange={setPaletteOpen} /> : null
}
