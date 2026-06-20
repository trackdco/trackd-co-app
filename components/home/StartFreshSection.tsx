"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"

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
      {step === 0 ? (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-xs font-medium text-state-error/70 underline-offset-4 transition-colors hover:text-state-error hover:underline"
          >
            Clear all compounds &amp; stock
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-state-error/40 bg-state-error/10 p-3">
          <p className="text-xs text-foreground">
            {step === 1
              ? "Remove EVERY compound, vial and logged dose and start from an empty stack? This can't be undone. (Weight, photos and bloodwork are kept.)"
              : "Last check. This permanently clears your entire stack everywhere."}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep(0)}
              className="flex-1 rounded-lg border border-border-strong py-1.5 text-xs text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => (step === 1 ? setStep(2) : confirmWipe())}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-state-error py-1.5 text-xs font-medium text-text-primary transition-opacity hover:opacity-90 disabled:opacity-50"
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
