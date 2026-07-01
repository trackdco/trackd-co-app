"use client"

import { useEffect, useState } from "react"

import { useMounted } from "@/components/home/useMounted"
import { SHEET_TITLE } from "@/lib/ui-presets"

type Period = "morning" | "afternoon" | "evening"

/** Map a 24h hour to its part-of-day greeting word. */
function periodForHour(hour: number): Period {
  if (hour >= 5 && hour < 12) return "morning"
  if (hour >= 12 && hour < 18) return "afternoon"
  return "evening"
}

const GREETING: Record<Period, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
}

/**
 * The home greeting + today's-completion line, sitting under the week strip. The
 * part-of-day word is read from the DEVICE clock, so it must not render on the
 * server (which runs in UTC and would mismatch the client on hydration): we show
 * a neutral "Hello" until mounted, then settle on the time-based greeting, and
 * keep it current on focus/visibility + a 1-minute tick so a session left open
 * rolls morning → afternoon → evening on its own.
 *
 * The completion line tracks doses LOGGED today out of what's scheduled today
 * (a rest day reads "Nothing scheduled today"). It's a neutral progress read of
 * the user's own logging — not a health-data value — so the amber accent
 * (active/interactive state, per ui-context) is on-spec here, the same way
 * Today's Log uses amber for "N due".
 */
export function HomeGreeting({
  firstName,
  loggedToday,
  dueToday,
  paused = false,
}: {
  firstName: string | null
  /** Doses logged today (of the active stack due today). */
  loggedToday: number
  /** Doses scheduled today across the active stack. */
  dueToday: number
  /**
   * Hold the bar's slide while the log sheet covers it (the green "Tracked"
   * confirmation). The fill catches up — visibly sliding — once the sheet drops
   * away, so the animation is actually watched rather than playing hidden.
   */
  paused?: boolean
}) {
  const mounted = useMounted()
  const [period, setPeriod] = useState<Period>("morning")

  // Read the device-local part of day on mount, then keep it honest across a long
  // session: on app foreground/visibility and a 1-minute tick. setState only fires
  // when the word actually changes, so the tick is a no-op in the steady state.
  useEffect(() => {
    const sync = () => setPeriod(periodForHour(new Date().getHours()))
    sync()
    const onVisible = () => {
      if (document.visibilityState === "visible") sync()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", sync)
    const id = window.setInterval(sync, 60_000)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", sync)
      window.clearInterval(id)
    }
  }, [])

  const name = firstName?.trim()
  // Pre-mount fallback so SSR + the first client paint agree (the time-based word
  // lands once mounted, no hydration drift).
  const greeting = mounted ? GREETING[period] : "Hello"

  const allLogged = dueToday > 0 && loggedToday >= dueToday
  const pct = dueToday > 0 ? Math.min(1, loggedToday / dueToday) : 0

  // Slide the bar from empty → its target once the screen has settled, easing in
  // (and re-animate whenever the count changes as doses get logged). Starts at 0
  // each mount so the fill visibly slides rather than snapping into place. While
  // `paused` (the log sheet is up), hold the current fill — the slide would
  // otherwise play hidden behind the green "Tracked" screen; it advances once the
  // sheet drops away, ~300ms later so it lands after the screen has gone down.
  const [fill, setFill] = useState(0)
  useEffect(() => {
    if (paused) return
    const id = window.setTimeout(() => setFill(pct), 300)
    return () => window.clearTimeout(id)
  }, [pct, paused])

  return (
    <section className="px-1">
      <h2 className={SHEET_TITLE}>
        {greeting}
        {name ? `, ${name}` : ""}
      </h2>

      {dueToday > 0 ? (
        <div className="mt-3">
          <p className="text-sm text-text-muted">
            {allLogged ? (
              <>
                All{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {dueToday}
                </span>{" "}
                logged today
              </>
            ) : (
              <>
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {loggedToday} of {dueToday}
                </span>{" "}
                logged today
              </>
            )}
          </p>
          {/* Slim progress bar — fills as the day's doses are ticked off. */}
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-surface-raised"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={dueToday}
            aria-valuenow={loggedToday}
            aria-label="Doses logged today"
          >
            <div
              className="h-full rounded-full bg-accent-amber transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.round(fill * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-text-muted">Nothing scheduled today.</p>
      )}
    </section>
  )
}
