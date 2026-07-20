"use client"

import { useRef, useState } from "react"

import { cn } from "@/lib/utils"
import type { DateKey, DayStatus } from "@/lib/home/mockHomeData"

export interface WeekDay {
  key: DateKey
  date: Date
}

interface WeekStripProps {
  /** Which week is centred: 0 = current, -1 = last week, +1 = next, … unbounded. */
  weekOffset: number
  /** A given offset's 7 days — lets the strip render the neighbours it slides to. */
  daysForOffset: (offset: number) => WeekDay[]
  selectedKey: DateKey
  todayKey: DateKey
  statusOf: (key: DateKey) => DayStatus
  onSelect: (key: DateKey) => void
  /** Commit a week change (absolute offset) after the slide animation lands. */
  onWeekChange: (offset: number) => void
}

// Sun-first initials, indexed by Date.getDay(); the row itself runs Mon → Sun.
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"]
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

const STATUS_LABEL: Record<DayStatus, string> = {
  logged: "all doses logged",
  partial: "some doses logged",
  missed: "nothing logged",
  none: "no doses",
  future: "upcoming",
}

// Fraction of the strip's width a swipe must travel to commit a week change.
const COMMIT_FRACTION = 0.2

/** Compact range for the displayed week, e.g. "9–15 Jun" or "30 Jun – 6 Jul". */
function weekRangeLabel(days: WeekDay[]): string {
  const a = days[0]?.date
  const b = days[days.length - 1]?.date
  if (!a || !b) return ""
  const aM = MONTHS_SHORT[a.getMonth()]
  const bM = MONTHS_SHORT[b.getMonth()]
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${bM}`
    : `${a.getDate()} ${aM} – ${b.getDate()} ${bM}`
}

/**
 * The per-day status indicator under each date. Logged-vs-missed reads as
 * presence/strength of a neutral dot — never a green/red good/bad judgement
 * (Context/ui-context.md → health data is categorical, never evaluative).
 */
function StatusDot({ status }: { status: DayStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-1.5 w-1.5 rounded-full",
        status === "logged" && "bg-text-primary",
        status === "partial" && "bg-text-muted",
        status === "missed" && "border border-border-strong",
        // A rest day / pre-protocol day and a future day both read as blank —
        // neither is adherence-relevant (A7: a past day is never "Upcoming").
        (status === "none" || status === "future") && "bg-transparent"
      )}
    />
  )
}

// An in-flight slide: which panel to animate to (0 prev · 1 centre · 2 next), the
// absolute offset to commit on landing (null = snap back, no change), and optional
// slot-content overrides so a multi-week "jump" can render its destination in the
// neighbour it slides to (and land seamlessly).
interface Slide {
  to: 0 | 1 | 2
  commit: number | null
  overrideLeft?: number
  overrideRight?: number
}

/**
 * The week strip — a 3-panel carousel ([prev · current · next]) you can swipe
 * across, unbounded in both directions. Dragging follows the finger; past the
 * threshold the track slides to the neighbour and re-centres on the new week. The
 * "Jump to this week" caption (shown when off the current week) slides home too.
 * Only three weeks ever render. Tapping a day lifts the selection to HomeScreen.
 */
export function WeekStrip({
  weekOffset,
  daysForOffset,
  selectedKey,
  todayKey,
  statusOf,
  onSelect,
  onWeekChange,
}: WeekStripProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const widthRef = useRef(0)
  const dragXRef = useRef(0)
  const swipedRef = useRef(false)

  const [dragX, setDragX] = useState(0)
  const [slide, setSlide] = useState<Slide | null>(null)

  function handleDown(e: React.PointerEvent) {
    if (slide) return // ignore new gestures mid-slide
    widthRef.current = viewportRef.current?.getBoundingClientRect().width ?? 0
    startRef.current = { x: e.clientX, y: e.clientY }
    swipedRef.current = false
    dragXRef.current = 0
  }

  function handleMove(e: React.PointerEvent) {
    const start = startRef.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (!swipedRef.current) {
      // Claim the gesture only once it's clearly horizontal (vertical scroll passes).
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return
      swipedRef.current = true
    }
    const w = widthRef.current || 1
    const clamped = Math.max(-w, Math.min(w, dx)) // never past one panel
    dragXRef.current = clamped
    setDragX(clamped)
  }

  function handleUp() {
    const start = startRef.current
    startRef.current = null
    if (!start || !swipedRef.current) return
    const dx = dragXRef.current
    const threshold = Math.max(40, (widthRef.current || 1) * COMMIT_FRACTION)
    if (Math.abs(dx) >= threshold) {
      setSlide(
        dx > 0
          ? { to: 0, commit: weekOffset - 1 } // swipe right → previous week
          : { to: 2, commit: weekOffset + 1 } // swipe left → next week
      )
    } else if (Math.abs(dx) > 1) {
      setSlide({ to: 1, commit: null }) // under threshold — ease back to centre
    } else {
      setDragX(0) // negligible move — settle
      dragXRef.current = 0
    }
  }

  // "Jump to this week": slide one panel toward week 0 with this week rendered in
  // the incoming neighbour, so even a multi-week jump lands in one clean slide.
  // Reselect today as we go.
  function handleJump() {
    if (weekOffset === 0 || slide) return
    onSelect(todayKey)
    setSlide(
      weekOffset < 0
        ? { to: 2, commit: 0, overrideRight: 0 } // this week is forward (slide left)
        : { to: 0, commit: 0, overrideLeft: 0 } // this week is back (slide right)
    )
  }

  function handleTransitionEnd(e: React.TransitionEvent) {
    // Only the track's own transform — ignore the day circles' colour transitions.
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return
    if (!slide) return
    const { commit } = slide
    setSlide(null)
    setDragX(0)
    dragXRef.current = 0
    // Commit AFTER the slide: the new week renders centred (-100%) with no
    // transition, landing exactly where the slid-in panel already is — no jump.
    if (commit !== null) onWeekChange(commit)
  }

  // Capture-phase: kill the click that follows a swipe so a drag never selects a day.
  function suppressTapAfterSwipe(e: React.MouseEvent) {
    if (swipedRef.current) {
      e.stopPropagation()
      swipedRef.current = false
    }
  }

  const leftOffset = slide?.overrideLeft ?? weekOffset - 1
  const rightOffset = slide?.overrideRight ?? weekOffset + 1
  const slots = [leftOffset, weekOffset, rightOffset]

  // Track transform — base -100% (centre). Percentages are relative to the track
  // width (= one viewport), since the track is `w-full` with three `w-full` panels.
  const transform = slide
    ? `translateX(-${slide.to * 100}%)`
    : `translateX(calc(-100% + ${dragX}px))`

  return (
    <div>
      <div
        ref={viewportRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onClickCapture={suppressTapAfterSwipe}
        className="touch-pan-y select-none overflow-hidden"
      >
        <div
          className="flex w-full"
          style={{
            transform,
            transition: slide
              ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)"
              : "none",
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          {slots.map((off, i) => {
            const isCentre = i === 1
            return (
              <div key={i} className="w-full shrink-0" aria-hidden={!isCentre}>
                <div className="grid grid-cols-7">
                  {daysForOffset(off).map(({ key, date }) => {
                    const selected = key === selectedKey
                    const isToday = key === todayKey
                    const status = statusOf(key)
                    return (
                      <button
                        key={key}
                        type="button"
                        tabIndex={isCentre ? undefined : -1}
                        onClick={() => onSelect(key)}
                        aria-pressed={selected}
                        aria-label={`${date.toDateString()}, ${STATUS_LABEL[status]}`}
                        className="flex flex-col items-center gap-1 py-1 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-accent-amber/50"
                      >
                        <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                          {DAY_INITIALS[date.getDay()]}
                        </span>
                        <span
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm transition-colors",
                            selected
                              ? "bg-accent-primary font-medium text-bg-base"
                              : isToday
                                ? "text-foreground ring-1 ring-border-strong"
                                : "text-text-primary"
                          )}
                        >
                          {date.getDate()}
                        </span>
                        <StatusDot status={status} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Off the current week — the caption fades + slides down, and its animated
          row height pushes the content below smoothly down (and back up on return).
          Kept mounted so it can animate both ways; the grid-rows 0fr↔1fr transition
          is what grows/shrinks the height. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: weekOffset !== 0 ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            aria-hidden={weekOffset === 0}
            className={cn(
              "flex items-center justify-center gap-2 pt-2 text-xs transition-all duration-300 ease-out",
              weekOffset !== 0
                ? "translate-y-0 opacity-100"
                : "-translate-y-2 opacity-0"
            )}
          >
            <span className="text-text-muted">
              {weekRangeLabel(daysForOffset(weekOffset))}
            </span>
            <span aria-hidden className="text-text-subtle">·</span>
            <button
              type="button"
              tabIndex={weekOffset === 0 ? -1 : undefined}
              onClick={handleJump}
              className="font-medium text-foreground transition-opacity hover:opacity-80"
            >
              Jump to this week
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
