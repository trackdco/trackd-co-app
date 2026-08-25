/**
 * ⚠️ THE REMINDER PROMISE, AND THE ONE SWITCH THAT WITHHOLDS BOTH HALVES OF IT.
 *
 * Spec `04` §0 makes this spec and `07-notifications.md` a SHIP-TOGETHER PAIR.
 * Two strings promise a reminder before a courtesy charge:
 *
 *   1. the offer's terms line ends "and we'll remind you first";
 *   2. the accept screen's quieter footnote, "We'll remind you before that
 *      happens."
 *
 * Per the amended D1, the release condition is a reminder VERIFIABLY FIRING
 * before a courtesy charge on a Stripe test clock. That observation is not the
 * builder's to produce.
 *
 * ## ⚠️ THIS DIVERGES FROM §0 AS WRITTEN, ON THE FOUNDER'S EXPLICIT AMENDMENT
 *
 * `04` §0 still reads "**If that reminder cannot be proven to fire, the sentence
 * does not ship, and neither does this spec**", and immediately above it, "ship
 * together or not at all". Read literally, a failed observation pulls the whole
 * spec rather than two sentences, and this module would have no reason to exist.
 *
 * **Adrian, 2026-08-16, amending that clause directly:** if the reminder cannot
 * be observed firing, `04` still ships with exactly these two strings withheld,
 * both together or neither, and the withhold is to be a FLAG so that Monday's
 * outcome is a config change rather than a Wednesday code change.
 *
 * It is recorded here rather than assumed because a reviewer reading §0 against
 * this file will otherwise find a contradiction and be right to. §0 is the text
 * that needs updating; this comment names who overrode it and when.
 *
 * ## Why this is a flag and not an edit
 *
 * The observation lands the Monday before launch. A code change on the Wednesday
 * is a diff, a review and a deploy against a launch deadline; a config change is
 * an environment variable. So the withhold is built NOW and switched later.
 *
 * ## ⚠️ IT FAILS TOWARD NOT PROMISING
 *
 * `REMINDER_PROMISE_ENABLED` unset means the strings are WITHHELD. Forgetting to
 * set it costs a promise that could have been made; setting it wrongly, or
 * defaulting it on, makes a promise the product does not keep — to somebody who
 * is about to be charged. Those two mistakes are not the same size, and the
 * default is chosen for the one that is survivable.
 *
 * ## ⚠️ BOTH TOGETHER OR NEITHER, NEVER ONE
 *
 * Half the promise is worse than none of it: the terms line saying "we'll remind
 * you first" while the thank-you screen is silent reads as the app quietly
 * dropping the commitment between one screen and the next. Both strings are
 * derived HERE, from the same boolean, so there is no arrangement of the calling
 * code that can ship one without the other. `reminderPromise.test.ts` asserts
 * the pairing directly.
 *
 * Pure, and deliberately NOT `server-only`: the strings render in a client
 * component. The env read lives in `gate.ts` and the ANSWER travels as a prop,
 * which is the same split `billingGateEnabled` uses.
 */

/**
 * The clause appended to the terms line. Signed copy: it is APPENDED and REMOVED
 * whole, never reworded, and the comma belongs to the clause rather than to the
 * sentence before it.
 */
const REMINDER_CLAUSE = ", and we'll remind you first";

/** The accept screen's footnote. Signed copy. */
const REMINDER_QUIET = "We'll remind you before that happens.";

/**
 * The offer's terms line, which names the charge AND the date.
 *
 * ⚠️ `04` §2 forbids moving, rewording, softening or folding this line. It sits
 * above the buttons in its own field. The only thing `promised` changes is
 * whether the final clause is present; every other character is fixed, and the
 * withheld form still ends in a full stop and still names the charge and the day.
 *
 * `chargeOn` is already formatted, on the server, in the user's own timezone, by
 * the same functions that perform the grant. This never formats a date and never
 * computes one.
 */
export function offerTermsLine(chargeOn: string, promised: boolean): string {
  return `${offerTermsLead()} ${offerTermsCharge(chargeOn, promised)}`;
}

/**
 * ⚠️ THE TERMS ARE TWO LINES NOW, AND THE SPLIT IS A RENDERING CHANGE ONLY.
 *
 * The redesign (Adrian, 2026-08-25) centres the terms and breaks them across two
 * lines with the charge date in bold. The SENTENCE is unchanged in substance and
 * the rejoin is proven: `offerTermsLine` is now built FROM these two rather than
 * duplicating them, so `lead + " " + charge` is the signed line by construction
 * and there is no arrangement of the calling code that can render one without
 * the other, or render a third wording.
 *
 * ⚠️ THE FIRST SENTENCE IS RE-SIGNED. It read "Your plan carries on as it is."
 * and now reads "By accepting, your plan will continue as is." — the redesign
 * names the ACT, because this line sits directly above a button that performs it.
 */
export function offerTermsLead(): string {
  return "By accepting, your plan will continue as is.";
}

/**
 * ⚠️ THE HALF THAT NAMES THE CHARGE, AND THE HALF THE PROMISE HANGS OFF.
 *
 * `REMINDER_CLAUSE` still attaches HERE and nowhere else, so `04` §0's
 * ship-together pair is intact across the split: `reminderQuietLine` and this
 * clause are still derived from the one boolean. ⚠️ Splitting the terms must
 * never leave the clause on the lead sentence — "By accepting, your plan will
 * continue as is, and we'll remind you first" promises a reminder about the
 * wrong event.
 */
export function offerTermsCharge(chargeOn: string, promised: boolean): string {
  return `You'll be charged on ${chargeOn} unless you cancel before then${
    promised ? REMINDER_CLAUSE : ""
  }.`;
}

/**
 * The charge sentence split around the date, so the date can be bold WITHOUT the
 * component holding any of the words.
 *
 * ⚠️ IT SPLITS THE SIGNED STRING RATHER THAN REBUILDING IT. `before + date +
 * after === offerTermsCharge(date, promised)` is asserted in
 * `signedCopyPin.test.ts`, the same losslessness proof `splitSummary` carries.
 * A component that interpolated its own `<strong>{date}</strong>` between two
 * hand-typed halves would be two more unpinnable literals in `components/`,
 * which is exactly what the four offer strings above were just moved out of.
 *
 * ⚠️ `indexOf`, not a regex: a formatted date can contain regex metacharacters
 * in some locales, and a date that failed to match would silently return the
 * whole sentence with no bold rather than failing loudly.
 */
export function offerTermsChargeParts(
  chargeOn: string,
  promised: boolean,
): { before: string; date: string; after: string } {
  const full = offerTermsCharge(chargeOn, promised);
  const at = full.indexOf(chargeOn);
  if (at === -1) return { before: full, date: "", after: "" };
  return { before: full.slice(0, at), date: chargeOn, after: full.slice(at + chargeOn.length) };
}

/**
 * The accept screen's footnote, or nothing.
 *
 * `undefined` rather than an empty string: `DialogCopy.quiet` is optional and an
 * absent field renders no element at all, where an empty string would leave a
 * styled node holding a blank line under the body.
 */
export function reminderQuietLine(promised: boolean): string | undefined {
  return promised ? REMINDER_QUIET : undefined;
}
