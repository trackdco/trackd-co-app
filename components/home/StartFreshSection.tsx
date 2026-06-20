"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { wipeMyProtocol } from "@/lib/db/resetProtocol"

/**
 * "Clear all compounds & stock" — the nuclear reset for the compound stack. Clears
 * every compound, vial and logged dose from BOTH the cloud (`wipeMyProtocol`) and
 * this device's localStorage caches, then hard-reloads to an empty Home. Distinct
 * from Archive (reversible) and from deleting one compound — it empties the whole
 * stack so you can rebuild from scratch.
 *
 * Deliberately styled to MATCH "Delete my account" (a quiet, muted underline link →
 * a portaled confirm modal, NOT a loud red button) and placed beside it in Profile,
 * so it reads as the rare/irreversible action it is and can't be tapped by accident.
 *
 * Why it clears localStorage too: those caches are a write-back layer that would
 * re-push the old stack to the cloud on the next focus/online — wiping the cloud
 * alone never sticks while the device still holds a copy. Does NOT touch weight,
 * progress photos, bloodwork or journal — only the compound stack.
 */
export function StartFreshSection({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  async function confirmWipe() {
    if (busy) return
    setBusy(true)
    await wipeMyProtocol()
    // Clear the device-local caches (keys defined in lib/home/stack.ts, doseLog.ts,
    // the add-to-stack menu, and migrateDeviceState) so they can't re-push the old
    // stack back up. Then hard-reload to a clean Home.
    try {
      window.localStorage.removeItem(`trackd.stack.v2.${userId}`)
      window.localStorage.removeItem(`trackd.doselog.v1.${userId}`)
      window.localStorage.removeItem(`trackd.customCompounds.${userId}`)
      window.localStorage.removeItem(`trackd.migrated.v1.${userId}`)
    } catch {
      /* storage disabled — the cloud wipe + migrated flag still hold */
    }
    window.location.href = "/dashboard"
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto block rounded-md px-2 py-2 text-xs text-text-subtle underline underline-offset-2 outline-none transition-colors hover:text-text-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        Clear all compounds &amp; stock
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
            onClick={() => !busy && setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="clear-stack-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            >
              <h2 id="clear-stack-title" className="text-base font-semibold text-foreground">
                Clear your whole stack?
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
                This removes every compound, vial and logged dose and starts you from an
                empty stack — on this device and in the cloud. Your weight, progress photos
                and bloodwork are kept. This can&apos;t be undone.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-border-strong py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmWipe()}
                  className="flex-1 rounded-xl bg-accent-destructive py-2.5 text-center text-sm font-semibold text-text-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Clearing…" : "Clear everything"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
