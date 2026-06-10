"use client"

import { cn } from "@/lib/utils"
import type { DateKey, DayStatus } from "@/lib/home/mockHomeData"

export interface WeekDay {
  key: DateKey
  date: Date
}

interface WeekStripProps {
  days: WeekDay[]
  selectedKey: DateKey
  todayKey: DateKey
  statusOf: (key: DateKey) => DayStatus
  onSelect: (key: DateKey) => void
}

// Sun-first initials, indexed by Date.getDay(); the row itself runs Mon → Sun.
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"]

const STATUS_LABEL: Record<DayStatus, string> = {
  logged: "all doses logged",
  partial: "some doses logged",
  missed: "nothing logged",
  none: "no doses",
  future: "upcoming",
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

/**
 * The sticky week strip (Mon–Sun). Selected day is amber, today carries a faint
 * ring, the rest are gray; each cell shows a derived status dot. Tapping a day
 * lifts the selection to HomeScreen, which re-scopes the content beneath. Dots
 * derive entirely from `statusOf` (backed by `consistency`) — there is no
 * separate week array to drift out of sync.
 */
export function WeekStrip({
  days,
  selectedKey,
  todayKey,
  statusOf,
  onSelect,
}: WeekStripProps) {
  return (
    <div className="grid grid-cols-7">
      {days.map(({ key, date }) => {
        const selected = key === selectedKey
        const isToday = key === todayKey
        const status = statusOf(key)
        return (
          <button
            key={key}
            type="button"
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
                  ? "bg-accent-amber font-semibold text-bg-base"
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
  )
}
