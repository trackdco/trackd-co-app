"use client"

import { useRef, useState } from "react"

import { cn } from "@/lib/utils"
import {
  dateKeyToDate,
  type DateKey,
  type DayStatus,
} from "@/lib/home/mockHomeData"

interface ConsistencyStripProps {
  /** Trailing ~30 days, oldest → newest. Derived from `consistency`. */
  items: { key: DateKey; status: DayStatus }[]
  todayKey: DateKey
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

const STATUS_LABEL: Record<DayStatus, string> = {
  logged: "All logged",
  partial: "Partial",
  missed: "Missed",
  future: "Upcoming",
}

function shortDate(key: DateKey): string {
  const d = dateKeyToDate(key)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

/**
 * The long-term compliance read folded into the cycle section: one small cell
 * per day over the last ~30 days. Neutral by design — a logged day is a filled
 * cell, a missed day a faint one; never green=good / red=bad.
 *
 * Press-and-hold and drag across the strip to scrub: a floating label shows the
 * touched day's date + status, and it clears on release (the same scrub idiom as
 * the weight graph).
 */
export function ConsistencyStrip({ items, todayKey }: ConsistencyStripProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const n = items.length

  const loggedCount = items.filter(
    (d) => d.status === "logged" || d.status === "partial"
  ).length

  // No history yet (blank template / new user) — nothing to scrub.
  if (n === 0) {
    return (
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
          Consistency
        </p>
        <p className="mt-2 text-xs text-text-muted">
          Log your doses to start building your consistency.
        </p>
      </div>
    )
  }

  function indexFromX(clientX: number): number {
    const el = rowRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(n - 1, Math.floor(ratio * n)))
  }

  function handleDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setActiveIndex(indexFromX(e.clientX))
  }

  function handleMove(e: React.PointerEvent) {
    if (activeIndex === null) return
    setActiveIndex(indexFromX(e.clientX))
  }

  function handleUp() {
    setActiveIndex(null)
  }

  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
          Consistency
        </p>
        <p className="font-mono text-xs text-text-muted">
          {loggedCount}/{n} days
        </p>
      </div>

      <div className="relative">
        {activeIndex !== null && (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border-default bg-bg-surface-raised px-2.5 py-1.5 text-center shadow-lg"
            style={{ left: `${((activeIndex + 0.5) / n) * 100}%` }}
          >
            <p className="font-mono text-xs font-semibold text-foreground">
              {shortDate(items[activeIndex].key)}
            </p>
            <p className="text-[11px] text-text-muted">
              {STATUS_LABEL[items[activeIndex].status]}
            </p>
          </div>
        )}

        <div
          ref={rowRef}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          className="flex items-end gap-[3px]"
          style={{ touchAction: "pan-y" }}
        >
          {items.map(({ key, status }, i) => (
            <span
              key={key}
              aria-hidden
              className={cn(
                "h-6 flex-1 rounded-[3px] transition-transform",
                status === "logged" && "bg-text-primary",
                status === "partial" && "bg-text-muted",
                status === "missed" && "bg-border-strong",
                status === "future" && "bg-bg-surface-raised",
                key === todayKey && "ring-1 ring-accent-amber/60",
                i === activeIndex && "scale-y-110 ring-1 ring-accent-amber"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
