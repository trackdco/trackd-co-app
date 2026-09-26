/**
 * ROWS THAT LEAVE the Cycles and Ended lists, and where they go: End sends a
 * cycle to Ended (W34), a pause made elsewhere sends it to Paused (ruling 7),
 * Restart and Delete take it off Ended (B34).
 *
 * The write always comes FIRST and the motion after it (B34): a reload inside
 * a 260ms leave used to lose the tap, and a failed write left the row faded
 * out for good. So the list keeps drawing a row that has already gone from the
 * data until its leave has played ({@link withLeaving}), and a write that fails
 * never starts a leave at all ({@link restartOutcome}).
 *
 * Pure: no React, no DOM (`code-standards.md`).
 */
import type { RestartCycleResult } from "@/lib/home/endedCycleActions"

/** A row that has left the data, drawn where it was until its leave ends. */
export interface Leaving<T> {
  item: T
  /** Its index in the list as it was when it left. */
  at: number
}

/**
 * The list to draw: the current rows, with each leaving row put back where it
 * was. A row that is back in the data (an Undo inside the leave) is drawn once,
 * as current, so it simply stays.
 */
export function withLeaving<T>(
  current: readonly T[],
  leaving: readonly Leaving<T>[],
  keyOf: (item: T) => string,
): { item: T; leaving: boolean }[] {
  const out = current.map((item) => ({ item, leaving: false }))
  const present = new Set(current.map(keyOf))
  const back = leaving.filter((l) => !present.has(keyOf(l.item))).sort((a, b) => a.at - b.at)
  // In index order, so two rows that left together land where both were.
  for (const l of back) out.splice(Math.min(Math.max(0, l.at), out.length), 0, { item: l.item, leaving: true })
  return out
}

/** Add a leaving row, replacing an earlier leave of the same row. */
export function addLeaving<T>(
  leaving: readonly Leaving<T>[],
  next: Leaving<T>,
  keyOf: (item: T) => string,
): Leaving<T>[] {
  const k = keyOf(next.item)
  return [...leaving.filter((l) => keyOf(l.item) !== k), next]
}

/** Drop a row's leave once it has played. */
export function dropLeaving<T>(leaving: readonly Leaving<T>[], key: string, keyOf: (item: T) => string): Leaving<T>[] {
  return leaving.filter((l) => keyOf(l.item) !== key)
}

/**
 * What a Restart does next, from what the write said (B34): leave only when the
 * cycle is back. A failure keeps the row where it is, fully drawn, and says why.
 */
export function restartOutcome(
  result: RestartCycleResult,
  compoundName: string,
): { leave: boolean; toast: string; undo: boolean } {
  if (result.ok) {
    return { leave: true, toast: `Restarted. ${compoundName} is back on its cycle.`, undo: true }
  }
  return {
    leave: false,
    toast: result.reason === "gone" ? "Couldn’t restart it. It has changed." : "Couldn’t restart it. Try again.",
    undo: false,
  }
}

/** A box on screen: its top and height in viewport pixels. */
export interface Box {
  top: number
  height: number
}

/**
 * How far a ghost row travels down (or up) to land on `dest`, centred on it.
 * Clamped to the viewport, so a destination below the fold (the Ended link
 * under a long Timeline) is headed for, and the ghost fades as it leaves the
 * screen, rather than streaking far past the edge.
 */
export function flightDelta(src: Box, dest: Box, viewportHeight: number): number {
  const target = dest.top + (dest.height - src.height) / 2
  const lo = -src.height / 2
  const hi = viewportHeight - src.height / 2
  return Math.min(hi, Math.max(lo, target)) - src.top
}
