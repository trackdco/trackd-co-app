/**
 * THE FIRST DOSE POP-UP IS OWED UNTIL IT OPENS (cold review B36).
 *
 * Home opens "First Dose Logged" 420ms after the first dose, once the row's tick
 * has lifted. It used to mark the moment as celebrated BEFORE that timer, and
 * never cleared the timer: leave Home inside the 420ms and the pop-up never
 * showed, while the phone remembered it as seen, so it was lost for good.
 *
 * Now it is marked celebrated only when it opens. Between the dose and the
 * opening it is OWED, for this tab's session: a Home that unmounts first shows it
 * on the next visit. Best-effort like the `firstRun` flags: a storage that
 * throws costs the second chance, never the app.
 */

const OWED_KEY = (uid: string) => `trakabl.firstRun.firstDoseOwed.v1.${uid}`

export function firstDoseOwed(uid: string): boolean {
  try {
    return window.sessionStorage.getItem(OWED_KEY(uid)) === "1"
  } catch {
    return false
  }
}

export function oweFirstDose(uid: string): void {
  try {
    window.sessionStorage.setItem(OWED_KEY(uid), "1")
  } catch {
    // Best-effort: the pop-up still opens now; only the second chance is lost.
  }
}

export function settleFirstDose(uid: string): void {
  try {
    window.sessionStorage.removeItem(OWED_KEY(uid))
  } catch {
    // Nothing to undo.
  }
}

/**
 * What Home does about an owed pop-up, from what it knows right now:
 * - "none": nothing is owed, the timer is already running, or the history has
 *   not settled yet (a log that is still loading is not an empty one);
 * - "drop": it was seen after all, or the dose it celebrated has been unticked
 *   (the next first dose will owe it again);
 * - "open": show it.
 */
export function owedFirstDoseAction(s: {
  owed: boolean
  timerPending: boolean
  hydrated: boolean
  celebrated: boolean
  anyLog: boolean
}): "none" | "drop" | "open" {
  if (!s.owed || s.timerPending || !s.hydrated) return "none"
  if (s.celebrated || !s.anyLog) return "drop"
  return "open"
}
