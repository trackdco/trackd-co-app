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
    Boolean(el.closest?.("input, textarea, select, [contenteditable='true']"))
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
      // typing, and never while a modifier is held (Cmd+1 is "switch browser
      // tab" and taking it would be rude).
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return

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
