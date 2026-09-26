/**
 * THE CYCLES PAGE'S DEVICE MEMORY: two small things this phone remembers about
 * the page, best-effort. A storage that throws only costs the memory, never a
 * control or a record.
 *
 * 1. "Tap a type to see its cycles." (build-brief-final §3.10) shows on the
 *    Cycles page until the first tap on a type or a cycle, then stays gone on
 *    this phone. It is marked seen only once it has been DRAWN (cold review
 *    F8): a tap on a page that never showed it must not use it up.
 *
 * 2. Which pauses the page has shown (Adrian's ruling 7). A cycle has no pause
 *    of its own; its compound's pause is the one pause. The slide into Paused
 *    plays the first time Cycles shows a cycle paused since the page last saw
 *    it, so a pause made on Home is seen moving into Paused on the next visit.
 *    Keyed by the PAUSE's id: a compound resumed and paused again between two
 *    visits has a new pause, and slides again. Pause ids do not change when
 *    they sync (the device's id is the row's id), and compound ids do (a
 *    hydration re-keys a compound matched by name), which is why the key is
 *    the pause alone.
 */
const HINT_KEY = (uid: string) => `trakabl.cycles.hintSeen.v1.${uid}`
const PAUSED_KEY = (uid: string) => `trakabl.cycles.pausedSeen.v1.${uid}`

export function cyclesHintSeen(uid: string): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY(uid)) === "1"
  } catch {
    return false
  }
}

export function markCyclesHintSeen(uid: string): void {
  try {
    window.localStorage.setItem(HINT_KEY(uid), "1")
  } catch {
    // Best-effort: the hint may show again on this phone, nothing breaks.
  }
}

/**
 * Should a tap drop the hint and remember it? Only when the hint is on screen
 * (F8). With one type the page opens it by itself and draws no hint; a tap on
 * a row there used to mark the hint seen, so it never appeared once a second
 * type (or Paused) arrived.
 */
export function shouldMarkHintSeen(hint: { drawn: boolean; gone: boolean; leaving: boolean }): boolean {
  return hint.drawn && !hint.gone && !hint.leaving
}

/* ------------------------------------------------------ pauses the page saw */

/** What this tab last read or wrote, so a blocked storage still remembers for
 *  the session (the slide never replays on every visit). */
let held: { uid: string; keys: ReadonlySet<string> | null } | null = null

function readPaused(uid: string): ReadonlySet<string> | null {
  try {
    const raw = window.localStorage.getItem(PAUSED_KEY(uid))
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return new Set(parsed.filter((k): k is string => typeof k === "string" && k !== ""))
  } catch {
    return null
  }
}

/**
 * The pause ids the Cycles page last showed as paused on this device, or null
 * when it has never recorded any (a first visit: every pause is new to it).
 */
export function pausedSeen(uid: string): ReadonlySet<string> | null {
  if (!held || held.uid !== uid) held = { uid, keys: readPaused(uid) }
  return held.keys
}

/**
 * Remember what the page shows as paused now. REPLACES the list: a pause that
 * has ended drops out, so the list never grows past what is paused today.
 */
export function rememberPausedSeen(uid: string, pauseIds: Iterable<string>): void {
  const keys = new Set(pauseIds)
  held = { uid, keys }
  try {
    window.localStorage.setItem(PAUSED_KEY(uid), JSON.stringify([...keys]))
  } catch {
    // Best-effort: held for this session.
  }
}

/**
 * The pauses the page has not shown yet, in the order given: these slide into
 * Paused. `seen` null (never recorded) means none has been shown.
 */
export function freshPauses(pauseIds: readonly string[], seen: ReadonlySet<string> | null): string[] {
  return pauseIds.filter((id) => !seen?.has(id))
}

/** Does the stored list already say exactly this? Saves a write on each visit. */
export function sameSeen(a: ReadonlySet<string> | null, b: readonly string[]): boolean {
  // Never recorded and nothing paused: the same as an empty list.
  if (!a) return b.length === 0
  if (a.size !== new Set(b).size) return false
  return b.every((k) => a.has(k))
}

/** Tests only: forget what this tab holds. */
export function resetCyclesMemoryForTests(): void {
  held = null
}
