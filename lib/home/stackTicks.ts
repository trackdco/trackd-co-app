/**
 * What the whole-stack tick acts on — the one rule behind both directions of
 * the control on the dashboard's stack row (Spec 05).
 *
 * It lives in `lib/` rather than inside `TodaysCycleCard` because it is the part
 * that can be WRONG in a way markup cannot: pick the wrong slots and a tap
 * deletes doses the user never meant to touch, and there is no undo anywhere in
 * this app to walk it back. The component keeps the rendering; this keeps the
 * decision, and the decision is tested.
 *
 * Pure helpers; no React, no side effects (code-standards.md).
 */
import type { DaySlot } from "@/lib/home/doseLog"

/** The minimum a member has to look like for these rules to read it. */
export interface StackTickMember {
  /** Paused on the day being shown. Paused members stay VISIBLE in the row
   *  (blacked out) but are never acted on. */
  paused?: boolean
  slots: DaySlot[]
}

/** One dose the whole-stack control would act on. */
export interface StackTickTarget<M> {
  compound: M
  slot: number
}

/**
 * The members a stack tick may act on at all: everything not paused.
 *
 * A paused member is still listed in the row, because the row should keep
 * showing everything the stack contains (Adrian, 2026-08-07) — it is simply not
 * something the day's tick has any business changing.
 */
export function liveMembers<M extends StackTickMember>(members: M[]): M[] {
  return members.filter((m) => !m.paused)
}

/**
 * Every dose a whole-stack UNTICK would remove: each live member's logged slots,
 * minus the ones deliberately marked Skipped.
 *
 * **Two exclusions, one rule — don't touch what was decided separately**
 * (Adrian, 2026-08-12: "if a compound is paused or if a compound is skipped,
 * then it shouldn't change it because that's just what the compound was
 * before").
 *
 *  - PAUSED members are out via {@link liveMembers}, and would have no log to
 *    remove in any case.
 *  - A SKIPPED dose is a recorded decision, not a tick. Clearing it would put the
 *    day back to undealt-with and destroy the fact that the user consciously
 *    passed on that compound — which is information the tick never created and
 *    has no standing to delete.
 *
 *  - A HISTORIC slot is one the schedule no longer has — a dose taken under an
 *    older, longer schedule, which `slotsForDay` appends **only because it
 *    carries a log**. Delete that log and the slot itself disappears on the next
 *    render, and nothing in the app can re-create it: there is no control for
 *    "add a fourth dose to a compound that is now taken three times a day". The
 *    justification for one-tap unticking is "they can always re-log it", and for
 *    these alone that is simply false, so the bulk control leaves them to the
 *    individual tick that can still reach them. (Cold review, 2026-08-12.)
 *
 * Doses carrying an INJECTION SITE are removed. A stack tick never records one
 * (`onLogStack` passes `siteId: null`, because a bulk tick has no body map and
 * inventing a site would corrupt the rotation view), so a site can only be there
 * because that member was ticked individually — and unticking one of those from
 * its own row already discards it. Sparing them would leave rows mysteriously
 * ticked after an "untick all", which reads as the control being broken.
 *
 * Returns them in member order, then slot order, so an "untick all" is applied
 * in the same order a user working down the row by hand would.
 */
export function stackUnlogTargets<M extends StackTickMember>(
  members: M[],
): StackTickTarget<M>[] {
  return liveMembers(members).flatMap((m) =>
    m.slots
      .filter((sl) => sl.log != null && sl.log.status !== "skipped" && !sl.historic)
      .map((sl) => ({ compound: m, slot: sl.slot })),
  )
}

/**
 * The members a whole-stack TICK would log, and it is not simply "the ones with
 * no log".
 *
 * A member counts as having something left to do when ANY of its slots is
 * unlogged — a twice-daily compound with its morning dose in is still due this
 * evening. The caller logs each one's NEXT unlogged slot, so one tap advances
 * every member by one dose rather than completing a twice-daily member's whole
 * day at once.
 */
export function stackLogTargets<M extends StackTickMember>(members: M[]): M[] {
  return liveMembers(members).filter((m) => m.slots.some((sl) => sl.log == null))
}

/** Doses logged / doses due for a stack on the day, counted in DOSES rather than
 *  members — a twice-daily member contributes two, so a stack cannot read
 *  complete with its evening dose still untaken. Paused members count for
 *  nothing, or a stack could never reach 100% and would nag about doses nobody
 *  is taking. */
export function stackProgress<M extends StackTickMember>(
  members: M[],
): { logged: number; total: number; complete: boolean; partial: boolean } {
  const live = liveMembers(members)
  const logged = live.reduce(
    (n, m) => n + m.slots.filter((sl) => sl.log != null).length,
    0,
  )
  const total = live.reduce((n, m) => n + m.slots.length, 0)
  const complete = logged === total && total > 0
  return { logged, total, complete, partial: logged > 0 && !complete }
}

/* --------------------------------------------------- the double-tap guard */

/** Which direction a whole-stack action went. */
export type BulkTickKind = "log" | "unlog"

/** The last whole-stack action taken on a row, and when. */
export interface BulkTickMark {
  /** A MONOTONIC timestamp (`performance.now()`), never a wall clock — see
   *  {@link isReflexReversal}. */
  at: number
  kind: BulkTickKind
}

/**
 * How long after one whole-stack action the OPPOSITE one is treated as a stray
 * second tap. Long enough to swallow a double-tap, short enough that a
 * deliberate reversal never feels blocked.
 */
export const REVERSE_GUARD_MS = 600

/**
 * Is this tap the reflex second half of a double-tap, rather than a decision?
 *
 * Ticking a stack flips the SAME 24px target from "log all" to "untick all", and
 * unticking flips it back — so two quick taps in the same place do opposite
 * things. On a partial stack that logged five doses and immediately deleted
 * them, planting five fourteen-day tombstones and destroying any hand-edited
 * amount, time or site; on a complete one it deleted five doses and re-logged
 * them from the plan, leaving the row looking exactly as it had. Both directions
 * need the guard, which the first attempt got wrong by covering only one.
 *
 * Only a REVERSAL is refused. Repeated taps the same way are legitimate — one
 * advances a twice-daily member to its second dose — and are let through.
 *
 * `now` is passed in, and must come from a MONOTONIC clock. A wall clock can
 * step backwards (an NTP correction, a manual change), and a negative elapsed
 * time reads as "inside the window", which would leave the control dead until
 * the clock caught up.
 */
export function isReflexReversal(
  previous: BulkTickMark | null,
  kind: BulkTickKind,
  now: number,
  windowMs: number = REVERSE_GUARD_MS,
): boolean {
  if (!previous || previous.kind === kind) return false
  return now - previous.at < windowMs
}
