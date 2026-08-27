/**
 * ⚠️ THE DECLINED-PAYMENT BANNER'S SIGNED COPY (Group D, founder ruling).
 *
 * ## The gap this closes
 *
 * Today a failed payment reaches somebody two ways: a push notification if they
 * allowed them — 17 accounts of 106 at the last count — and `DeclinedCard`, which
 * they only see if they open `/billing`. With push off and no reason to open
 * Billing, the first they hear of it is being locked out.
 *
 * The dashboard already has a banner slot. The beta notice and `07`'s trial
 * reminders both use it, and `05` §3.6b's final-day line is already the ELSE
 * branch of the same ternary. This is the same mechanism, not a new one.
 *
 * ## ⚠️ NOT A POP-UP. FOUNDER'S RULING.
 *
 * The read-only pop-up (`readOnlyCopy.ts`) already interrupts on a blocked write,
 * and two dialogs about one problem is how people stop reading both.
 *
 * ## Why the words live in `lib/` and not in the component
 *
 * `signed/README.md`'s standing rule, paid for twice in one batch: a signed string
 * that is rendered to a user gets a machine check, and if it cannot be reached
 * from `lib/` then MOVING IT IS THE FIRST HALF OF THE FIX. `vitest.config.ts`
 * includes `lib/**\/*.test.ts` and nothing else, so JSX text in `components/` is
 * unreachable — which is how the read-only pop-up's first clause was reverted to
 * a wording D98 had ruled FALSE with all 1573 tests green.
 *
 * ## ⚠️ TWO WINDOWS, AND THE SECOND NAMES NO DATE ON PURPOSE
 *
 * The same split `DeclinedCard` and `manageSummary` both already make, selected on
 * the same fact — whether the entitlement is still live — rather than on the date,
 * which is present in both windows.
 *
 *   INSIDE THE GRACE   they still have access, and this is the one that matters.
 *                      It names the day the grace ends so they can act on it.
 *   AFTER THE LAPSE    no date, deliberately: nobody can promise when a Stripe
 *                      Smart Retry lands, so any date here would be invented.
 *
 * ⚠️ AND THE FIRST ONE IS WITHHELD WITHOUT ITS DATE, never reworded and never
 * given the second sentence instead. "Your account is read only" is FALSE for
 * somebody inside the grace, so the after-lapse line is not a fallback for them —
 * it is a different claim about a different state.
 */

/** ⚠️ SIGNED. Character for character, no em dash. `lib/billing/signed/past-due-banner.txt`. */
export const PAST_DUE_BANNER_IN_GRACE = (date: string) =>
  `Your payment didn't go through. Update your card by ${date} to keep access.`;

/** ⚠️ SIGNED. Names no date, deliberately. See the header. */
export const PAST_DUE_BANNER_LAPSED =
  "Your last payment didn't go through, so your account is read only. " +
  "Update your card details to reclaim access.";

/**
 * WHICH SENTENCE THIS ACCOUNT GETS, OR NONE.
 *
 * Pure, so the one decision that puts an unsolicited warning on somebody's home
 * screen can be driven without a database, a clock or a browser.
 *
 * ⚠️ `accessKnown` IS REQUIRED, AND THE DIRECTION IS THE DASHBOARD'S OWN RULE.
 * `accessLive` is false both for "they have lapsed" and for "the entitlements
 * table would not answer", and only the first is something to tell somebody. The
 * dashboard already withholds the beta notice on an unreadable read for the same
 * reason: a banner is unsolicited, unlike `/billing`, which the user opened
 * specifically to find out. `DeclinedCard` makes the opposite call and is right to
 * — it is answering a question that was asked.
 */
export function pastDueBannerFor(facts: {
  /** Is there a `past_due` row in the mirror for this account? */
  isPastDue: boolean;
  /** Did the entitlement read work? False withholds everything. */
  accessKnown: boolean;
  /** Does this person still hold access — i.e. are they inside the grace? */
  accessLive: boolean;
  /**
   * When the grace ends, ALREADY FORMATTED in the user's stored timezone.
   *
   * From `entitlements.active_until` — the value `markPastDue` writes and the
   * table that decides access — never the mirror's period end, which on a
   * past-due subscription is the end of a period nobody paid for.
   */
  graceEndsOn: string | null;
}): string | null {
  if (!facts.isPastDue) return null;
  if (!facts.accessKnown) return null;
  if (!facts.accessLive) return PAST_DUE_BANNER_LAPSED;
  // Inside the grace, and the sentence needs its date. Withheld, never reworded.
  if (!facts.graceEndsOn) return null;
  return PAST_DUE_BANNER_IN_GRACE(facts.graceEndsOn);
}
