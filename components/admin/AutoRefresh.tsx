"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"

const STORAGE_KEY = "trackd.admin.autorefresh"
const REFRESH_AFTER_SECONDS = 60

/**
 * The saved on/off preference, as an external store.
 *
 * `useSyncExternalStore` rather than "read localStorage in an effect and
 * setState": the effect version writes state during an effect body, which this
 * project's React Compiler lint rules reject outright, and it also renders one
 * frame with the wrong value before correcting itself. This reads `false` on the
 * server and during hydration, then the real value — with no state write and no
 * mismatch.
 *
 * The snapshot is a boolean, i.e. a primitive, so returning a fresh value each
 * call cannot loop the way a fresh object would.
 */
const preference = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    preference.listeners.add(listener)
    return () => {
      preference.listeners.delete(listener)
    }
  },
  get(): boolean {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1"
    } catch {
      // Private mode / storage disabled — the toggle just doesn't persist.
      return false
    }
  },
  set(next: boolean) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
    } catch {
      // Non-fatal; the switch still won't stick, which is the honest outcome.
    }
    for (const listener of preference.listeners) listener()
  },
}

/**
 * Keeps /admin live on a second monitor.
 *
 * TWO THINGS THAT ARE NOT OPTIONAL, because this ticker fires the whole
 * aggregate round against production on a timer:
 *
 *  1. **It pauses when the tab is hidden.** A backgrounded tab left open over a
 *     weekend would otherwise run the full round ~2,900 times for nobody to look
 *     at. `visibilitychange` stops the clock, and returning to the tab refreshes
 *     once, immediately.
 *  2. **It defaults OFF and the preference persists.** Opening the dashboard
 *     should not silently sign you up for recurring load; you switch it on when
 *     you are actually watching something.
 *
 * ONE timer, not two. The seconds counter and the refresh are the same clock —
 * a second interval purely to animate the label would be a second thing to keep
 * in step with the first.
 *
 * Follows the house switch rule (`ui-context.md`): ON is an amber track with a
 * white knob, OFF is `--bg-input` behind a `--border-strong` hairline.
 */
export function AutoRefresh() {
  const router = useRouter()
  const on = useSyncExternalStore(
    preference.subscribe,
    preference.get,
    () => false // server render: always off, so hydration agrees
  )
  const [elapsed, setElapsed] = useState(0)

  const toggle = useCallback(() => {
    preference.set(!preference.get())
    setElapsed(0)
  }, [])

  useEffect(() => {
    if (!on) return

    let timer: ReturnType<typeof setInterval> | null = null
    /**
     * The counter lives in a ref as well as in state.
     *
     * `router.refresh()` used to be called INSIDE the `setElapsed` updater,
     * which is a side effect in a function React requires to be pure — and
     * StrictMode double-invokes updaters in development, so every refresh fired
     * the entire aggregate round twice. The ref carries the count for the
     * decision; the state exists only to re-render the label.
     */
    let seconds = 0

    const tick = () => {
      seconds += 1
      if (seconds >= REFRESH_AFTER_SECONDS) {
        seconds = 0
        router.refresh()
      }
      setElapsed(seconds)
    }

    const start = () => {
      if (timer === null) timer = setInterval(tick, 1000)
    }
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }

    const onVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        // Catch up on whatever was missed while hidden, then resume.
        seconds = 0
        router.refresh()
        setElapsed(0)
        start()
      }
    }

    if (!document.hidden) start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [on, router])

  return (
    <div className="flex items-center gap-2.5">
      {on && (
        <span className="font-mono text-[11px] tabular-nums text-text-subtle">
          {elapsed}s
        </span>
      )}
      {/* The accessible name CONTAINS the visible label (WCAG 2.5.3), so voice
          control saying "Auto" reaches this control. */}
      <span id="auto-refresh-label" className="text-xs text-text-muted">
        Auto
      </span>
      {/* Geometry copied from the three shipped switches
          (`components/settings/NotificationsToggle.tsx` and friends), which are
          identical to each other by deliberate decision. ui-context.md: "No
          exceptions, and no per-screen variants." */}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="auto-refresh-label"
        title="Refresh this page every minute"
        onClick={toggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ${
          on ? "bg-accent-amber" : "bg-bg-input border border-border-strong"
        }`}
      >
        {/* Knob: flex-centered vertically; travel is exact so the 4px inset is
            equal on both ends (off → translate-x-1, on → translate-x-6). */}
        <span
          className={`pointer-events-none inline-block size-5 rounded-full bg-primary shadow-sm transition-transform duration-200 ${
            on ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  )
}
