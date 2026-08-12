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

    const tick = () => {
      setElapsed((seconds) => {
        if (seconds + 1 >= REFRESH_AFTER_SECONDS) {
          router.refresh()
          return 0
        }
        return seconds + 1
      })
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
      <span className="text-xs text-text-muted">Auto</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Refresh this page every minute"
        onClick={toggle}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-[var(--motion-base)] ease-motion ${
          on ? "bg-accent-amber" : "border border-border-strong bg-bg-input"
        }`}
      >
        <span
          className={`absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-accent-primary transition-[left] duration-[var(--motion-base)] ease-motion ${
            on ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  )
}
