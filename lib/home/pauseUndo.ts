/**
 * What the Home toasts' Undo may do after a pause or a resume (build-brief-final
 * §3.16: "Paused" with Undo, "Resumed" with Undo).
 *
 * A pause that TOUCHES an existing one is merged into it by the store (a pause
 * is never additive), and the store has no way to split that merge again. So
 * Undo is offered on a pause only when it stood alone: then undoing it is ending
 * it on its own first day, which the store turns into a delete.
 *
 * A resume is undone by pausing again with the very pause it ended: the store
 * merges that range back over the shortened one, which restores it exactly.
 *
 * Pure: no React, no storage.
 */
import { activePause, type Pause } from "@/lib/home/pauses"

/** `YYYY-MM-DD` shifted by n days, in UTC. */
function shift(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Do these ranges overlap or sit end to end? The store's own rule. */
export function rangesTouch(
  a: { startedOn: string; endsOn: string | null },
  b: { startedOn: string; endsOn: string | null },
): boolean {
  const aEnd = a.endsOn === null ? null : shift(a.endsOn, 1)
  const bEnd = b.endsOn === null ? null : shift(b.endsOn, 1)
  if (aEnd !== null && aEnd < b.startedOn) return false
  if (bEnd !== null && bEnd < a.startedOn) return false
  return true
}

/** Can a new pause over `range` be undone cleanly on every one of these? */
export function pauseUndoable(
  compounds: { pauses?: readonly Pause[] }[],
  range: { startedOn: string; endsOn: string | null },
): boolean {
  if (compounds.length === 0) return false
  return compounds.every((c) => !(c.pauses ?? []).some((p) => rangesTouch(p, range)))
}

/**
 * The pauses a resume on `on` is about to end, so Undo can put them back:
 * the one active pause, or with `groupId` every pause of that group still
 * running on `on` (the group resume leaves ones already over alone).
 */
export function pausesEndedBy(
  compounds: { id: string; pauses?: readonly Pause[] }[],
  on: string,
  target: { compoundId: string } | { groupId: string },
): { compoundId: string; pause: Pause }[] {
  if ("compoundId" in target) {
    const c = compounds.find((x) => x.id === target.compoundId)
    const p = c ? activePause(c.pauses, on) : null
    return c && p ? [{ compoundId: c.id, pause: p }] : []
  }
  const out: { compoundId: string; pause: Pause }[] = []
  for (const c of compounds) {
    for (const p of c.pauses ?? []) {
      if (p.groupId !== target.groupId) continue
      if (p.endsOn !== null && p.endsOn < on) continue
      out.push({ compoundId: c.id, pause: p })
    }
  }
  return out
}
