"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { useMounted } from "@/components/home/useMounted"
import { cn } from "@/lib/utils"

interface PageScrollTitleProps {
  /** The page name — shown as the large heading and in the compact bar. */
  title: string
  /** Optional small uppercase line above the title (e.g. the date on Home). */
  eyebrow?: string
  /** Optional muted line below the title (a short page descriptor). */
  subtitle?: string
  /**
   * Optional control rendered inline to the right of the large heading (e.g. the
   * calendar shortcut on Home). It scrolls away with the heading; the compact bar
   * stays a clean centred title.
   */
  action?: ReactNode
}

/**
 * The shared "main page" header used on every bottom-nav tab root (Home,
 * Protocol, Progress, Profile) — NOT on sub-pages. A large heading scrolls away
 * with the content; once it leaves the top, a slim title bar fades in (the
 * MacroFactor pattern). Nothing else is sticky.
 *
 * The fade-in bar is rendered through a PORTAL to <body> so it stays pinned to
 * the viewport even when an ancestor uses a CSS transform (the page entrance
 * animations do) — a transformed ancestor would otherwise trap a fixed child.
 *
 * Drop it at the top of a tab's main page and pass the page name; the behaviour
 * comes for free as those pages are built out.
 */
export function PageScrollTitle({ title, eyebrow, subtitle, action }: PageScrollTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [compact, setCompact] = useState(false)
  const mounted = useMounted()

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      ([entry]) => setCompact(!entry.isIntersecting),
      { threshold: 0 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const bar = (
    <div
      aria-hidden={!compact}
      className={cn(
        "fixed inset-x-0 top-0 z-40 hairline-b bg-bg-base/80 backdrop-blur transition-opacity duration-300 ease-out",
        compact ? "opacity-100" : "pointer-events-none opacity-0"
      )}
      style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
    >
      <p className="pb-2.5 text-center text-base font-medium text-foreground">
        {title}
      </p>
    </div>
  )

  return (
    <>
      {mounted ? createPortal(bar, document.body) : null}

      {/* The scrolling heading (the fade-in's sentinel). */}
      <div className="px-1">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1
            ref={ref}
            className="font-sans text-4xl font-light tracking-tight text-foreground"
          >
            {title}
          </h1>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {subtitle ? (
          <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>
        ) : null}
      </div>
    </>
  )
}
