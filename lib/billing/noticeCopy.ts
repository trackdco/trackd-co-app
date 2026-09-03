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

/**
 * ⚠️ THE SEVEN-DAY GRACE NOTICE'S COPY, IN `lib/` FROM THE START.
 *
 * Approved by Adrian, 2026-09-03, across four revisions of a preview he drove on
 * his own phone. Pinned by `graceEndingCopyPin.test.ts` against
 * `signed/grace-ending.txt`.
 *
 * ## Why it lives here rather than in the JSX
 *
 * `graceCopyPin.test.ts` pins the LAUNCH notice by reading its source file,
 * stripping comments and decoding entities, because that notice's copy is JSX
 * literals and extracting it would have been a product change. That mechanism
 * works, and it is fragile in one specific way: the signed fragments have to
 * match the component's LINE WRAPPING, so re-flowing a paragraph in an editor
 * breaks a legal pin.
 *
 * This file's own doc-block already states the rule that avoids it: *"a signed
 * string rendered to a user gets a pin, and if it cannot be reached from `lib/`,
 * moving it here is the first half of the fix"*. So the new notice starts where
 * the old one ended up, and its pin compares STRINGS rather than source text.
 *
 * ## ⚠️ THE COUNT IS NOT IN HERE, AND THAT IS THE POINT
 *
 * "7 days" is a NUMBER, computed by `graceDaysLeft` from the entitlement row at
 * render. It is deliberately absent from every constant below, because the
 * notice is shown ONCE and may be read on any day of the fortnight: somebody
 * opening it on Friday must see 6, not the 7 that was true when it was written.
 * {@link GRACE_NOTICE_PARTS.headLead} is the prose either side of it.
 *
 * Same split `06` §3.6 makes and for the same reason: a number derives, prose
 * does not.
 */
export const GRACE_NOTICE_PARTS = {
  /** The headline, either side of the count. "Your free run will end in 6 days." */
  headLead: "Your free run will end",
  headIn: "in",
  headToday: "today",
  headTomorrow: "tomorrow",

  /** Body, first paragraph. The date follows `runEnds`. */
  runEnds: "Your free run ends",
  thanks: "Thank you for helping make Trackd Co what it has become today.",

  /**
   * Body, second paragraph. `after` is followed by the short date, `afterToday`
   * replaces both on the final day so the sentence does not read "After 10 Sep"
   * to somebody for whom 10 Sep is today.
   */
  after: "After",
  afterToday: "After today",
  /**
   * ⚠️ "read only" AS TWO WORDS, matching the launch notice and
   * `READ_ONLY_MESSAGE` exactly. Three surfaces describe one state and they must
   * not describe it in three ways.
   */
  readOnly:
    "your account will become read only. You'll still see everything you've logged. " +
    "You just can't add to it. Nothing will get deleted.",

  /**
   * Body, third paragraph. Adrian's wording, 2026-09-03.
   *
   * ⚠️ It does NOT say "before 10 Sep". The date is already named twice above it,
   * and a third urgency cue in four lines is the app nagging rather than telling.
   */
  cta: "Pick a plan and your account carries on as is.",

  /** The two controls. "Choose a plan" is the filled one and it sits on the RIGHT. */
  dismiss: "Got it",
  choose: "Choose a plan",
} as const;

/**
 * ⚠️ THE CONTINUED-USE SENTENCE FOR THE SEVEN-DAY NOTICE, AND IT IS A SECOND
 * SENTENCE RATHER THAN AN EDIT OF {@link CONTINUED_USE_PARTS}.
 *
 * The launch notice's sentence is signed, pinned and already shown to real
 * accounts. Rewording it in place would silently re-word a legal notice five
 * people have been served, so this is additive and that one is untouched.
 *
 * ## ⚠️ ALL FOUR DOCUMENTS ARE NAMED. ONLY TWO ARE ACCEPTED. THAT IS DELIBERATE.
 *
 * Adrian asked for one sentence covering all four (2026-09-03). It cannot claim
 * acceptance of all four, and the reason is not stylistic:
 *
 *   Terms of Service      accepted by continued use, and RECORDED.
 *   Privacy Policy        accepted by continued use, and RECORDED.
 *   Medical Disclaimer    NOT accepted here. It is an explicit tick at the
 *                         welcome gate and every account already holds one, so
 *                         folding it into a continued-use sentence would
 *                         downgrade a stronger consent we already have.
 *   Consumer Health Data  NOT accepted here, EVER. Privacy v2.0 §17 says in
 *                         writing that continued use is never treated as consent
 *                         to health-data processing, which is Washington's My
 *                         Health My Data Act. Claiming it would contradict the
 *                         policy inside the notice announcing that policy.
 *
 * So the second sentence says the other two have CHANGED, not that they are
 * accepted. `recordDocumentAcceptance` still writes `tos` and `privacy` and
 * nothing else, and this wording is what makes that honest rather than a gap.
 *
 * Signed by Adrian as option 2 of three, 2026-09-03.
 */
export const GRACE_CONTINUED_USE_PARTS = {
  lead: "Continuing to use Trackd Co means you accept the updated",
  terms: "Terms of Service",
  join: "and",
  privacy: "Privacy Policy",
  /** Closes the first sentence and opens the second. No em dash, ever. */
  mid: ". Our",
  disclaimer: "Medical Disclaimer",
  join2: "and",
  chd: "Consumer Health Data Privacy Policy",
  /**
   * ⚠️ "have also been updated", NOT "have changed as well" (Adrian, 2026-09-03,
   * on a cold review's reading).
   *
   * The original claimed nothing false: it named two documents the acceptance
   * clause deliberately excludes. But "as well" echoes the acceptance in the
   * sentence before it, and at 10px "...have changed as well" can be read as
   * "...and you accept those as well" - which is precisely the reading Privacy
   * v2.0 SS17 forbids. The words carry the ambiguity even though the grammar
   * does not, and this is the one sentence where that matters.
   *
   * "updated" also now matches the first clause's own verb, so the two halves
   * describe the same event and only one of them attaches an acceptance to it.
   */
  end: "have also been updated.",
} as const;

/**
 * The whole thing, as a reader hears it once the four links are flattened.
 *
 * The component interleaves four `<Link>`s so it cannot render one string, and
 * it must not hold the words either. These parts rejoin BY CONSTRUCTION and the
 * pin asserts the rejoin, which is the same shape {@link continuedUseSentence}
 * uses for the launch notice's two links.
 */
export function graceContinuedUseSentence(): string {
  const p = GRACE_CONTINUED_USE_PARTS;
  return (
    `${p.lead} ${p.terms} ${p.join} ${p.privacy}${p.mid} ` +
    `${p.disclaimer} ${p.join2} ${p.chd} ${p.end}`
  );
}
