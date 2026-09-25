/**
 * "Tap a type to see its cycles." (build-brief-final §3.10) shows on the
 * Cycles page until the first tap on a type or a cycle, then stays gone on this
 * phone. A device preference, best-effort: a storage that throws only costs the
 * memory of having seen it.
 */
const KEY = (uid: string) => `trakabl.cycles.hintSeen.v1.${uid}`

export function cyclesHintSeen(uid: string): boolean {
  try {
    return window.localStorage.getItem(KEY(uid)) === "1"
  } catch {
    return false
  }
}

export function markCyclesHintSeen(uid: string): void {
  try {
    window.localStorage.setItem(KEY(uid), "1")
  } catch {
    // Best-effort: the hint may show again on this phone, nothing breaks.
  }
}
