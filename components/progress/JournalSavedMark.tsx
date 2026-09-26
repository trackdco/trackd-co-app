"use client"

import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

/** How long the mark stays before it fades. */
const SHOWN_MS = 2400

/**
 * "SAVED", IN PLACE (W10, Adrian 26 Sep: saving an entry must not jump the
 * page; "a small tick in the journal section instead"). A small tick that
 * lifts and draws in (the log's tick-lift and tick-draw), the word "Saved"
 * beside it, and after a couple of seconds it fades away where it stands.
 * Nothing moves around it. Announced once, politely.
 *
 * Give it a new `key` for each save, so a second save plays it again.
 */
export function JournalSavedMark({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const t = setTimeout(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 160 : 320, easing: "ease-in", fill: "forwards" })
      el.setAttribute("aria-hidden", "true")
    }, SHOWN_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <span ref={ref} role="status" className={cn("inline-flex items-center gap-1 text-[11px] text-text-muted", className)}>
      <svg viewBox="0 0 24 24" className="tick-lift tick-draw h-3 w-3 text-foreground" aria-hidden>
        <path
          d="M5.5 12.6l4.1 4.1L18.6 7.6"
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Saved
    </span>
  )
}
