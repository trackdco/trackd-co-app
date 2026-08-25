/**
 * ⚠️ TWO SIGNED NOTICE SENTENCES, MOVED HERE SO A MACHINE CAN SEE THEM.
 *
 * Both were JSX text in `components/billing/`, which `vitest.config.ts` cannot
 * reach (`include: ["lib/**\/*.test.ts"]`). `signed/README.md`'s standing rule:
 * a signed string rendered to a user gets a pin, and if it cannot be reached
 * from `lib/`, **moving it here is the first half of the fix** — never a reason
 * to skip the pin.
 *
 * Both are signed AS-IS by Adrian, 2026-08-26. Not a character moved; what
 * changed is that a character moving would now be caught.
 */

/**
 * The staying notice's title — shown when somebody declines to cancel.
 *
 * ⚠️ THE APOSTROPHE IS U+0027, NOT U+2019, AND THAT IS THE WHOLE POINT OF PINNING
 * IT. In the component it is written `Glad you&apos;re staying.` — the HTML
 * entity `&apos;` is U+0027 APOSTROPHE, not the typographic U+2019 the phrase
 * would get if anybody retyped it in a word processor. A curly apostrophe has
 * already shipped on this project once.
 *
 * ⚠️ THIS SENTENCE HAS NEVER BEEN PHOTOGRAPHED RENDERING. The second clock run's
 * report lists "the 'Glad you're staying' notice" under *never photographed at
 * all*. So this pin proves the STRING is the signed one and that the component
 * renders from this constant; it does NOT prove anybody has seen it on a screen.
 * Those are different claims and only one of them is made here.
 *
 * The subtitle beneath it ("Your trial/subscription will carry on as usual.") is
 * deliberately NOT pinned: Adrian signed this line and did not sign that one, and
 * pinning an unsigned string would record an approval nobody gave.
 */
export const STAYING_NOTICE_TITLE = "Glad you're staying.";

/**
 * D32's continued-use sentence on the switch-on notice — counsel-advised and
 * founder-signed, carried character for character on BOTH variants, because a
 * comped account is still a user bound by the terms.
 *
 * ⚠️ THE COMMENT BESIDE IT CLAIMED IT WAS *PINNED*. IT WAS NOT.
 * `BetaLaunchNotice.tsx` read: *"The signed sentence above names the Terms and
 * the Privacy Policy and is PINNED"*. Measured 2026-08-26: the string appeared
 * nowhere in `lib/`, so no test in the repo could see it and reverting it would
 * have left every test green. The comment is now true because the pin exists,
 * not because the claim was softened.
 *
 * ⚠️ SPLIT, NOT REBUILT. The component interleaves two `<Link>`s, so it cannot
 * render one string — but it must not hold the words either. These parts rejoin
 * to {@link continuedUseSentence} BY CONSTRUCTION, and the pin asserts the
 * rejoin. Same shape as `cancelConfirmBodyParts`, and for the same reason: two
 * copies of one sentence are two answers waiting to disagree.
 *
 * ⚠️ NOTHING ON THAT NOTICE IS AN ACCEPT BUTTON. Acceptance is continued use
 * after notice — which is what this sentence says — so no control there may be
 * labelled or styled as one. And the acceptance it describes covers these TWO
 * documents only: `recordDocumentAcceptance` writes `tos` and `privacy` and
 * nothing else, because Privacy v2.0 §17 forbids treating continued use as
 * consent to health-data processing.
 */
export const CONTINUED_USE_PARTS = {
  lead: "By continuing to use Trackd, you agree to the updated",
  terms: "Terms of Service",
  join: "and",
  privacy: "Privacy Policy",
  end: ".",
} as const;

/** The whole sentence, as a reader hears it once the links are flattened. */
export function continuedUseSentence(): string {
  const p = CONTINUED_USE_PARTS;
  return `${p.lead} ${p.terms} ${p.join} ${p.privacy}${p.end}`;
}
