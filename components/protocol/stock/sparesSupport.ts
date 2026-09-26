import { useSyncExternalStore } from "react"

import { stockSparesSupported } from "@/lib/db/inventory"

/**
 * Whether this database has refused an UNMIXED powder vial, remembered for the
 * rest of the visit (W17).
 *
 * A database without migration `026` cannot hold a vial with no water, and the
 * app learns that the way it always has: the first add of one is refused
 * (`addStockItem` answers `pendingMigration`). Remembering it means that
 * refusal happens once per visit, not once per sheet: every Add stock after it
 * opens on the form that database can save (one powder vial, mixed now), and
 * never offers a count or a dry vial it would refuse again.
 *
 * In memory only, never stored: once `026` is applied, the next visit offers
 * spares at once, with nothing stale to clear.
 */
let refused = false

export function sparesRefusedThisVisit(): boolean {
  return refused
}

export function noteSparesRefused(): void {
  refused = true
  emit()
}

/* sweep ----------------------------------------------------------------- */

/**
 * THE PROBE, ASKED BEFORE ANYTHING IS OFFERED (sweep, ruling 10: never offer
 * a choice that cannot save).
 *
 * Learning from a refusal still cost the first add of a visit a whole form.
 * So the first sheet that mounts asks the database once
 * (`stockSparesSupported`, one read of `v_compound_stock`), and every Add
 * stock and custom-compound form reads the answer: `true` offers spares and
 * the dropper; `false` opens a powder vial on the one-vial mixed form and
 * hides the dropper; `null` (not known yet, signed out, offline) keeps the
 * refusal fallback and hides the dropper. The sheets mount with their page,
 * closed, so the answer is in long before one opens.
 *
 * Once per visit, in memory, like the refusal above.
 */
let probed: boolean | null = null
let asked = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function ask() {
  if (asked || typeof window === "undefined") return
  asked = true
  void stockSparesSupported()
    .then((answer) => {
      probed = answer
      emit()
    })
    .catch(() => {
      // Unknown stays unknown: the refusal fallback still stands.
    })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  ask()
  return () => {
    listeners.delete(cb)
  }
}

/** What the visit knows: a refusal wins over the probe; else the probe. */
function current(): boolean | null {
  return refused ? false : probed
}

/** Whether this database holds spares and droppers (`026`), or null. */
export function useStockSchema(): boolean | null {
  return useSyncExternalStore(subscribe, current, () => null)
}
