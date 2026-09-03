import { dayNumber, localParts } from "@/lib/notifications/reminders";

/**
 * HOW MANY DAYS ARE LEFT OF THE BETA GRACE — the one-shot seven-day notice.
 *
 * ## Why this exists at all
 *
 * `06`'s launch notice announced the fortnight. Nothing announced its END until
 * `07`'s reminder, which opens two days out. That left a twelve-day silence in
 * the middle of the only warning window the beta cohort gets, and on 3 Sep 2026
 * eighty-two accounts sat exactly in it: dated `2026-09-10T04:00:11Z`, one week
 * from read-only, with five of them having ever seen a screen about billing.
 *
 * Adrian, 2026-09-03: a one-time popup, seven days out, telling them.
 *
 * ## ⚠️ THE COUNT IS DERIVED AND THE COPY NEVER TYPES IT
 *
 * The notice shows ONCE, ever, but "once" is not "today": somebody who does not
 * open the app until Friday must read **6 days**, not the seven that were true
 * when it was written. So the number is computed here at render time from the
 * entitlement row, and the component interpolates it.
 *
 * This is the same rule `06` §3.6 applies to the fortnight's end date and for
 * the same reason — a screen that contradicts its own date is Law 5, and the
 * contradiction always runs in the direction that takes access away early.
 *
 * ## Whole LOCAL days, in the user's own zone
 *
 * Compared as local date KEYS rather than by subtracting instants. "Two days
 * left" is a statement about calendar days, and 47 hours and 25 hours are both
 * "2 days" to the person reading it. `05` §3.6b's final-day banner already
 * settles the comparison this way; this matches it so the two surfaces cannot
 * disagree about which day is which.
 */

/**
 * Whole local days from today until the grace ends, or null when there is
 * nothing truthful to say.
 *
 * ⚠️ NULL IS RETURNED FOR THREE DIFFERENT REASONS AND THE CALLER MUST NOT
 * RENDER FOR ANY OF THEM:
 *
 *   no date          not a grace row. A free-for-life comp has no expiry, and
 *                    nothing is ending for them.
 *   unparseable      a row we cannot read is not a deadline we can announce.
 *   already lapsed   `now` is at or past the instant. `06` accepted this
 *                    outcome in writing: telling somebody on 12 Sep that they
 *                    have "until 10 Sep" is worse than saying nothing, and the
 *                    read-only pop-up explains the state they are actually in.
 *
 * ⚠️ THE INSTANT, NOT THE LOCAL DAY, decides "lapsed". Access ends AT
 * `active_until`, so a grace expiring 04:00 must stop claiming days remain at
 * 04:01 rather than at midnight. This is the same correction `trialNoticeFor`
 * carries, where a banner said "ends today" for the rest of a day on which the
 * money had already moved.
 */
export function graceDaysLeft(
  activeUntil: string | null | undefined,
  tz: string,
  now: Date,
): number | null {
  if (!activeUntil) return null;

  const endsAt = Date.parse(activeUntil);
  if (Number.isNaN(endsAt)) return null;
  if (now.getTime() >= endsAt) return null;

  const days =
    dayNumber(localParts(new Date(endsAt), tz).dateKey) -
    dayNumber(localParts(now, tz).dateKey);

  // Unreachable while `now < endsAt`, since a later instant cannot land on an
  // earlier local day in the same zone. Kept because the alternative to an
  // impossible negative is a headline reading "in -1 days".
  return days < 0 ? null : days;
}
