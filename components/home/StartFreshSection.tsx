"use client"

import { useState } from "react"
import { RotateCcw, Trash2 } from "lucide-react"

import { wipeMyProtocol } from "@/lib/db/resetProtocol"

/**
 * "Start fresh" — the nuclear reset for the compound stack. Clears every compound,
 * vial and logged dose from BOTH the cloud (`wipeMyProtocol`) and this device's
 * localStorage caches, then hard-reloads to an empty Home. Distinct from Archive
 * (reversible) and from deleting one compound — this empties the whole stack at once
 * so you can rebuild from scratch. Two-step confirm; the destructive (red) treatment.
 *
 * Why it clears localStorage too: those caches are a write-back layer that would
 * re-push the old stack to the cloud on the next focus/online — wiping the cloud
 * alone never sticks while the device still holds a copy. Does NOT touch weight,
 * progress photos, bloodwork or journal — only the compound stack.
 */
export function StartFreshSection({ userId }: { userId: string }) {
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [busy, setBusy] = useState(false)

  async function confirmWipe() {
    if (busy) return
    setBusy(true)
    await wipeMyProtocol()
    // Clear the device-local caches (keys defined in lib/home/stack.ts,
    // doseLog.ts, the add-to-stack menu, and migrateDeviceState) so they can't
    // re-push the old stack back up. Then hard-reload to a clean Home.
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
    <section className="mt-10">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
        Start fresh
      </h3>
      {step === 0 ? (
        <button
          type="button"
          onClick={() => setStep(1)}
          className="flex w-full items-center gap-3 rounded-2xl border border-border-default bg-bg-surface px-4 py-3.5 text-left transition-colors hover:bg-bg-surface-raised"
        >
          <RotateCcw className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              Clear all compounds &amp; stock
            </span>
            <span className="block text-xs text-text-subtle">
              Empties your whole stack on this device and in the cloud. Weight, progress
              photos and bloodwork are untouched.
            </span>
          </span>
        </button>
      ) : (
        <div className="rounded-2xl border border-state-error/40 bg-state-error/10 p-4">
          <p className="text-sm text-foreground">
            {step === 1
              ? "Remove EVERY compound, vial and logged dose and start from an empty stack? This can't be undone."
              : "Last check. This permanently clears your entire stack everywhere."}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep(0)}
              className="flex-1 rounded-lg border border-border-strong py-2 text-sm text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => (step === 1 ? setStep(2) : confirmWipe())}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-state-error py-2 text-sm font-medium text-text-primary transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                "Clearing…"
              ) : step === 1 ? (
                "Continue"
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear everything
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
