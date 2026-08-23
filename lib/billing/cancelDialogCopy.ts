import type { SaveOfferKind } from "./manage";

/**
 * ⚠️ THE CANCEL DIALOG'S SIGNED STRINGS (F1 and F2).
 *
 * ## Why they are here and not in the component
 *
 * `signed/README.md`'s standing rule: a signed string rendered to a user gets a
 * machine check, and **if it cannot be reached from `lib/`, moving it there is
 * the first half of the fix**. `vitest.config.ts` includes `lib/**\/*.test.ts`
 * and nothing else, so JSX text in `components/billing/CancelSubscription.tsx` is
 * unreachable — which is how the read-only pop-up's first clause was reverted to
 * a wording D98 had ruled FALSE with all 1573 tests green.
 *
 * Only the strings F1 and F2 changed live here. The rest of that dialog's copy is
 * untouched and stays where it is; moving it would be a second change wearing this
 * one's clothes.
 */

/* ── F1: the dismiss label and the title, which now move together ──── */

/**
 * ⚠️ F1 — FOUNDER RULING, AND IT RESOLVES A SPEC-VERSUS-SPEC CONFLICT THAT WAS
 * ROUTED AND LEFT OPEN.
 *
 * `03` §3.9 pinned **"Keep my trial"** unqualified, for every cohort, in as many
 * words: *"It stays 'Keep my trial', which is approved copy for that control. Two
 * controls, two labels, deliberately."* D36 forbids the word "trial" rendering for
 * anybody who is not on one. Both are binding and they contradict each other for
 * the paying cohort, so a previous round applied §3.9 (the spec is explicit, the
 * spec wins) and routed the conflict.
 *
 * The ruling is that the label follows the cohort:
 *
 *     on a trial   Keep my trial
 *     otherwise    Keep my plan
 *
 * ⚠️ AND THE TITLE MOVES WITH IT, so one dialog does not use two words for one
 * thing. It was `Cancel your ${noun}?` with `noun` of "trial" or "subscription",
 * which would have left a paying customer reading "Cancel your subscription?"
 * above a button saying "Keep my plan".
 *
 *     on a trial   Cancel your trial?
 *     otherwise    Cancel your plan?
 *
 * ⚠️ THIS IS NOT `resumeLabel`. That control is "Keep my Pro plan" (D22), it
 * undoes a cancellation that has already happened, and it is deliberately
 * plan-agnostic. This one declines to make one. Two controls, two labels — which
 * is the half of §3.9 that survives the ruling intact.
 *
 * ⚠️ AND IT IS NOT THE TRIGGER ROW EITHER. `Cancel my ${noun}` on the billing
 * screen keeps its own noun, unchanged: the ruling names the dialog's title and
 * its dismiss button, and widening it to every noun on the flow would be a
 * decision nobody took.
 */
export function cancelConfirmTitle(isTrial: boolean): string {
  return isTrial ? "Cancel your trial?" : "Cancel your plan?";
}

export function cancelConfirmDismiss(isTrial: boolean): string {
  return isTrial ? "Keep my trial" : "Keep my plan";
}

/**
 * What cancelling actually costs them, in one sentence. SIGNED (Adrian, 2026-08-23).
 *
 * ## It was written inline, TWICE, in two different wordings
 *
 * `CancelSubscription.tsx` carried it as a template literal at two call sites that
 * had drifted apart in three places:
 *
 *     :1092  "You'll HAVE full access … you'll still see YOUR WHOLE HISTORY …"
 *     :1302  "You'll KEEP full access … you'll still see EVERYTHING YOU'VE LOGGED …"
 *                                        …and you won't be charged AGAIN
 *
 * Neither was in `lib/billing/signed/`, so no pin could see either, and the two
 * could keep drifting for as long as nobody read them side by side. Moving it here
 * is the first half of the fix the signed corpus's own rule demands: *"if it cannot
 * be reached from `lib/` then MOVING IT IS THE FIRST HALF OF THE FIX — not a reason
 * to skip the pin."*
 *
 * ## ⚠️ ONE SENTENCE ON TWO SURFACES, DELIBERATELY
 *
 * It speaks BEFORE the cancellation (the confirm dialog, under "Cancel your plan?")
 * and AFTER it (the confirmation screen, under "Your subscription is cancelled").
 * The fact is identical at both moments — access until this date, read-only after,
 * nothing deleted — and the TITLE supplies the tense. One string means the two can
 * never disagree again, which is exactly how they got here.
 *
 * ## ⚠️ "AND YOU WON'T BE CHARGED" IS GONE, AND THAT CLOSES AN ACCEPTED GAP
 *
 * The clause was `…and you won't be charged` here and `…won't be charged again` on
 * the other surface. The `again` form is a REGISTERED ACCEPTED GAP: it is false for
 * the grace-aligned-then-cancelled cohort, who were never charged a first time, and
 * the record's proposed fix was "a real predicate feeding both call sites".
 *
 * Deleting the claim closes it instead. A sentence that does not assert anything
 * about charging cannot be wrong about charging, for any cohort, and it needs no
 * predicate to stay right. ⚠️ The gap's acceptance must therefore be REWRITTEN
 * rather than inherited (D100): its reason has changed, it has not merely moved.
 */
export function cancelConfirmBody(endsOn: string): string {
  return (
    `You'll have full access to your Pro plan until ${endsOn}. ` +
    `After that your account goes read only. ` +
    `You'll still see your whole history, you just can't add to it.`
  );
}

/* ── F2: the gift window, and the granted screen's body ────────────── */

/**
 * ⚠️ F2 — THE MONTH FORM HAD NEVER BEEN RENDERED ON A SCREEN, AND IT DESCRIBED
 * SEVEN MONTHS OF FREE ACCESS.
 *
 * ## How it stayed invisible
 *
 * The driver meant to exercise the yearly offer used a yearly price but created
 * the subscription with a `trial_end`, so `offerPeriodToGrant` short-circuited on
 * `status === "trialing"` and returned "week". Every character-for-character
 * assertion then ran on the week strings. That is the exact trap the rename commit
 * warned about — *"it must never be read as 'what WAS granted?'"* — sprung on the
 * screen drive instead of on the unit test it was written for.
 *
 * ## The defect
 *
 * Free time is appended to the END of the paid period, which is correct: computing
 * from `now` would SHORTEN the access of anybody who cancelled early. But the gift
 * block named only the END date. For a mid-year yearly subscriber, read on
 * 15 Aug 2026:
 *
 *     Another month
 *     until 15 Mar 2027          <- describes SEVEN MONTHS of free access
 *     $0.00 USD
 *
 * and the thank-you screen said "Enjoy your free month on us" in the present tense
 * about a period starting in six months.
 *
 * ## The signed replacement, true of both shapes
 *
 * `{start}` is the CURRENT PERIOD END — the same value `addOffer` already measures
 * from, so nothing new is computed and the two cannot drift. It is true of a free
 * week three days out and of a free month seven months out alike.
 *
 * Everything else on both screens is unchanged: the offer body, the terms line,
 * the buttons and the countdown. The terms line already names the charge date and
 * is true.
 */

/** ⚠️ SIGNED. The gift block's middle line, replacing "until {end}". */
export function offerGiftWindow(start: string, end: string): string {
  return `${start} to ${end}`;
}

/**
 * ⚠️ SIGNED. The granted screen's body.
 *
 * ## ⚠️ ONE SENTENCE FOR BOTH KINDS, WHERE THERE WERE TWO
 *
 * The old copy branched: a paid subscriber read "Your free {period} finishes on
 * {date}" and a trialist read "Your extended trial finishes on {date}". The
 * founder signed ONE sentence and it names no cohort, so the branch goes. It is
 * true of both — a trialist who takes the offer has their cancellation lifted and
 * is billed after the free time exactly as a paid subscriber is, which is what
 * "your plan picks up from there" says, and what the tail of BOTH old variants
 * already said.
 *
 * ⚠️ THE PERIOD WORD COMES FROM THE GRANTED PERIOD, NEVER A LITERAL. D24: the
 * built paid variant once substituted the plan and told a paying customer their
 * plan was ENDING on the screen congratulating them for staying.
 */
export function offerGrantedBody(
  period: "week" | "month",
  start: string,
  end: string,
): string {
  return (
    `Your free ${period} is on us. It runs from ${start} to ${end}, ` +
    `and your plan picks up from there unless you choose to cancel.`
  );
}

/**
 * The noun the offer's copy uses, from the offer itself.
 *
 * ⚠️ NOT `offerPeriodToGrant`. That answers "what should we GRANT?" and
 * short-circuits on `trialing`, which is the misreading that hid F2 for a whole
 * round. This describes a period that ALREADY EXISTS, so it reads the period.
 */
export function offerPeriodWord(noun: "week" | "month"): "week" | "month" {
  return noun === "month" ? "month" : "week";
}

/** Re-exported so the dialog's kind and this module's copy stay one import. */
export type { SaveOfferKind };
