/**
 * THE CONSENT SENTENCES, IN ONE PLACE, BECAUSE TWO SURFACES ASK FOR THE SAME
 * THING AND MUST NOT ASK FOR IT DIFFERENTLY.
 *
 * ## Why this file exists (Adrian, 2026-08-25)
 *
 * `/welcome` presented three explicit consents; onboarding presented ONE tick
 * naming three documents — and then wrote FOUR `consent_records` rows, including
 * `document: "health_data_consent"`. Measured 25 Aug 2026: 81 accounts carry that
 * row. For the onboarding cohort it records agreement to a sentence that was
 * never on their screen, for special-category health data, in a health product.
 *
 * ⚠️ `health_data_consent` IS NOT A TABLE. It is a VALUE in
 * `consent_records.document`. Probed live: `public.health_data_consent` does not
 * exist (PGRST205). Anything that reads "stop writing health_data_consent" means
 * one element of a four-row upsert array, never a table.
 *
 * ## ⚠️ THE WORDS LIVE HERE SO THEY CAN BE PINNED
 *
 * They were inline JSX in `app/welcome/gate-form.tsx`, interleaved with a link —
 * unreachable from `lib/`, and `vitest.config.ts` is
 * `include: ["lib/**\/*.test.ts"]`, so no test in this repo could see a drift.
 * Moving them was the first half of the job, not a reason to copy them.
 *
 * The sentence is split around its link rather than stored as one string,
 * because the link is part of the sentence and a component that hand-typed the
 * halves either side of it would put two more unpinnable literals back into
 * `components/`. `healthConsentSentence()` rejoins them, and
 * `consentCopy.test.ts` asserts the rejoin, so the three shapes cannot drift.
 */

/**
 * ⚠️ VERBATIM, character for character, from what `/welcome` has always shown.
 * It is NOT retyped and NOT reworded: the 81 existing rows were granted against
 * these words, and changing them is a re-signing, not an edit.
 */
export const HEALTH_CONSENT = {
  before:
    "I explicitly consent to Trackd processing my health-related data " +
    "(compounds, doses, bloodwork, body metrics, photos and journal entries) " +
    "to provide the Service, as described in the ",
  linkLabel: "Privacy Policy",
  linkHref: "/privacy",
  after: ".",
} as const;

/** The whole sentence as text — what a consent record is a record OF. */
export function healthConsentSentence(): string {
  return `${HEALTH_CONSENT.before}${HEALTH_CONSENT.linkLabel}${HEALTH_CONSENT.after}`;
}

/**
 * Onboarding's age-and-documents tick, which is NOT the health consent and never
 * covered it.
 *
 * ⚠️ IT IS UNCHANGED. The fix adds the health sentence beside it as part of the
 * same affirmative act; it does not reword this one, because 81 accounts already
 * agreed to exactly these words.
 */
export const AGE_AND_DOCS_LEAD = "I'm 18 or older and accept the ";
