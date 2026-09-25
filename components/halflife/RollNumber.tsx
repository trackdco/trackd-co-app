"use client"

import { useEffect, useRef, useState } from "react"

/**
 * FIGURES ROLL, NEVER COUNT UP (build-brief-final §3.3; ui-context "Figures
 * roll"): after a dose is tracked, each digit that changed rolls from its old
 * value to its new one, like an odometer. Never from zero, and never on the
 * minute-by-minute drift (`useMinuteNow` moves these figures every minute): only
 * when `rollKey` changes, which the caller bumps on a new log. And only if the
 * figure is on screen; otherwise it updates quietly.
 *
 * Plex Mono is monospaced, so a rolling column never changes the figure's width.
 * Reduced motion: no roll.
 */
export function RollNumber({ text, rollKey, className }: { text: string; rollKey: number; className?: string }) {
  const [state, setState] = useState<{ text: string; from: string | null; key: number; nonce: number }>({
    text,
    from: null,
    key: rollKey,
    nonce: 0,
  })
  // A new log: roll from what was showing. Otherwise follow the value quietly.
  if (rollKey !== state.key) {
    setState({ text, from: state.text === text ? null : state.text, key: rollKey, nonce: state.nonce + 1 })
  } else if (text !== state.text && state.from === null) {
    setState({ ...state, text })
  }
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (state.from === null) return
    const el = ref.current
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const r = el?.getBoundingClientRect()
    const onScreen = r ? r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth : false
    if (reduce || !onScreen) {
      setState((s) => ({ ...s, from: null }))
      return
    }
    const t = window.setTimeout(() => setState((s) => ({ ...s, from: null })), 900)
    return () => window.clearTimeout(t)
  }, [state.from, state.nonce])

  if (state.from === null) {
    return (
      <span ref={ref} className={className}>
        {state.text}
      </span>
    )
  }
  // Align old and new from the right, so units, tens and tenths line up.
  const width = Math.max(state.text.length, state.from.length)
  const now = state.text.padStart(width, " ")
  const was = state.from.padStart(width, " ")
  return (
    <span ref={ref} className={className} aria-label={state.text}>
      {now.split("").map((ch, i) => {
        const old = was[i]
        if (old === ch || !/\d/.test(ch + old)) {
          return ch === " " ? null : (
            <span key={i} aria-hidden>
              {ch}
            </span>
          )
        }
        return (
          <span key={`${state.nonce}-${i}`} aria-hidden className="roll-col">
            <span className="roll-strip" style={{ animationDelay: `${(width - 1 - i) * 40}ms` }}>
              <span>{old === " " ? " " : old}</span>
              <span>{ch}</span>
            </span>
          </span>
        )
      })}
    </span>
  )
}
