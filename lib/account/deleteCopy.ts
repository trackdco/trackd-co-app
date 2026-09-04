/**
 * ⚠️ THE DELETION SCREEN'S COPY. SIGNED, AND CHARACTER-FOR-CHARACTER SACRED.
 *
 * Seven strings signed by Adrian on 2026-09-03 and recorded the moment they were
 * issued at `Context/progress-tracker.md:3043`, plus the money line, which was
 * signed earlier as D59 and lives verbatim in
 * `Context/Feature Specs/Billing Specs/billing-16-account-deletion.md:128`.
 *
 * ⚠️ **DO NOT EDIT ANY STRING IN THIS FILE.** Not to fix a typo, not to soften a
 * sentence, not to satisfy a lint rule. `deleteCopyPin.test.ts` compares every
 * one against `signed/delete-account.txt` byte for byte and fails on any drift.
 * If a word is wrong, that is a question for the founder, not a patch.
 *
 * ## ⚠️ THE APOSTROPHE IN `dismiss` IS A STRAIGHT QUOTE (U+0027), AS ISSUED
 *
 * Adrian, 2026-09-04, ruling on it explicitly: keep the straight quote, do not
 * substitute an entity, and report rather than change it if the surrounding
 * typography makes it look inconsistent.
 *
 * That is also why every string is rendered from a constant rather than typed as
 * JSX text. `react/no-unescaped-entities` objects to a bare `'` in markup and the
 * usual fix is `&rsquo;`, which would silently replace the signed character with
 * a different one. Threading it through a constant sidesteps the rule without
 * touching the byte.
 *
 * ## No em dashes
 *
 * House rule for every user-facing string, and the pin test asserts it here
 * rather than trusting a reading.
 */

/** The seven strings Adrian signed, in the order he issued them. */
export const DELETE_ACCOUNT_COPY = {
  title: "Are you sure you want to delete your account?",

  body:
    "All of your compounds, doses, photos, bloodwork and metrics will be " +
    "completely erased and unrecoverable.",

  /** Sits above the input. Names the word in the case it must be typed in. */
  inputLabel: "Type DELETE to confirm",

  placeholder: "DELETE",

  /** The destructive control. Disabled until the typed string matches exactly. */
  confirm: "Yes, delete my account",

  /** ⚠️ Straight apostrophe (U+0027). See the module comment. */
  dismiss: "I'd rather stay",

  /**
   * ⚠️ RENDERS ONLY WHEN AN OPEN REFUND REQUEST EXISTS (D56, answered by this
   * copy being signed at all: warn, and retain nothing).
   */
  refundWarning:
    "You have a refund request open. Deleting your account will remove it, and " +
    "we will not be able to follow up with you here.",
} as const;

/**
 * ⚠️ D59, THE MONEY LINE. Signed separately and earlier, and quoted verbatim in
 * `16-account-deletion.md:128`.
 *
 * **It renders only when a live subscription or trial exists.** An account with
 * neither sees no money line at all, because a sentence about a subscription
 * somebody does not have is noise on the one screen where clarity matters most.
 *
 * ⚠️ It does not imply a refund and must never be edited to. Stripe does not
 * refund the remainder and this flow does not ask it to; that is a support
 * decision made by a person with the invoice in front of them, which is `10`'s
 * territory rather than this one's.
 */
export const DELETE_ACCOUNT_MONEY_LINE =
  "Your subscription will be cancelled. Any remaining paid time ends when your " +
  "account is deleted, and no further charges will be made.";

/**
 * ⚠️ THE MATCH IS EXACT AND CASE-SENSITIVE. `delete` does not enable the button.
 *
 * Pure, exported and tested rather than inlined in the component, because D58
 * makes this the whole safety mechanism of the screen: "the friction is the
 * feature". A near-miss must not pass, and no trimming, folding or normalising
 * may creep in — each of those would quietly widen what counts as consent to
 * erasing somebody's health data.
 *
 * ⚠️ No `.trim()`. A trailing space is a near-miss, and the input is the user's
 * own deliberate act rather than a value being parsed.
 */
export function deletionConfirmed(typed: string): boolean {
  return typed === DELETE_ACCOUNT_COPY.placeholder;
}
