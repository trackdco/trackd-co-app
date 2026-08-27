/**
 * WHICH RECORDED RULE WAS IN FORCE ON A DAY — the one selection rule, shared.
 *
 * A compound's schedule is versioned (Spec 01): each edit, each cycle change and
 * each DELETE records a version effective from a date, and the rule in force on
 * any day is the latest version that had taken effect by then. `resolveScheduleOn`
 * (lib/home/stack.ts) reads the whole rule off that version; the push runner reads
 * one field off it. Both ask the same question, so they ask it here.
 *
 * ## Why this is its own module rather than a second copy
 *
 * The notification runner is the SERVER-SIDE MIRROR of the client's `isDueOnFor`,
 * and every gate the client applied but the mirror did not has cost the same way:
 * the app correctly showed nothing due while the push announced a dose and then
 * nagged for "missing" it. Cycles cost it once (`e70d714`), pauses cost it again,
 * and STOPPED cost thirteen days of daily reminders for compounds deleted on
 * 31 July — the app had dropped them, `protocol_compounds.is_active` had not
 * caught up, and the trail saying so was sitting in Postgres unread.
 *
 * So the rule lives in one place and both sides import it, exactly as the cycle
 * gate ended up importing `isOnCycle` rather than reimplementing the arithmetic.
 *
 * Pure: no React, no storage, no side effects (`code-standards.md`).
 */

/** The shape both readers share: a version is a date and (maybe) a stop. */
export interface DatedVersion {
  /** YYYY-MM-DD, the day this rule took effect. */
  effectiveFrom: string
  /** True on the version a DELETE writes — the compound was not being run. */
  stopped?: boolean
}

/**
 * The version governing `dateKey`, or null when there are none.
 *
 * The latest version that had taken effect by that day. A day that PREDATES every
 * recorded version falls back to the earliest, because that is the oldest rule we
 * know of — never the current one, which would be the retroactive rewrite
 * versioning exists to stop.
 *
 * Dates are compared as strings: `YYYY-MM-DD` sorts lexicographically in calendar
 * order, and nothing here has a timezone, so the caller resolves its own local day
 * first and this stays date-only.
 */
export function versionInForceOn<T extends DatedVersion>(
  versions: readonly T[],
  dateKey: string
): T | null {
  let best: T | null = null
  let earliest: T | null = null
  for (const v of versions) {
    if (!earliest || v.effectiveFrom < earliest.effectiveFrom) earliest = v
    if (v.effectiveFrom > dateKey) continue
    if (!best || v.effectiveFrom > best.effectiveFrom) best = v
  }
  return best ?? earliest
}

/**
 * Was the compound STOPPED on this day — i.e. deleted, and not since re-added?
 *
 * A stopped stretch is not a rest day within a schedule: the compound was not
 * being run at all, so nothing was due, nothing can be missed, and nothing may be
 * announced. A re-add records its own version, and `recordScheduleVersion` drops
 * every version dated after it, so the stop stops governing from that day forward
 * without anything having to be deleted.
 *
 * No versions at all ⇒ NOT stopped. That is every compound until one is edited,
 * and it must read as running rather than as unknown.
 */
export function isStoppedOn(
  versions: readonly DatedVersion[],
  dateKey: string
): boolean {
  return versionInForceOn(versions, dateKey)?.stopped === true
}
