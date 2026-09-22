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
 * ⚠️ THE WORDING PRE-RENAME, KEPT AS THE RECORD — NOT SHOWN TO ANYBODY.
 *
 * 81 `consent_records` rows were granted against exactly these words, when the
 * product was called Trackd. Those rows are not re-granted by the rename and
 * their meaning does not change, so the sentence they were granted against has
 * to remain legible somewhere. This is that somewhere.
 *
 * ⚠️ DO NOT RENDER IT and do not "fix" the old name in it. A consent record is
 * a record of words a person actually read; editing those words after the fact
 * would make every pre-rename row a claim about a sentence nobody was shown.
 */
export const HEALTH_CONSENT_PRE_RENAME = {
  before:
    "I explicitly consent to Trackd processing my health-related data " +
    "(compounds, doses, bloodwork, body metrics, photos and journal entries) " +
    "to provide the Service, as described in the ",
  linkLabel: "Privacy Policy",
  linkHref: "/privacy",
  after: ".",
} as const;

/**
 * ⚠️ THE LIVE TICK. Re-signed for the rename (Adrian, 2026-09-22), and the word
 * "re-signed" is used deliberately.
 *
 * This sentence used to be pinned as unchangeable, for a good reason: the rows
 * already granted against it must not be rewritten. That reason is intact, and
 * it is why {@link HEALTH_CONSENT_PRE_RENAME} exists above rather than this
 * text simply being edited over.
 *
 * But it could not stay as it was either. The product is called Trakabl now, so
 * a NEW user ticking this box would be consenting to processing by "Trackd" — a
 * name that appears nowhere else in the app they are looking at. An Article 9
 * consent has to name the controller in terms the person can recognise, and the
 * Privacy Policy quotes this sentence verbatim (§1), so the two would also have
 * disagreed on the page that defines the consent.
 *
 * So: forward-looking consents are granted against these words, historical ones
 * against the words above, and neither rewrites the other. That is what
 * versioning a consent means, and it is the same shape as the second grace
 * sentence in `noticeCopy.ts` — a new sentence beside the old, never an edit
 * through it.
 */
export const HEALTH_CONSENT = {
  before:
    "I explicitly consent to Trakabl processing my health-related data " +
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
