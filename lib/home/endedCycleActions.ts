/**
 * The Ended group's actions (build-brief-final §3.10): End, Restart, and Delete
 * for good, each with its Undo.
 *
 * End and Restart are thin calls over the ONE cycle write path,
 * `setCompoundCycle`, which records a schedule version effective from a day and
 * syncs it like any other. Undo of a Restart is simply End on the same day:
 * `recordScheduleVersion` REPLACES a version with the same `effectiveFrom`, so the
 * two taps leave one version for today, never a pile.
 *
 * Delete for good writes nothing to the trail. History is never rewritten; the
 * row is hidden through a DEVICE-LOCAL list of ended-cycle keys instead.
 *
 * Pure data + guarded storage only; no React (`code-standards.md`).
 */
import {
  compoundWithCycle,
  loadStack,
  resolveScheduleOn,
  setCompoundCycle,
  type StackCompound,
} from "@/lib/home/stack"
import { sameCycle, type CycleRule } from "@/lib/protocol/cycleRule"
import {
  endedCycleKey,
  endedCycles,
  restartRule,
  type EndedCycle,
} from "@/lib/protocol/endedCycles"

/* ----------------------------------------------------------- end / restart */

/**
 * End a compound's cycle from `todayKey` — exactly today's Remove. The compound
 * keeps running on its schedule without weeks off; its logs stay; the run shows
 * under Ended from now on. Returns false if the compound is not on this device
 * or the write failed.
 *
 * ## A cycle begun today (cold review B14 / F3)
 *
 * One version per day, so End REPLACES a version written earlier today. When
 * that version was the cycle's only one (a new cycle today, or a compound added
 * today with one), the trail kept no run and Ended stayed empty, though the End
 * dialog says "you can restart it from Ended". In exactly that case the End
 * version keeps the rule as `endedCycle`, and `endedCycles` lists it as a run
 * that began and ended today, with Restart.
 *
 * Only when nothing else already lists it: ending a Restart made today (its
 * Undo, too) leaves the run it restarted under Ended, as before, so Undo puts
 * back exactly the row the user restarted.
 */
export function endCycle(userId: string, compoundId: string, todayKey: string): boolean {
  const compound = (loadStack(userId) ?? []).find((c) => c.id === compoundId)
  if (!compound) return false
  const ending = compound.cycle ?? resolveScheduleOn(compound, todayKey).cycle
  const keep =
    ending && !stillListed(compound, ending, todayKey, hiddenEndedCycles(userId))
      ? ending
      : undefined
  return setCompoundCycle(
    userId,
    compoundId,
    null,
    todayKey,
    keep ? { endedCycle: keep } : undefined
  )
}

/**
 * Would Ended still show `ending` once End is written without keeping it? Either
 * as itself, or as the run it is a Restart of (Restart re-anchors a rule, so the
 * restarted rule is `restartRule` of the row it came from).
 */
function stillListed(
  compound: StackCompound,
  ending: CycleRule,
  todayKey: string,
  hidden: ReadonlySet<string>
): boolean {
  const after = compoundWithCycle(compound, null, todayKey)
  return endedCycles([after], todayKey, hidden).some(
    (e) => sameCycle(e.rule, ending) || sameCycle(restartRule(e, todayKey), ending)
  )
}

export type RestartCycleResult =
  | { ok: true }
  | {
      ok: false
      reason:
        /** The row is stale: the compound was deleted, is on a cycle again, or
         *  this run was deleted for good. Nothing was written. */
        | "gone"
        /** The device write failed (storage full or blocked). */
        | "not-saved"
    }

/**
 * Put an ended cycle back on its compound from `todayKey`, as a fresh run (see
 * `restartRule` for how the anchor and an end date move, and the two cases that
 * re-apply the rule unchanged). Undo: {@link endCycle} on the same day.
 *
 * The row is re-derived from the device store first, so a stale screen cannot
 * restart a cycle over one that is already running.
 */
export function restartCycle(
  userId: string,
  ended: Pick<EndedCycle, "key" | "compoundId">,
  todayKey: string
): RestartCycleResult {
  const compound = (loadStack(userId) ?? []).find((c) => c.id === ended.compoundId)
  const current = compound
    ? endedCycles([compound], todayKey, hiddenEndedCycles(userId)).find((e) => e.key === ended.key)
    : undefined
  if (!current) return { ok: false, reason: "gone" }
  return setCompoundCycle(userId, current.compoundId, restartRule(current, todayKey), todayKey)
    ? { ok: true }
    : { ok: false, reason: "not-saved" }
}

/* ------------------------------------------------- delete for good (hidden) */

/**
 * ⚠️ PER DEVICE, NOT SYNCED. The ended-cycle keys the user deleted for good.
 *
 * A device PREFERENCE in the sense `architecture.md` → Storage Model uses (with
 * `trackd.unitPrefs.*` and the rest): never mirrored, never a record. Deleting a
 * cycle on the phone therefore leaves it under Ended on another device or after
 * a reinstall. That is the price of no schema change (build-brief-final §5); a
 * later migration can move this list to Postgres without touching the trail.
 *
 * Best-effort, as that section requires: the list is HELD in memory for the
 * session and storage only remembers it, so a full or blocked storage costs the
 * memory of a delete across reloads, never the delete itself.
 */
const hiddenKey = (userId: string) => `trackd.cycles.endedHidden.v1.${userId}`
const HIDDEN_KEY_PREFIX = "trackd.cycles.endedHidden.v1."

/** Same-tab signal that the hidden list changed (cross-tab is `storage`). */
export const ENDED_HIDDEN_CHANGED_EVENT = "trackd:ended-cycles-hidden-changed"

/** The server snapshot, and the answer when nothing is hidden. */
export const EMPTY_HIDDEN: ReadonlySet<string> = new Set<string>()

/** The list this tab last read or wrote. Also what keeps the snapshot stable for
 *  `useSyncExternalStore`: the same Set comes back until something changes it. */
let held: { userId: string; keys: ReadonlySet<string> } | null = null

function readStored(userId: string): ReadonlySet<string> {
  if (typeof window === "undefined") return EMPTY_HIDDEN
  try {
    const raw = window.localStorage.getItem(hiddenKey(userId))
    if (!raw) return EMPTY_HIDDEN
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY_HIDDEN
    const keys = parsed.filter((k): k is string => typeof k === "string" && k !== "")
    return keys.length > 0 ? new Set(keys) : EMPTY_HIDDEN
  } catch {
    return EMPTY_HIDDEN
  }
}

/** The keys deleted for good on this device. Pass to `endedCycles` to filter. */
export function hiddenEndedCycles(userId: string): ReadonlySet<string> {
  if (!held || held.userId !== userId) held = { userId, keys: readStored(userId) }
  return held.keys
}

/** Hold the new list, remember it best-effort, notify. True when storage took it. */
function writeHidden(userId: string, keys: ReadonlySet<string>): boolean {
  held = { userId, keys }
  if (typeof window === "undefined") return false
  let saved = false
  try {
    window.localStorage.setItem(hiddenKey(userId), JSON.stringify([...keys]))
    saved = true
  } catch {
    saved = false
  }
  try {
    window.dispatchEvent(new CustomEvent(ENDED_HIDDEN_CHANGED_EVENT))
  } catch {
    // Nothing is listening that cannot re-read on its next render.
  }
  return saved
}

/**
 * Delete an ended cycle for good (from this device's Ended list). The row goes
 * either way; false means the device could not REMEMBER it past this session.
 */
export function hideEndedCycle(userId: string, key: string): boolean {
  const cur = hiddenEndedCycles(userId)
  if (cur.has(key)) return true
  return writeHidden(userId, new Set([...cur, key]))
}

/** Undo of {@link hideEndedCycle}: the row comes back. */
export function unhideEndedCycle(userId: string, key: string): boolean {
  const cur = hiddenEndedCycles(userId)
  if (!cur.has(key)) return true
  const next = new Set(cur)
  next.delete(key)
  return writeHidden(userId, next.size > 0 ? next : EMPTY_HIDDEN)
}

/**
 * Follow a hydration that moved compounds to their Postgres ids (cold review S1).
 *
 * The keys are `compoundId|runStart` (`endedCycleKey`), and hydration re-keys a
 * compound matched by NAME to its Postgres id (`idRemap` in
 * `hydrateProtocol.ts`), taking its logs and stack places with it. Left behind,
 * a cycle deleted for good came back under Ended with its new key. The run's
 * start does not move, so only the id half is rewritten.
 */
export function remapHiddenEndedCycles(
  userId: string,
  idRemap: ReadonlyMap<string, string>
): void {
  if (idRemap.size === 0) return
  const cur = hiddenEndedCycles(userId)
  if (cur.size === 0) return
  let changed = false
  const next = new Set<string>()
  for (const key of cur) {
    // Split at the LAST bar: the run start is a date and holds none, and a
    // fallback compound id is not promised not to.
    const at = key.lastIndexOf("|")
    const to = at > 0 ? idRemap.get(key.slice(0, at)) : undefined
    if (to) {
      next.add(endedCycleKey(to, key.slice(at + 1)))
      changed = true
    } else {
      next.add(key)
    }
  }
  if (changed) writeHidden(userId, next)
}

/** For `useSyncExternalStore`, with {@link hiddenEndedCycles} as the snapshot. */
export function subscribeHiddenEndedCycles(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const onStorage = (e: StorageEvent) => {
    // Another tab wrote it: drop what this tab holds so the next read is fresh.
    if (e.key !== null && !e.key.startsWith(HIDDEN_KEY_PREFIX)) return
    held = null
    callback()
  }
  window.addEventListener(ENDED_HIDDEN_CHANGED_EVENT, callback)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(ENDED_HIDDEN_CHANGED_EVENT, callback)
    window.removeEventListener("storage", onStorage)
  }
}
