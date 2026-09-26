"use client"

import { useState, useSyncExternalStore, type KeyboardEvent } from "react"

import { focusablesIn } from "@/components/feel/PopDialog"
import { SheetLayer, useTopOpenSheet } from "@/components/layout/BottomSheet"
import { tabWrap } from "@/lib/feel/overlay"
import { getToast, subscribeToast, undoToast } from "@/lib/toast"
import { PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const none = () => null

/**
 * The bottom toast (build-brief-final §3.16), rendered once by the app shell.
 * It sits above the + and the tab bar, so it never covers the thing you just
 * tapped, and it rises 8px as it fades in. The words are a polite live region;
 * Undo is a real button, there only when the action can be undone.
 *
 * WHILE A SHEET IS UP it lives inside the top sheet (cold review B10). A Radix
 * sheet hides the rest of the page from screen readers and keeps Tab inside
 * itself, so a toast left on the page ("Unticked" from Quick log, "Discarded"
 * over a compound's sheet) could be seen but its Undo never reached. Inside
 * the sheet it is announced, Tab reaches Undo, and it still sits above the
 * sheet (z-70 over the sheet's own content). The live region stays in the
 * sheet for as long as the sheet is open, so the next toast is announced there.
 *
 * In the sheet it is still at the foot of the WINDOW, full width, even in
 * desktop's centred dialog (`SheetLayer`), and a tap on Undo leaves the sheet
 * open (`data-toast`, which the sheet frame exempts). The sheet's own Tab
 * trap cannot hear it (it is another React tree), so Tab past Undo wraps to
 * the sheet's first control here, as the trap would (`tabWrap`).
 */
export function Toast() {
  const toast = useSyncExternalStore(subscribeToast, getToast, none)
  const sheet = useTopOpenSheet()
  // The rise plays once per toast: one that moves into or out of a sheet while
  // it is up stays where it stands rather than rising a second time.
  const [risen, setRisen] = useState<number | null>(null)
  const wrapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!sheet || e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return
    const items = focusablesIn(sheet)
    const next = tabWrap(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey)
    if (next === null) return
    e.preventDefault()
    items[next].focus({ preventScroll: true })
  }
  const region = (
    <div
      aria-live="polite"
      data-toast=""
      className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4"
      style={{ bottom: "calc(9.25rem + env(safe-area-inset-bottom))" }}
    >
      {toast ? (
        <div
          key={toast.id}
          onKeyDown={wrapTab}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setRisen(toast.id)
          }}
          className={cn(
            risen !== toast.id && "toast-in",
            "pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-xl bg-bg-surface-raised px-3.5 py-2.5 text-[13px] text-foreground",
          )}
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
  return (
    <SheetLayer sheet={sheet} className="z-[70]">
      {region}
    </SheetLayer>
  )
}
