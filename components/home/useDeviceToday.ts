"use client"

import { useEffect, useRef, useState } from "react"

import { toDateKey, type DateKey } from "@/lib/home/mockHomeData"

/**
 * "Today", as the DEVICE reckons it.
 *
 * A server component can only produce the SERVER's date, and Vercel runs UTC.
 * For a Sydney user that is yesterday for the first ten hours of every day (more
 * in DST) and for a Californian it is tomorrow every evening. On a screen whose
 * subject is which day it is, that is not a rounding error: it highlighted the
 * wrong day, defaulted a block's start to tomorrow, and — via a `max=` on a date
 * input — refused to let an Australian start a block dated today.
 *
 * So the server's answer seeds the first paint (SSR stays deterministic and
 * nothing flashes) and the device corrects it on mount. It then keeps correcting
 * on focus, on becoming visible, and once a minute, so a page left open
 * overnight rolls over at LOCAL midnight rather than at some hour dictated by
 * UTC. `setState` only fires when the day actually changes, so the tick is a
 * no-op in the steady state.
 *
 * Screens that also track a SELECTED day watch the returned value and move the
 * selection themselves — only they know whether the user has navigated away.
 */
export function useDeviceToday(serverTodayKey: DateKey): DateKey {
  const [todayKey, setTodayKey] = useState<DateKey>(serverTodayKey)
  const ref = useRef(todayKey)
  useEffect(() => {
    ref.current = todayKey
  }, [todayKey])

  useEffect(() => {
    function sync() {
      const local = toDateKey(new Date())
      if (local === ref.current) return
      setTodayKey(local)
    }
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

  return todayKey
}
