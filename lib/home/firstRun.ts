/**
 * FIRST RUN (build-brief-final §3.1). A new account adds one compound through
 * the real add flow, then Home teaches the one thing to do next:
 *
 * - a bubble points at the first dose's circle ("Tap the circle to log it.")
 *   until the first tap on any circle, and never comes back;
 * - the + stays hidden until the first dose is logged;
 * - logging that first dose opens the "First Dose Logged" pop-up, once.
 *
 * "Has this person ever logged a dose" is read from the dose log itself, never
 * stored, so a reinstall that pulls the history back is not a first run. The two
 * device flags only remember that a moment was SEEN, so it is not repeated on
 * this phone. Both are best-effort: a storage that throws costs the memory of
 * having seen it, never the app.
 *
 * Pure apart from the two flag helpers; no React.
 */

import type { DayLogs } from "@/lib/home/doseLog"

/** Any dose, on any day, ever. */
export function hasAnyLog(logs: DayLogs): boolean {
  for (const day of Object.values(logs)) {
    if (day && Object.keys(day).length > 0) return true
  }
  return false
}

const BUBBLE_KEY = (uid: string) => `trakabl.firstRun.bubbleSeen.v1.${uid}`
const CELEBRATED_KEY = (uid: string) => `trakabl.firstRun.celebrated.v1.${uid}`

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

function write(key: string): void {
  try {
    window.localStorage.setItem(key, "1")
  } catch {
    // Best-effort: the moment may show again on this phone, nothing breaks.
  }
}

export const bubbleSeen = (uid: string) => read(BUBBLE_KEY(uid))
export const markBubbleSeen = (uid: string) => write(BUBBLE_KEY(uid))
export const celebrated = (uid: string) => read(CELEBRATED_KEY(uid))
export const markCelebrated = (uid: string) => write(CELEBRATED_KEY(uid))
