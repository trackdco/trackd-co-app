/**
 * The retrospective — what a block actually contained. Pure, no React
 * (`code-standards.md`).
 *
 * This is the whole point of the feature (Adrian, 2026-07-30). Everything here
 * is a QUERY over dated things Trackd already stores: weight, photos, bloods,
 * journal entries, markers, and the dose log. Nothing new is captured and
 * nothing is stored — the no-stored-derived-values invariant means the numbers
 * on this screen are recomputed on every read, which is also what keeps them
 * true when a user back-dates a dose or corrects a weigh-in months later.
 *
 * One rule governs every function: **state the fact, never the verdict.** No
 * function here returns "on track", "behind", a projection, or any value whose
 * only use would be to colour something red or green. A count, a delta and a
 * date range are facts. Whether sixteen weeks went well is not this module's
 * business and must not become it.
 */

import { blockWindow, isWithinWindow, type Block, type BlockWindow } from "./block"
import type { DayLogs } from "@/lib/home/doseLog"
import type { StackCompound } from "@/lib/home/stack"
import { compoundsRunningOn } from "@/lib/progress/running"
import type { BloodworkPhoto } from "@/lib/progress/bloodwork"
import type { JournalEntry } from "@/lib/progress/journal"
import type { ProgressPhoto } from "@/lib/progress/photos"

/**
 * A runaway guard on the day walk below, not a product rule. Blocks are bounded
 * periods and a decade is far past any of them; the cap exists so a corrupt
 * start date cannot spin the browser. It is deliberately never surfaced in the
 * UI, because reaching it means the data is wrong rather than the block long.
 */
const MAX_WALK_DAYS = 3660

const DAY_MS = 86_400_000

function dayNumber(key: string): number | null {
  const [y, m, d] = key.split("-").map(Number)
  if (!y || !m || !d) return null
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

function keyFor(dayNo: number): string {
  const d = new Date(dayNo * DAY_MS)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** Every date key in the window, oldest first. Bounded by {@link MAX_WALK_DAYS}. */
export function daysIn(window: BlockWindow): string[] {
  const from = dayNumber(window.from)
  const to = dayNumber(window.to)
  if (from == null || to == null || to < from) return [window.from]
  const out: string[] = []
  for (let d = from; d <= to && out.length < MAX_WALK_DAYS; d++) out.push(keyFor(d))
  return out
}

/* ------------------------------------------------------------------ weight */

export interface WeightSpan {
  /** The first reading inside the window. */
  from: number
  /** The last reading inside the window. */
  to: number
  /** `to - from`. Signed: negative is a loss. Never described as good or bad. */
  delta: number
  /** Every reading inside the window, oldest first — the graph, clipped. */
  points: { key: string; kg: number }[]
}

/**
 * Weight across the window, or `null` when nothing was logged in it.
 *
 * Deliberately anchored to readings INSIDE the window rather than to the last
 * one before it. A block's weight change is what was measured while it ran; a
 * weigh-in from three months earlier would silently inflate the delta with
 * change that belongs to whatever came before.
 */
export function weightAcross(
  points: { key: string; kg: number }[],
  window: BlockWindow,
): WeightSpan | null {
  const inWindow = points
    .filter((p) => isWithinWindow(window, p.key))
    .sort((a, b) => a.key.localeCompare(b.key))
  if (inWindow.length === 0) return null
  const from = inWindow[0].kg
  const to = inWindow[inWindow.length - 1].kg
  return { from, to, delta: to - from, points: inWindow }
}

/* --------------------------------------------------------------- compounds */

export interface RanCompound {
  id: string
  name: string
  /** Drives the container's colour. */
  category: string
  /** The route, for resolving which container to draw. */
  method: string
  /** Doses logged for this compound inside the window. */
  doses: number
}

/**
 * What was run across the window, with the doses logged for each.
 *
 * "Run", not "logged" — the same distinction `lib/progress/running.ts` exists
 * for. Someone on testosterone every third day ran it for the whole block, not
 * for a third of it. The dose COUNT is a separate figure beside the name rather
 * than the thing that decides membership.
 *
 * A compound with logged doses but which never resolves as running is included
 * anyway: a legacy record or a lost schedule version should not erase a dose the
 * user can see they took. The union is the honest answer.
 *
 * The amount is deliberately absent. A sixteen-week block often spans a dose
 * change, and printing one number beside the name would state a dose that was
 * only true for part of it.
 */
export function compoundsRunAcross(
  stack: StackCompound[],
  logs: DayLogs,
  window: BlockWindow,
): RanCompound[] {
  const found = new Map<string, RanCompound>()
  const byId = new Map(stack.map((c) => [c.id, c]))

  // Walk the window, testing only the compounds not yet accounted for. Most are
  // found in the first day or two, so this collapses to near-nothing in practice
  // while still catching one that only started halfway through.
  const pending = new Set(stack.map((c) => c.id))
  for (const key of daysIn(window)) {
    if (pending.size === 0) break
    for (const r of compoundsRunningOn(stack, key)) {
      if (!pending.has(r.id)) continue
      pending.delete(r.id)
      found.set(r.id, {
        id: r.id,
        name: r.name,
        category: r.category,
        method: r.method,
        doses: 0,
      })
    }
  }

  // Doses come from the log's own keys rather than from another day walk: only
  // days with a log exist in it, so this is proportional to what happened.
  for (const [key, dayLogs] of Object.entries(logs)) {
    if (!isWithinWindow(window, key)) continue
    for (const compoundId of Object.keys(dayLogs)) {
      const existing = found.get(compoundId)
      if (existing) {
        existing.doses += 1
        continue
      }
      const c = byId.get(compoundId)
      if (!c) continue // a log whose compound is gone entirely — nothing to name
      found.set(compoundId, {
        id: c.id,
        name: c.name,
        category: c.category,
        method: c.method,
        doses: 1,
      })
    }
  }

  // Most-dosed first, then alphabetical: the compound you took ninety times is
  // the one you are looking back for, and ties resolve stably.
  return [...found.values()].sort(
    (a, b) => b.doses - a.doses || a.name.localeCompare(b.name),
  )
}

/* ------------------------------------------------------------------ photos */

export interface PhotoSpan {
  /** The earliest session's photos, and the latest session's. */
  first: ProgressPhoto[]
  last: ProgressPhoto[]
  /** Distinct dates photographed inside the window. */
  sessions: number
  /** Every photo inside the window, newest first. */
  all: ProgressPhoto[]
}

/**
 * Photos across the window. `first` and `last` are whole SESSIONS (every pose
 * shot that day), because a session is what the user actually took.
 *
 * When only one session falls inside the window, `last` is empty rather than a
 * copy of `first`: showing the same photo twice under "first" and "last" would
 * imply a comparison that does not exist.
 */
export function photosAcross(
  photos: ProgressPhoto[],
  window: BlockWindow,
): PhotoSpan | null {
  const inWindow = photos.filter((p) => isWithinWindow(window, p.date))
  if (inWindow.length === 0) return null
  const dates = [...new Set(inWindow.map((p) => p.date))].sort()
  const firstDate = dates[0]
  const lastDate = dates[dates.length - 1]
  return {
    first: inWindow.filter((p) => p.date === firstDate),
    last: dates.length > 1 ? inWindow.filter((p) => p.date === lastDate) : [],
    sessions: dates.length,
    all: inWindow.slice().sort((a, b) => b.date.localeCompare(a.date)),
  }
}

/**
 * The two photos to stand side by side: the same pose where the user shot one at
 * both ends, and failing that whatever each session led with.
 *
 * Matching the pose matters more than it looks. A front shot beside a back shot
 * is not a comparison, it is two unrelated pictures, and the whole reason the
 * app fixes the photo frame is so successive shots line up.
 */
export function comparePair(
  span: PhotoSpan,
): { before: ProgressPhoto; after: ProgressPhoto } | null {
  if (span.first.length === 0 || span.last.length === 0) return null
  const sharedPose = span.first.find((f) => span.last.some((l) => l.pose === f.pose))
  if (sharedPose) {
    const after = span.last.find((l) => l.pose === sharedPose.pose)
    if (after) return { before: sharedPose, after }
  }
  return { before: span.first[0], after: span.last[0] }
}

/* ------------------------------------------------------------------ bloods */

/** Panels drawn inside the window, newest first. */
export function bloodsAcross(
  panels: BloodworkPhoto[],
  window: BlockWindow,
): BloodworkPhoto[] {
  return panels
    .filter((p) => isWithinWindow(window, p.date))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/* ----------------------------------------------------------------- journal */

export interface JournalSpan {
  /** Entries written inside the window. */
  entries: number
  /** The markers dialed most often, with how many entries carried each. */
  topMarkers: { name: string; count: number }[]
  /** The most recent entry in the window that has text, for a single quote. */
  latest: JournalEntry | null
}

const TOP_MARKERS = 4

/**
 * The journal across the window.
 *
 * A marker COUNT is a fact about how often something was noted; it is not a
 * reading and carries no verdict. Nothing here reports a marker's severity,
 * ranks markers as good or bad, or colours one differently from another — the
 * categorical-never-evaluative invariant covers markers, and "you logged
 * lethargy twelve times" is exactly the kind of factual recall this feature is
 * for while "your lethargy was bad" is exactly what it must never say.
 */
export function journalAcross(
  entries: JournalEntry[],
  window: BlockWindow,
): JournalSpan {
  const inWindow = entries
    .filter((e) => isWithinWindow(window, e.date))
    .sort((a, b) => b.date.localeCompare(a.date))

  const counts = new Map<string, number>()
  for (const e of inWindow) {
    // Count each marker once per entry, not once per reading: an entry cannot
    // carry the same marker twice, but a defensive de-dupe keeps a corrupt row
    // from inflating a figure the user would read as a frequency.
    for (const name of new Set(e.markers.map((m) => m.name))) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }

  return {
    entries: inWindow.length,
    topMarkers: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, TOP_MARKERS),
    latest: inWindow.find((e) => (e.body ?? "").trim().length > 0) ?? null,
  }
}

/* ------------------------------------------------------------- consistency */

export interface ConsistencySpan {
  /** Doses logged ÷ doses due across the window, or `null` when none were due. */
  pct: number | null
  logged: number
  due: number
  /** Days in the window that had at least one dose due. */
  doseDays: number
}

/**
 * Adherence across the window, from the adherence series the Progress screen
 * already computes. Clipped rather than recomputed, so the two screens can never
 * report different numbers for the same days (spec 08: do not change the
 * consistency calculation).
 *
 * Consistency is behavioural, not a health reading — how closely someone stuck
 * to their own plan — which is why it is allowed to be a percentage at all.
 */
export function consistencyAcross(
  points: { key: string; due: number; logged: number }[],
  window: BlockWindow,
): ConsistencySpan {
  let due = 0
  let logged = 0
  let doseDays = 0
  for (const p of points) {
    if (!isWithinWindow(window, p.key)) continue
    due += p.due
    logged += p.logged
    if (p.due > 0) doseDays += 1
  }
  return {
    pct: due > 0 ? Math.round((logged / due) * 100) : null,
    logged,
    due,
    doseDays,
  }
}

/* --------------------------------------------------------------- assembled */

export interface Retrospective {
  window: BlockWindow
  weight: WeightSpan | null
  compounds: RanCompound[]
  photos: PhotoSpan | null
  bloods: BloodworkPhoto[]
  journal: JournalSpan
  consistency: ConsistencySpan
}

export interface RetrospectiveSources {
  weight: { key: string; kg: number }[]
  stack: StackCompound[]
  logs: DayLogs
  adherence: { key: string; due: number; logged: number }[]
  photos: ProgressPhoto[]
  bloods: BloodworkPhoto[]
  journal: JournalEntry[]
}

/** Every section of the look-back, from one window. */
export function buildRetrospective(
  block: Block,
  todayKey: string,
  sources: RetrospectiveSources,
): Retrospective {
  const window = blockWindow(block, todayKey)
  return {
    window,
    weight: weightAcross(sources.weight, window),
    compounds: compoundsRunAcross(sources.stack, sources.logs, window),
    photos: photosAcross(sources.photos, window),
    bloods: bloodsAcross(sources.bloods, window),
    journal: journalAcross(sources.journal, window),
    consistency: consistencyAcross(sources.adherence, window),
  }
}
