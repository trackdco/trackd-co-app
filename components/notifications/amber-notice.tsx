"use client"

import { useCallback, useRef, useState } from "react"
import { Warning } from "@/components/icons"

/**
 * The app's single notification style: a small **amber** banner that slides down
 * from the top edge and auto-dismisses. Used for transient errors only (e.g.
 * "already in your log", a failed save) — never a modal/pop-up (per Adrian's
 * direction). Drive it with `useAmberNotice` and render `<AmberNotice/>` once.
 */
export interface Notice {
  /** Bumps on each show so a repeated message re-triggers the animation. */
  id: number
  text: string
}

/**
 * Owns the notice + its auto-dismiss timer. `show` is called from event handlers
 * (taps), never during render, so there's no setState-in-effect.
 */
export function useAmberNotice(durationMs = 3200) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const idRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(
    (text: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      idRef.current += 1
      setNotice({ id: idRef.current, text })
      timerRef.current = setTimeout(() => setNotice(null), durationMs)
    },
    [durationMs]
  )

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setNotice(null)
  }, [])

  return { notice, show, dismiss }
}

/** Presentational — renders the current notice (or nothing). Pure. */
export function AmberNotice({
  notice,
  onDismiss,
}: {
  notice: Notice | null
  onDismiss?: () => void
}) {
  if (!notice) return null
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <button
        key={notice.id}
        type="button"
        onClick={onDismiss}
        role="alert"
        className="animate-notice-in pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl border border-accent-amber/40 bg-bg-surface-raised/95 px-4 py-3 text-left text-sm text-foreground shadow-lg backdrop-blur"
      >
        <Warning
          className="h-4 w-4 shrink-0 text-accent-amber"
          aria-hidden
        />
        <span className="min-w-0">{notice.text}</span>
      </button>
    </div>
  )
}
