"use client"

import { useSyncExternalStore } from "react"

import { getToast, subscribeToast, undoToast } from "@/lib/toast"
import { PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const none = () => null

/**
 * The bottom toast (build-brief-final §3.16), rendered once by the app shell.
 * It sits above the + and the tab bar, so it never covers the thing you just
 * tapped, and it rises 8px as it fades in. The words are a polite live region;
 * Undo is a real button, there only when the action can be undone.
 */
export function Toast() {
  const toast = useSyncExternalStore(subscribeToast, getToast, none)
  return (
    <div
      aria-live="polite"
      data-toast=""
      className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4"
      style={{ bottom: "calc(9.25rem + env(safe-area-inset-bottom))" }}
    >
      {toast ? (
        <div
          key={toast.id}
          className="toast-in pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-xl bg-bg-surface-raised px-3.5 py-2.5 text-[13px] text-foreground"
          style={{
            boxShadow:
              "inset 0 1px 0 color-mix(in srgb, var(--text-primary) 7%, transparent), 0 0 0 1px rgb(0 0 0 / 0.45), 0 12px 28px -10px #000",
          }}
        >
          <span className="min-w-0 truncate">{toast.text}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={undoToast}
              className={cn(PRESS.text, "-my-2 -mr-2 shrink-0 px-2.5 py-2 text-[13px] font-medium text-foreground underline underline-offset-2")}
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
