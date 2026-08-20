/**
 * ⚠️ THE READ-ONLY POP-UP'S SIGNED COPY (05 §3.6, D98).
 *
 * ## Why the words live in `lib/` and not in the component
 *
 * They were JSX text inside `components/billing/ReadOnlyGate.tsx`, which the
 * committed suite cannot reach: `vitest.config.ts` includes `lib/**\/*.test.ts`
 * and nothing else, deliberately, because `lib/` is the pure layer. So the single
 * most-read billing sentence in the product had NO machine check — and a cold
 * review measured the cost by reverting the first clause to the wording D98 ruled
 * false and watching all 1573 tests pass.
 *
 * That is the whole reason this module exists. It is not indirection for its own
 * sake: **moving signed copy into `lib/` is what makes it pinnable**, and
 * `signed/README.md` records that as the standing rule.
 *
 * ## ⚠️ THIS IS SIGNED COPY. A FIX WITHHOLDS A LINE, IT NEVER REWORDS ONE.
 *
 * `lib/billing/signed/read-only-popup.txt` is the approved text, one line per
 * string, and `signedCopyPin.test.ts` diffs these values against it BY CODEPOINT.
 * Change a word here and the pin fails, which is the point.
 *
 * ## ⚠️ AND THE BODY IS ONE STRING FOR ALL SIX COHORTS. DO NOT BRANCH IT.
 *
 * Never had access, lapsed grace, lapsed trial, lapsed subscription, revoked, and
 * past-due after the lapse. They differ in origin and are identical in what they
 * can do, which is nothing but read. Adrian, 2026-08-17: if a second variant ever
 * seems necessary, that is the signal to stop and ask rather than write one.
 *
 * The instruction above has already fired once, and D98 is its answer:
 *
 *   · "You're not on a plan at the moment" is FALSE for a past-due customer who
 *     IS on a plan Stripe is still charging.
 *   · "Your access has ended" — the first reworking — is a statement about
 *     HISTORY and is false for anyone who never had access, which after the
 *     17 Aug backfill is every new sign-up.
 *
 * What is signed is a statement about NOW, which is true of all six. The answer
 * was to reword so one body fits, NOT to branch.
 */
export const READ_ONLY_POPUP = {
  /** "Read only" is the exact phrase; never "paused", "expired" or "locked". */
  title: "Your account is read only",
  /**
   * ⚠️ THE STATE LEADS, AND THE ORDERING IS THE DECISION. Somebody who has just
   * been blocked needs to know what is happening before they are told what it
   * would cost to undo it.
   */
  body:
    "You don't have access at the moment, so Trackd Co is read only. " +
    "You can still view everything you've logged, you just can't add to it.",
  reassurance: "Nothing has been deleted.",
  dismiss: "Back to my logs",
  action: "Choose a plan",
} as const;
