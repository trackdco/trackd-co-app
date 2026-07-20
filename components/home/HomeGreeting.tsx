"use client"

import { useEffect, useState } from "react"

import { useMounted } from "@/components/home/useMounted"
import { PAGE_TITLE } from "@/lib/ui-presets"

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
 * The home greeting under the week strip. The part-of-day word is read from the
 * DEVICE clock, so it must not render on the server (which runs in UTC and would
 * mismatch the client on hydration): we show a neutral "Hello" until mounted, then
 * settle on the time-based greeting, and keep it current on focus/visibility + a
 * 1-minute tick so a session left open rolls morning → afternoon → evening on its
 * own. The day's status (completion ring + next dose) lives in `DayStatusWidgets`,
 * below Today's Log.
 */
export function HomeGreeting({ firstName }: { firstName: string | null }) {
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

  return (
    <section className="px-1">
      <h2 className={PAGE_TITLE}>
        {greeting}
        {name ? `, ${name}` : ""}
      </h2>
    </section>
  )
}
