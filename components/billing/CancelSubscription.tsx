"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

import { Gift } from "@/components/icons";
import { Confetti } from "@/components/onboarding/confetti";
import { Mascot } from "@/components/onboarding/mascot";

import {
  cancelSubscription,
  claimExtraTime,
  resumeSubscription,
} from "@/app/(app)/billing/actions";
import type { SaveOffer } from "@/app/(app)/billing/actions";
import { STAYING_NOTICE_SLOT, StayingNotice } from "@/components/billing/StayingNotice";
import {
  cancelConfirmBody,
  cancelConfirmDismiss,
  cancelConfirmTitle,
  offerGiftWindow,
  offerGrantedBody,
  offerPeriodWord,
} from "@/lib/billing/cancelDialogCopy";
import { CANCEL_FAILED, CLAIM_FAILED, RESUME_FAILED } from "@/lib/billing/manage";
import { offerTermsLine, reminderQuietLine } from "@/lib/billing/reminderPromise";
import {
  forgetOffer,
  formatRemaining,
  isStillOpen,
  msRemaining,
  readOffer,
  rememberOffer,
  type OpenOffer,
} from "@/lib/billing/openOfferStore";

/**
 * The cancel control, its undo, and the one offer that follows a cancellation.
 *
 * ## Where it sits in the visual hierarchy, and why
 *
 * A quiet text row, not a button. Cancelling has to be genuinely reachable —
 * three screens promise "cancel any time before then", and a promise you have to
 * hunt for is not kept — but it is not the action this screen is FOR. Making it
 * a filled button would put the exit in the strongest slot on the page and turn
 * a billing summary into an offboarding prompt.
 *
 * It is also not in a danger zone and not red. `DANGER_ROW` is for sign-out and
 * account deletion, which destroy access or data. Cancelling destroys nothing:
 * the user keeps every day they have already paid for, keeps all their data, and
 * can undo it until the date. Dressing it as destruction would be theatre, and
 * the kind that makes people distrust the thing they are reading.
 *
 * ## The confirm states the date, always
 *
 * The one thing somebody needs at this moment is when access actually ends, so
 * the dialog says it rather than asking "are you sure?" about an unnamed
 * consequence. Portaled to `<body>` for the reason `SignOutConfirm` documents at
 * length: inside a transformed ancestor, `position: fixed` is contained by it
 * and the modal lands behind the fixed bottom nav.
 *
 * ## ⚠️ THE SAVE OFFER COMES AFTER THE CANCELLATION, NEVER BEFORE IT
 *
 * `confirm` -> the cancellation is written to Stripe -> `offer`. By the time the
 * second dialog exists the user is cancelled, and every way out of it — "No
 * thanks", Escape, the backdrop, closing the tab, losing signal — leaves them
 * cancelled. Nothing here can gate the exit, structurally, which is the property
 * the click-to-cancel rules are about.
 *
 * ONE extra step and exactly one (Adrian, 2026-08-13), and "Yes, cancel" on the
 * confirm keeps its full weight and its plain wording. A second cancellation
 * later goes straight through with no offer at all; see `lib/billing/saveOffer.ts`
 * for why that is decided by "was it shown" rather than "was it taken".
 */

/**
 * `declined` is the screen somebody lands on after turning the offer down.
 *
 * Adrian, 2026-08-14: it must not be a second ask. It confirms what has already
 * happened and names the date, so nobody is left wondering whether the cancel
 * went through, and then it ends. One offer, and only one.
 */
type Phase = "closed" | "confirm" | "offer" | "granted" | "declined";

/** Never notifies: whether a browser exists cannot change after hydration. */
const subscribeNever = () => () => {};

/**
 * ⚠️ HOW LONG A REQUEST MAY HANG BEFORE THE DIALOG GIVES THE USER A WAY OUT.
 *
 * Escape and the backdrop are both gated on `!pending`, for a measured reason: a
 * backdrop tap in the same tick as "Yes, cancel" used to close the dialog
 * mid-request and leave a failure with nowhere to render. But a cold review held
 * a server-action POST open and never answered it, and found the other end of
 * that guard: at 3 seconds and again at 23, both buttons disabled, Escape a
 * no-op, the backdrop inert, no message, nothing timing out. **A phone has no
 * Escape key, so the only way out was killing the app** — which is the exact
 * outcome §3.5 says this dialog exists to have solved.
 *
 * So the request itself has a deadline. Past it the promise rejects into the
 * catch that already exists, the message appears, the buttons come back, and the
 * guard keeps its original job for the two seconds that actually matter.
 *
 * The server may still finish afterwards, and that is the safe direction: the
 * cancellation lands at Stripe either way, which is the ordering §3.2 protects.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * ⚠️ THE DEADLINE MEANS "I STOPPED WAITING", NOT "IT FAILED". THE DIFFERENCE IS
 * THE WHOLE POINT.
 *
 * `Promise.race` cannot cancel the loser. The request is still open, the server
 * may still act, and `revalidatePath` may still land — so anything the dialog
 * says about an OUTCOME here is a guess. The first version guessed "failed", and
 * a cold review measured all three ways that goes wrong once the slow request
 * finally answers:
 *
 *   - a cancel that SUCCEEDED left "We couldn't cancel just now. Please try
 *     again." on screen while `mode` flipped underneath it, so the same open
 *     dialog became "Keep my Pro plan?" with focus on "Yes, keep it". Obeying
 *     the message un-cancelled them.
 *   - a resume that succeeded inverted the other way, into "Cancel your trial?".
 *   - a claim that succeeded left them told it had failed while the trial had
 *     moved and the cancellation had been lifted: a charge armed behind a
 *     message saying nothing happened.
 *
 * So a timeout is now its own outcome, distinct from a rejection, and the dialog
 * responds by getting out of the way rather than by claiming anything. A real
 * failure — an abort, a dropped connection — still rejects normally and still
 * shows the approved message, because that one IS known.
 */
class Deadline extends Error {
  constructor() {
    super("the request outlived its deadline");
    this.name = "Deadline";
  }
}

/** Reject with {@link Deadline} if the action has not answered in time. */
function withDeadline<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Deadline()), REQUEST_TIMEOUT_MS)),
  ]);
}

export function CancelSubscription({
  mode,
  endsOn,
  isTrial,
  userId,
  compForever = false,
  remindersPromised = false,
  endsImmediately = false,
  serverOffer = null,
}: {
  mode: "cancel" | "resume";
  /** Already formatted in the user's own timezone by the server. */
  endsOn: string;
  isTrial: boolean;
  /**
   * Whose screen this is, so a remembered offer cannot cross accounts on a
   * shared browser. See `openOfferStore.ts`; the trial banner's dismissal cookie
   * had exactly that bug.
   */
  userId: string;
  /**
   * ⚠️ A COMP WITH NO EXPIRY (D78). Changes what the confirm dialog SAYS, and
   * nothing else: not whether the control renders, not what cancelling does.
   *
   * Resolved on the server from the entitlement row (`source: "comp"` with a
   * null `active_until`). Defaulted false so any caller that has not been taught
   * about it gets the ordinary copy, which is correct for everybody else.
   */
  compForever?: boolean;
  /**
   * ⚠️ MAY THIS DIALOG PROMISE A REMINDER? (`REMINDER_PROMISE_ENABLED`, D1.)
   *
   * Read server-side by `reminderPromiseEnabled()` and passed down, because the
   * env var must not reach the client bundle — the same split `billingGateEnabled`
   * uses. Defaulted FALSE, which is the safe direction twice over: a caller that
   * forgets it withholds a promise rather than making one, and this component
   * cannot accidentally promise a reminder in a context nobody checked.
   */
  remindersPromised?: boolean;
  /**
   * ⚠️ PRESSING THIS ENDS THE SUBSCRIPTION NOW, NOT AT THE PERIOD END (D80).
   *
   * True for `paused` and `unpaid`, which Stripe refuses the period-end flag on
   * and which are cancelled outright instead. Resolved on the server from the
   * row's status, because the client must not decide which Stripe call happens.
   */
  endsImmediately?: boolean;
  /**
   * ⚠️ AN OFFER THAT WAS SHOWN, NOT CLAIMED, AND IS STILL LIVE — FROM THE SERVER
   * (Group E).
   *
   * `openOfferStore` remembers a DISMISSED offer in `sessionStorage`, which dies
   * with the tab. Somebody whose phone died at that dialog came back to a bare
   * Resume control with their free week already spent, never having seen it.
   *
   * This is the same offer, not a new one: `shownAt` is the ORIGINAL server
   * instant, so the countdown carries on from when it was first put on screen and
   * nobody buys a longer window by reloading. It grants nothing — `grantExtraTime`
   * re-checks the window, the claim marker and the cancellation against Stripe.
   *
   * Resolved in `screenFacts` and null for everybody else.
   */
  serverOffer?: {
    kind: "trial" | "paid";
    shownAt: string;
    noun: "week" | "month";
    chargeOn: string;
    startsOn: string;
  } | null;
}) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<SaveOffer | null>(null);
  const [grantedUntil, setGrantedUntil] = useState<string | null>(null);
  /**
   * "Glad you're staying." — shown after a resume, and only after one.
   *
   * ⚠️ COMPONENT STATE, AND THAT IS THE APPROVED BEHAVIOUR (§3.10). Not a
   * cookie, not `sessionStorage`, not derived from the subscription: it answers
   * "did that work?" for the person who just pressed the button, and leaving the
   * screen unmounts this component and ends the question.
   *
   * Set in the transition callback from the action's own result, never from an
   * effect watching `mode` — an effect would fire again on every revalidation
   * and would also raise the card for somebody who resumed in another tab.
   */
  const [staying, setStaying] = useState(false);
  /**
   * ⚠️ THE REQUEST OUTLIVED ITS DEADLINE, SO THE DIALOG STOPS WAITING FOR IT.
   *
   * `withDeadline` races a promise it cannot cancel, and `useTransition`'s
   * `pending` tracks the in-flight SERVER ACTION rather than the scope
   * function's return. So on a POST that is accepted and never answered, the
   * catch ran and the message appeared while `pending` stayed true for the whole
   * life of the request — a cold review watched it for 90 seconds:
   *
   *     "We couldn't cancel just now. Please try again."   <- red, on screen
   *     [Keep my trial OFF]  [Working… OFF]                <- both still disabled
   *     Escape: no-op.  Backdrop: no-op.
   *
   * An instruction to retry that nothing could satisfy, and on a phone no way
   * out but killing the app. Three rounds missed it because an ABORTED request
   * recovers perfectly; a hang is the case the deadline was added for and the
   * one it did not fix.
   *
   * So the dialog tracks its own idea of busy: past the deadline it is not, no
   * matter what the transition still thinks.
   */
  const [timedOut, setTimedOut] = useState(false);
  /**
   * An offer that was shown and then dismissed, still inside its ten minutes.
   *
   * Lazily seeded from `sessionStorage`, so it survives a reload and a
   * navigation away and back, not just a stray tap on the backdrop. It grants
   * nothing: the server re-checks the window against Stripe's own stamp.
   */
  const [carried, setCarried] = useState<OpenOffer | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = readOffer();
    /**
     * ⚠️ THE TAB'S OWN MEMORY WINS, AND THE SERVER'S IS THE FALLBACK (Group E).
     *
     * `sessionStorage` is the live session and is written the instant the offer
     * appears, so within one tab it is never behind. The server's copy is for the
     * tab that no longer exists. Both carry the SAME `shownAt`, read from the same
     * Stripe marker, so neither can restart the countdown — this ordering is about
     * freshness, not about which clock wins.
     *
     * Seeded here rather than in an effect, for the reason this file already gives
     * about `staying`: an effect would re-run on every revalidation and re-open a
     * way back into an offer the user had just declined.
     */
    if (stored) return stored;
    if (!serverOffer) return null;
    return { userId, ...serverOffer };
  });
  /**
   * ⚠️ NOTHING FROM STORAGE RENDERS UNTIL AFTER MOUNT.
   *
   * The server cannot read `sessionStorage`, so the first client render has to
   * agree with it and show nothing. This is the same idiom `BetaLaunchNotice`
   * uses, and the cost of getting it wrong is documented there: React discards
   * the hydration and rebuilds the app shell.
   */
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  /** Ticks once a second while a countdown is on screen, and never otherwise. */
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  /**
   * What every control gates on. `pending` alone strands the dialog when a
   * request hangs, because the transition never settles. See {@link timedOut}.
   */
  const busy = pending && !timedOut;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  /** Guards the same-TICK double fire that `pending` cannot: `useTransition`
   *  has not committed within the same tick, so `disabled` is still false and
   *  two clicks in one tick sent two requests (measured at a 0ms gap). */
  const inFlight = useRef(false);
  /** Which phase focus was last moved for, so a re-render cannot move it again. */
  const focusedPhase = useRef<Phase | null>(null);
  /** The confirm button, so a failure can put focus on the control that retries. */
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  /** Close, and put focus back where it came from. */
  const close = useCallback(() => {
    setPhase("closed");
    triggerRef.current?.focus();
  }, []);

  /**
   * FOCUS MANAGEMENT, because `aria-modal="true"` is otherwise a lie.
   *
   * A cold review measured what this dialog did without it: focus never entered
   * it, six Tab presses walked straight out onto the Stripe portal row, the
   * "Back to profile" link and all four nav tabs, and Escape left focus in the
   * tab bar. Meanwhile `aria-modal` told assistive tech the rest of the page was
   * inert. A screen-reader or switch-control user got no announcement that a
   * dialog about cancelling their subscription had opened, then operated
   * controls hidden behind a backdrop they could not see.
   *
   * So: focus moves in on open, Tab cycles within the dialog, and focus returns
   * to the trigger on close.
   *
   * Keyed on `phase`, not on a boolean. The dialog's contents are REPLACED when
   * the offer follows the confirm, and focus keyed on "is it open" would have
   * stayed on a button that no longer exists — leaving a keyboard user on the
   * body while a new dialog they were never told about sat on screen.
   */
  useEffect(() => {
    if (phase === "closed") {
      focusedPhase.current = null;
      return;
    }
    const node = dialogRef.current;
    /**
     * ⚠️ ONLY ON A GENUINE PHASE CHANGE, NEVER JUST BECAUSE `pending` FLIPPED.
     *
     * This effect depends on `pending` so the Tab handler below can read it, and
     * it used to move focus on every re-run. A cold review drove what that cost
     * keyboard-only with the request aborted: `pending` went back to false, the
     * effect re-ran, and focus jumped from "Yes, cancel" to the FIRST enabled
     * button, which is **"Keep my trial"** — the control that abandons the
     * cancellation. Press Enter to retry, as anybody would, and the dialog
     * closes having cancelled nothing, while Stripe still says
     * `cancel_at_period_end: false`. Same shape on the resume dialog.
     *
     * So focus moves when the dialog's CONTENTS change, and at no other time.
     */
    if (focusedPhase.current !== phase) {
      focusedPhase.current = phase;
      // An ENABLED button, falling back to the dialog. `querySelector("button")`
      // returned a disabled one during the pending window, and `.focus()` on a
      // disabled button is a no-op — so focus stayed wherever the click left it.
      (node?.querySelector<HTMLElement>("button:not([disabled])") ?? node)?.focus();
    } else if (!busy && node && !node.contains(document.activeElement)) {
      /**
       * ⚠️ FOCUS GOES TO THE CONTROL THAT RETRIES, NOT TO WHATEVER HAD IT.
       *
       * Disabling the button somebody is standing on drops focus to `<body>`,
       * outside the dialog, so it has to be put back. The first attempt put it
       * back on `document.activeElement` as captured before the request — and a
       * cold review found that is an engine-dependent guess: **WebKit does not
       * focus a `<button>` on tap.** Chromium does. So on the iPhone the capture
       * returned "Keep my trial" (where the dialog put focus on open), and the
       * restore landed the user on the button that ABANDONS the cancellation,
       * under a message reading "Please try again". One Enter and the
       * cancellation was silently thrown away.
       *
       * The confirm button is held by ref instead. It is the control the failure
       * is about and the one a retry means, and it is the same answer on every
       * engine.
       */
      const retry = confirmRef.current;
      if (retry && !retry.disabled) {
        retry.focus();
      } else {
        (node.querySelector<HTMLElement>("button:not([disabled])") ?? node).focus();
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        close();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>("button:not([disabled])"),
      );
      /**
       * ⚠️ NOTHING ENABLED IS NOT PERMISSION TO LEAVE.
       *
       * This used to `return`, and a cold review measured what that cost during
       * the ~2s "Working…" window: both buttons go `disabled`, the clicked one
       * drops focus to `<body>`, `button:not([disabled])` matches ZERO, and the
       * handler stood aside. Five Tab presses then walked out of a dialog still
       * claiming `aria-modal="true"` — onto the trigger behind the backdrop, the
       * Stripe portal row, "Back to profile" and the Dashboard tab.
       *
       * That is the exact defect this effect's own comment says was fixed. It
       * was fixed for the IDLE state only.
       *
       * Focus goes to the dialog itself instead, which is `tabIndex={-1}` and so
       * is a legitimate focus target. It comes back to a button the moment one
       * is enabled again.
       */
      if (focusable.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Wrap at both ends, and pull focus back in if it has escaped.
      if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, busy, close]);

  /**
   * The offer that is still live, or null. Only ever drawn after mount, so the
   * server render and the first client render agree on "nothing".
   */
  const live = mounted && isStillOpen(carried, userId, now) ? carried : null;
  const remaining = live ? msRemaining(live.shownAt, now) : 0;

  /**
   * A one-second tick, and ONLY while something is counting down.
   *
   * Started by the presence of a live offer rather than by the dialog being
   * open, because the reopen row counts down too. It stops the moment the offer
   * runs out, so an idle billing screen is not re-rendering once a second
   * forever.
   */
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  /**
   * When the clock runs out with the dialog still open, it becomes the
   * acknowledgement rather than leaving a button the server would refuse.
   *
   * DERIVED, not a setState in an effect. The lint rule that forbids that is
   * right and this file already leans on it elsewhere: an effect that setStates
   * on a value which changes once a second is a cascading render once a second.
   *
   * The stale `sessionStorage` entry is left alone deliberately. `isStillOpen`
   * rejects anything out of time on the way out, so cleaning it up would be a
   * write whose only effect is to save a comparison.
   */
  const offerExpired =
    phase === "offer" && carried !== null && msRemaining(carried.shownAt, now) <= 0;
  const shownPhase: Phase = offerExpired ? "declined" : phase;

  const noun = isTrial ? "trial" : "subscription";

  /**
   * THE UNDO CONTROL. "Keep my Pro plan" (D22, resolved 15 Aug 2026).
   *
   * It read "Restart my trial" (meaningless: nothing had stopped), then
   * "Keep Trackd after 19 Aug" — Adrian's objection to that one on 2026-08-14
   * was that the date is already directly above it in the summary and directly
   * below it in the explanation, so the screen said 19 Aug three times to
   * somebody re-reading it to be sure — and then the mirrored noun pair
   * "Keep my trial" / "Keep my subscription".
   *
   * D22 replaces the pair with §6 of the brief's single line. It is
   * PLAN-AGNOSTIC, so it needs no branch on status and cannot drift out of step
   * with one, and it matches the naming rule that a plan is "your Pro plan" —
   * the same words the cancel confirmation's own body already uses.
   *
   * ⚠️ THIS IS NOT THE CANCEL DIALOG'S DISMISS BUTTON. That control still reads
   * "Keep my trial" / "Keep my subscription" and is approved copy for itself
   * (§3.9). Two controls, two labels, deliberately: one undoes a cancellation
   * that has happened, the other declines to make one.
   *
   * Derived ONCE, here, and consumed in two places — the trigger below and the
   * resume dialog's title, which is this string with a question mark (D21). That
   * is the answer to Q82: applying D22 is one edit, not two.
   */
  const resumeLabel = "Keep my Pro plan";

  /** The confirm's action: cancel, or resume. */
  /**
   * ⚠️ THE AWAITS ARE WRAPPED, AND `inFlight` IS RESET IN A `finally`.
   *
   * It was reset on the line AFTER each await, with no `try`. A cold review
   * aborted one server-action POST and measured what that cost: the rejection
   * never reached `setError`, never reset `inFlight`, and escaped the
   * transition to the error boundary — so the whole Billing screen was replaced
   * by an error, the confirm button was permanently inert, three further taps
   * did nothing, and only a full page reload recovered. Nothing was cancelled
   * and nothing said why.
   *
   * `finally` is the point: a rejected action must leave the dialog usable.
   * The message is the one this component already falls back to, so no new
   * user-facing string enters the app for a failure case.
   */
  function runConfirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setTimedOut(false);
    startTransition(async () => {
      try {
      // The two branches are written out rather than sharing a call site, so
      // each keeps its own result type. `cancelSubscription` is the only one
      // that can carry an offer.
      if (mode === "cancel") {
        const result = await withDeadline(cancelSubscription());
        if (!result.ok) {
          setError(result.error ?? "Something went wrong.");
          return;
        }
        /**
         * The cancellation has landed at Stripe by the time this runs.
         * Everything below is about what to show NEXT, and nothing below can
         * undo it.
         */
        if (result.offer) {
          /**
           * Remembered BEFORE the dialog opens, so an offer dismissed in the
           * first second is still recoverable. `shownAt` is the server's, so the
           * clock on screen is the same clock the claim is checked against.
           */
          const open: OpenOffer = {
            userId,
            shownAt: result.offer.shownAt,
            kind: result.offer.kind,
            noun: result.offer.noun,
            chargeOn: result.offer.chargeOn,
            startsOn: result.offer.startsOn,
          };
          rememberOffer(open);
          setCarried(open);
          setNow(Date.now());
          setOffer(result.offer);
          setPhase("offer");
          return;
        }
        /**
         * No offer, so straight to the acknowledgement rather than closing.
         *
         * This is the second cancellation, or a customer whose offer was already
         * spent. They pressed "Yes, cancel" and previously the dialog simply
         * vanished, which is the same silence the decline screen exists to
         * remove. The cancellation is already written either way.
         */
        setPhase("declined");
        return;
      }

      const result = await withDeadline(resumeSubscription());
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      /**
       * The offer is spent, and they are not going. Clearing it does NOT
       * un-burn it — §0 is explicit that the burn is final and a resume never
       * restores it — it stops drawing a way back into an offer the server
       * would refuse anyway (`grantExtraTime` answers `not-cancelled`). A cold
       * review saw the alternative: "Glad you're staying." at the top of the
       * screen and a live amber countdown 250px below it, still offering a free
       * week to somebody who had just decided to stay.
       */
      forgetOffer();
      setCarried(null);
      /**
       * DERIVED FROM THE RESULT, IN THE CALLBACK. §3.10.
       *
       * `revalidatePath("/billing")` has already run on the server by the time
       * this line does, so the screen is about to re-render from the server with
       * `mode` flipped back to "cancel". This component reconciles rather than
       * remounting across that, which is what keeps the card alive — verified by
       * driving it, not assumed (§3.10's warning).
       */
      setStaying(true);
      close();
      } catch (err) {
        // A dropped connection, an aborted request, a server that never
        // answered. Caught here so it cannot escape the transition and take the
        // whole screen with it.
        console.warn("[billing] the cancel/resume request did not complete:", err);
        setTimedOut(true);
        if (err instanceof Deadline) {
          // Still open, outcome unknown. Say nothing about it and close, so the
          // screen behind can show whatever actually happened when it lands.
          close();
          return;
        }
        // A real failure, and a known one. The same approved string the server
        // returns for it, shared from the pure module so the two cannot drift.
        setError(mode === "cancel" ? CANCEL_FAILED : RESUME_FAILED);
      } finally {
        inFlight.current = false;
      }
    });
  }

  /** The offer's action. Failing here leaves them cancelled, which is correct. */
  function runClaim() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setTimedOut(false);
    startTransition(async () => {
      try {
        const result = await withDeadline(claimExtraTime());
        if (!result.ok) {
          setError(result.error ?? "Something went wrong.");
          return;
        }
        // Taken, so there is nothing left to come back to.
        forgetOffer();
        setCarried(null);
        setGrantedUntil(result.endsOn ?? null);
        setPhase("granted");
      } catch (err) {
        // Same reasoning as `runConfirm`: a rejected action must leave the
        // dialog usable rather than replacing the screen with an error.
        console.warn("[billing] the claim request did not complete:", err);
        setTimedOut(true);
        if (err instanceof Deadline) {
          close();
          return;
        }
        // The approved string the server already returns for this failure. It
        // states the fact and the next action; "Something went wrong." did not,
        // on the one dialog where a charge is about to be committed.
        setError(CLAIM_FAILED);
      } finally {
        inFlight.current = false;
      }
    });
  }

  /**
   * The charge date, ALREADY FORMATTED BY THE SERVER in `profiles.timezone`.
   *
   * This used to format an ISO instant here with `Intl` and no `timeZone`, on
   * the argument that the browser's calendar is the one the person is looking
   * at. A cold review measured what that argument cost: with the profile in
   * Pacific/Kiritimati and the phone in America/Los_Angeles, the cancel dialog
   * said 24 Aug, this said 30 Aug, and the thank-you one tap later said 31 Aug.
   * Three days for one charge, across three consecutive screens, on the highest
   * risk dialog in the app. Every other date in this flow is server-formatted;
   * this one is now too.
   */
  const chargeOnLabel = offer?.chargeOn || null;

  const copy = dialogCopy({
    phase: shownPhase,
    mode,
    noun,
    isTrial,
    endsOn,
    resumeLabel,
    offer,
    grantedUntil,
    chargeOnLabel,
    compForever,
    remindersPromised,
    endsImmediately,
  });

  /**
   * The slot at the top of Billing, looked up EVERY RENDER rather than held in a
   * ref. The page re-renders from the server after a resume, and a cached node
   * from before that would be a detached element the card drew into invisibly.
   * Null until mounted, because the server has no document to ask.
   */
  const noticeSlot =
    staying && mounted && typeof document !== "undefined"
      ? document.getElementById(STAYING_NOTICE_SLOT)
      : null;

  return (
    <>
      {/* "Glad you're staying." Portaled UP to the top of the screen, because
          §3.10 puts it above the plan card while the state belongs here, to the
          action that produced it. */}
      {noticeSlot
        ? createPortal(
            <StayingNotice isTrial={isTrial} onDismiss={() => setStaying(false)} />,
            noticeSlot,
          )
        : null}

      {/* THE WAY BACK IN, while the offer is still live.
          Adrian, 2026-08-14: dismissing the dialog by accident must not throw
          the offer away. The clock carries on from when it was first shown
          rather than restarting, so a fumbled tap cannot buy a longer window.
          Rendered only after mount; see `mounted`. */}
      {live && phase === "closed" ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOffer({
              kind: live.kind,
              noun: live.noun,
              chargeOn: live.chargeOn,
              startsOn: live.startsOn,
              shownAt: live.shownAt,
              days: 7,
            });
            setPhase("offer");
          }}
          /* ui-context: amber is "this is live", ONE beat per surface. The
             countdown IS the live thing, so it carries the amber and the row
             around it stays on the ordinary surface. A wash plus a border plus
             amber text on one element is the blanket amber the style guide
             names as the vibe-coded tell. */
          className="mb-1 flex w-full items-center gap-3 rounded-xl bg-bg-surface-raised px-3 py-2.5 text-left outline-none transition-colors hover:bg-bg-surface focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex-1 text-sm text-foreground">
            Your extra {live.noun} is still here
          </span>
          <span className="font-mono text-sm tabular-nums text-accent-amber">
            {formatRemaining(remaining)}
          </span>
        </button>
      ) : null}

      <button
        type="button"
        ref={triggerRef}
        onClick={() => {
          setError(null);
          setOffer(null);
          setGrantedUntil(null);
          // The acknowledgement belongs to the state it acknowledged. Engaging
          // the control again makes it stale, and "Glad you're staying." sitting
          // above a cancel confirmation would be the screen contradicting itself.
          setStaying(false);
          setPhase("confirm");
        }}
        /* No horizontal padding: the block around this already carries `px-4`,
           and the extra 4px put the "C" of "Cancel my trial" right of the "A"
           of "Access" in the card above. Rows on this screen rail. */
        className="w-full rounded-xl py-3 text-left text-sm text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {mode === "cancel" ? `Cancel my ${noun}` : resumeLabel}
      </button>

      {shownPhase !== "closed" &&
        copy &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-auto fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
            onClick={() => {
              // `inFlight` as well as `pending`: a backdrop tap in the SAME TICK
              // as "Yes, cancel" closed the dialog mid-request, and a failure
              // then had nowhere to render its message.
              if (!busy && !inFlight.current) close();
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-title"
              /* The body is the sentence §3.3 calls the point of the copy: what
                 they keep, until when, and what changes after. Without this a
                 screen-reader user landing on "Keep my trial" gets the title
                 and the buttons and never the consequence. */
              aria-describedby="cancel-body"
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-xs overflow-hidden rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            >
              {shownPhase === "granted" ? <Confetti /> : null}
              {/**
                * KYLE AND THE ONE-SHOT BURST, on the accept screen only (§3.12).
                *
                * ⚠️ THERE IS A STANDING WARNING AGAINST EXACTLY THIS, and the
                * spec answers it rather than ignoring it: the beta notice
                * restricts confetti to its gift variant because confetti over a
                * screen telling somebody they are about to be charged is the
                * worst thing that screen could do. This screen IS followed by a
                * charge.
                *
                * It ships because the terms line named the charge and the date
                * BEFORE the user could accept, and the quiet line under the
                * celebration repeats that a reminder is coming. The burst
                * celebrates the free time they just accepted, not the charge
                * that follows, and they were told about the charge first.
                *
                * One shot, `pointer-events-none`, and `motion-reduce:hidden` —
                * the component collapses to nothing rather than stranding
                * eighteen motionless dots along the top edge.
                */}
              {shownPhase === "granted" ? (
                <div className="mb-3 flex justify-center">
                  <Mascot pose="thumbs" size={132} />
                </div>
              ) : null}
              <h2 id="cancel-title" className="text-base font-medium text-foreground">
                {copy.title}
              </h2>
              <p id="cancel-body" className="mt-1.5 text-sm leading-relaxed text-text-muted">
                {copy.body}
              </p>

              {copy.quiet ? (
                <p className="mt-2 text-xs leading-relaxed text-text-subtle">{copy.quiet}</p>
              ) : null}

              {/* THE CLOCK, and it is real.
                  It counts from the server's `shownAt` and the server refuses a
                  claim past the same ten minutes, so this is not urgency
                  theatre: the offer genuinely stops being claimable when this
                  reaches zero. A countdown to nothing on a cancel screen is the
                  one thing regulators actually look for. */}
              {shownPhase === "offer" && live ? (
                <div className="mt-4">
                  <p
                    className="text-center font-mono text-2xl font-semibold tabular-nums text-accent-amber"
                    role="timer"
                    aria-live="off"
                  >
                    {formatRemaining(remaining)}
                  </p>
                  <p className="mt-1 text-center text-[11px] text-text-subtle">
                    yours for the next 10 minutes
                  </p>
                </div>
              ) : null}

              {/**
                * THE GIFT CARD (§3.12). What they get, when it runs to, and what
                * it costs.
                *
                * ⚠️ A GIFT-BOX MARK, NEVER A TICK. A ticked circle looks like
                * something you can untick, and this is the one screen where a
                * mis-tap has a price.
                *
                * The mark is MUTED, not amber: `ui-context.md` says an icon that
                * aids scanning renders muted and never in a tinted container,
                * and the countdown above is already this dialog's single amber
                * beat. Nothing here is a button, a tab or a call to action.
                *
                * "$0.00 USD" is D25 — the house rule that the currency is named
                * wins over the shorter form, because this sits inches from a
                * terms line naming a real charge in USD and two amounts
                * formatted differently on one screen is what a reader notices.
                */}
              {shownPhase === "offer" && copy.gift ? (
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-bg-surface-raised px-4 py-3">
                  <Gift className="h-5 w-5 shrink-0 text-text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{copy.gift.what}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{copy.gift.until}</p>
                  </div>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                    {copy.gift.amount}
                  </span>
                </div>
              ) : null}

              {/* ⚠️ THE TERMS SIT HERE, between the offer and the buttons, and
                  nowhere else. This is the sentence that names the charge and
                  the date on a screen somebody reached by pressing cancel. It
                  must not move below the buttons, and it must not be folded into
                  the paragraph above. See `dialogCopy`. */}
              {copy.terms ? (
                <p className="mt-3 text-sm leading-relaxed text-text-muted">{copy.terms}</p>
              ) : null}

              {/**
                * ⚠️ THE FAILURE IS ANNOUNCED, AND IT IS THE RIGHT RED.
                *
                * The region is ALWAYS mounted so the message lands inside a live
                * region that already exists — one inserted together with its own
                * text is the classic case a screen reader skips, which is how a
                * keyboard user came to retry a cancellation that had failed
                * silently and dismiss the dialog instead.
                *
                * `--state-error`, not `--accent-destructive`: `ui-context.md`
                * scopes the latter to deliberate destructive actions and
                * specifies the former for errors, and every other error message
                * in the app uses it. Measured, the old token was **2.64:1** at
                * 14px on this surface — the dimmest line in a dialog about
                * money. This one is 4.61:1.
                */}
              <p
                role="alert"
                className={error ? "mt-3 text-sm text-state-error" : "sr-only"}
              >
                {error}
              </p>

              <div className="mt-5 flex gap-3">
                {copy.dismiss ? (
                  <button
                    type="button"
                    disabled={busy}
                    /* Declining the OFFER is not the same as closing a dialog.
                       It goes to the acknowledgement, so nobody leaves unsure
                       whether the cancellation they asked for actually took.
                       Nothing is written either way: it was written before this
                       dialog existed. */
                    onClick={shownPhase === "offer" ? () => setPhase("declined") : close}
                    className="flex-1 rounded-2xl border border-border-default py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {/* On the confirm, the stay-put option keeps its full
                        weight. Not a trick: it is also the shorter path, and it
                        is what most people who open this dialog by accident
                        want. On the OFFER it is the plain decline, worded so
                        nobody has to work out which button ends the
                        conversation. */}
                    {copy.dismiss}
                  </button>
                ) : null}
                <button
                  type="button"
                  ref={confirmRef}
                  disabled={busy}
                  onClick={
                    shownPhase === "granted" || shownPhase === "declined"
                      ? close
                      : shownPhase === "offer"
                        ? runClaim
                        : runConfirm
                  }
                  className="flex-1 rounded-2xl border border-border-default bg-bg-surface-raised py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {busy ? "Working…" : copy.confirm}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/* ── the words ───────────────────────────────────────────────────── */

interface DialogCopy {
  title: string;
  body: string;
  /**
   * ⚠️ THE TERMS, on the offer only, rendered directly ABOVE the buttons.
   *
   * Its own field rather than a third sentence in `body` precisely so it cannot
   * be moved, softened, or lost in a paragraph. It is the line that names the
   * charge and the date, and the offer must never render without it.
   */
  terms?: string;
  /** A quieter footnote under the body. The reminder promise, on the thank-you. */
  quiet?: string;
  /**
   * The gift card's three facts (§3.12): what they get, when it runs to, and
   * what it costs. Values and decided strings only — the amount is D25's
   * "$0.00 USD" and the period words are the ones the body and the button
   * already use.
   */
  gift?: { what: string; until: string; amount: string };
  /** The left-hand button. Absent on the acknowledgement, which has one way out. */
  dismiss: string | null;
  confirm: string;
}

/**
 * Every dialog's words in one place, so the three states cannot drift apart.
 *
 * NO EM DASHES: house rule, and these are as user-facing as a string gets.
 */
function dialogCopy({
  phase,
  mode,
  noun,
  isTrial,
  endsOn,
  resumeLabel,
  offer,
  grantedUntil,
  chargeOnLabel,
  compForever,
  remindersPromised,
  endsImmediately,
}: {
  phase: Phase;
  mode: "cancel" | "resume";
  noun: string;
  /**
   * ⚠️ F1's DISCRIMINATOR, PASSED RATHER THAN DERIVED FROM `noun`.
   *
   * `noun` is "trial" or "subscription" and drives the trigger row, the staying
   * notice and the cancelled acknowledgement, none of which F1 touches. Comparing
   * it against the "trial" literal here would tie four strings to one comparison
   * and put the next widening one edit away.
   */
  isTrial: boolean;
  endsOn: string;
  resumeLabel: string;
  offer: SaveOffer | null;
  grantedUntil: string | null;
  /** `offer.chargeOn`, already formatted in the user's own zone by the caller. */
  chargeOnLabel: string | null;
  /** Free-for-life comp. Replaces the confirm body only. See D78 below. */
  compForever: boolean;
  /** `REMINDER_PROMISE_ENABLED`. Gates both halves of the reminder promise. */
  remindersPromised: boolean;
  /** D80: this cancellation is immediate, not at period end. */
  endsImmediately: boolean;
}): DialogCopy | null {
  if (phase === "confirm") {
    return mode === "cancel"
      ? {
          /**
           * ⚠️ F1: THE TITLE MOVES WITH THE DISMISS LABEL, so one dialog does not
           * use two words for one thing. It was `Cancel your ${noun}?`, which
           * would now leave a paying customer reading "Cancel your subscription?"
           * above a button saying "Keep my plan". Signed and pinned in
           * `lib/billing/cancelDialogCopy.ts`.
           */
          title: cancelConfirmTitle(isTrial),
          /**
           * TWO SENTENCES, AND THE SECOND ONE IS THE POINT.
           *
           * The old copy said only what would NOT happen ("you won't be
           * charged"), which is the half that makes cancelling look free of
           * consequence. Adrian's note on 2026-08-14 was that it should say what
           * they are giving up. So: what they keep and until when, then what
           * actually changes on that date, in the app's own words for it.
           *
           * ⚠️ D78: A FREE-FOR-LIFE COMP GETS A DIFFERENT BODY, AND IT IS A
           * REPLACEMENT RATHER THAN A WITHHOLD.
           *
           * This is the one place the house rule "a fix withholds a line, it
           * never rewords one" does not apply, because THREE of the four
           * sentences are false for them rather than one. They keep access
           * forever, so "until {date}", "goes read only" and "you just can't add
           * to it" are all wrong, and withholding those would leave "you won't be
           * charged" standing alone as an answer to a question nobody asked.
           *
           * Signed copy, character for character, from 2026-08-16. The title and
           * both buttons are deliberately untouched: what they are pressing is
           * still a cancellation, and it still stops a real charge.
           */
          /**
           * ⚠️ D80's SENTENCE GOES FIRST, AND NOTHING IS WITHHELD BEHIND IT.
           *
           * For `paused` and `unpaid` this button ends the subscription STRAIGHT
           * AWAY, not at the period end. Every clause of the body below is still
           * true for them — cancelling writes no entitlement, so access really
           * does run to the date named — and the dialog still failed at its job,
           * because it never said the action was FINAL.
           *
           * Somebody reads "full access until {date}" and reasonably concludes
           * they can change their mind until then. They cannot: there is no
           * resume for this path, deliberately, because a subscription cancelled
           * outright is gone at Stripe and clearing a flag cannot bring it back.
           * That is the difference between an undoable action and a final one,
           * and it belongs BEFORE the reassurance rather than after it.
           *
           * Signed copy. It leads whichever body applies, including D78's, because
           * it describes the MECHANISM rather than the cohort.
           */
          body: [
            endsImmediately ? "This ends your subscription straight away." : null,
            compForever
              ? `You'll stop being charged. Your free access carries on as it always has, and nothing about your account changes.`
              : cancelConfirmBody(endsOn),
          ]
            .filter(Boolean)
            .join(" "),
          /**
           * ⚠️ F1 — THE FOUNDER'S RULING, AND IT CLOSES THE §3.9-versus-D36
           * CONFLICT THAT WAS ROUTED AND LEFT OPEN.
           *
           * This read `"Keep my trial"` unconditionally, and the reasoning above
           * it is preserved here because it was CORRECT about the conflict and
           * only the ruling changes the answer:
           *
           * > `03` §3.3 lists exactly two buttons for this dialog and gives this
           * > one in the singular, and §3.9 says so explicitly: **"It stays 'Keep
           * > my trial', which is approved copy for that control. Two controls,
           * > two labels, deliberately."**
           *
           * D36's rule is that "trial" never renders for anybody not on one, so
           * for the paying cohort the two specs contradicted each other. The
           * ruling: the label follows the cohort, "Keep my trial" on a trial and
           * "Keep my plan" otherwise.
           *
           * ⚠️ THE HALF OF §3.9 THAT SURVIVES IS THE IMPORTANT HALF. This is
           * still NOT `resumeLabel` — that control is D22's plan-agnostic "Keep my
           * Pro plan" and undoes a cancellation that has happened, while this one
           * declines to make one. Two controls, two labels, deliberately.
           */
          dismiss: cancelConfirmDismiss(isTrial),
          confirm: "Yes, cancel",
        }
      : {
          title: `${resumeLabel}?`,
          body: `Your ${noun} carries on as normal and finishes on ${endsOn}. You'll be charged then unless you cancel again.`,
          dismiss: "Not now",
          confirm: "Yes, keep it",
        };
  }

  if (phase === "offer" && offer) {
    /**
     * ⚠️ ONE OFFER, ONE SHAPE, AND ONE SENTENCE THAT IS NOT NEGOTIABLE.
     *
     * Since 2026-08-14 taking this LIFTS the cancellation on both kinds: they
     * get the free time and are then billed unless they cancel a second time.
     * That makes this the highest-risk screen in the app, because the person
     * pressed cancel, read the word "free", and is about to be charged.
     *
     * So the terms sentence NAMES THE CHARGE AND THE DATE, and it sits above the
     * buttons rather than under them. `chargeOnLabel` comes from the server,
     * computed by the same functions the grant uses, so the date they read is
     * the date they are charged.
     *
     * "and we'll remind you first" is a PROMISE. `lib/notifications/trialReminder.ts`
     * keeps it. If that reminder is ever removed, this clause goes with it.
     */
    const period = offerPeriodWord(offer.noun);
    /**
     * ⚠️ ONE TERMS LINE, AND IT NAMES THE DATE. THE DATELESS VARIANT IS GONE.
     *
     * There used to be a second version for when no charge date was available,
     * saying the charge came "when the extra period is up" and naming no day.
     * §3.2 deletes it: the brief requires this line to name the charge AND the
     * date, so a version that cannot is not a weaker acceptable variant.
     *
     * It is unreachable rather than merely unused — `offerAfterCancel` refuses
     * to return an offer at all when the date cannot be resolved, before the
     * shown-marker is written — but it is deleted anyway, because a string that
     * cannot legally render is a string somebody will make render.
     *
     * ⚠️ AND WITHOUT A DATE THE WHOLE DIALOG REFUSES, rather than rendering a
     * line with a hole in it. §3.2: "If the charge date cannot be resolved, the
     * offer is not shown at all." The user is already cancelled, so showing them
     * nothing is the strictly better outcome and costs them nothing.
     */
    if (!chargeOnLabel) return null;

    /**
     * ⚠️ THE FINAL CLAUSE IS GATED BY `REMINDER_PROMISE_ENABLED` (amended D1).
     *
     * "and we'll remind you first" is a PROMISE, kept by `07-notifications.md`.
     * The pair's release condition is that reminder being OBSERVED firing before
     * a courtesy charge on a test clock, and that observation lands the Monday
     * before launch. Unset withholds the clause, so forgetting to flip it costs
     * a promise rather than breaks one.
     *
     * Built in `lib/billing/reminderPromise.ts` alongside the thank-you screen's
     * footnote, from this one boolean, so the two cannot ship apart.
     */
    const terms = offerTermsLine(chargeOnLabel, remindersPromised);

    return {
      title: "One more thing.",
      body: `Thank you for choosing Trackd Co to run your protocol. Before you go, we'd like to offer you another ${period}, free.`,
      gift: {
        what: `Another ${period}`,
        /**
         * ⚠️ F2: THE WINDOW, NOT JUST ITS END.
         *
         * This read `until ${chargeOnLabel}` and free time is appended to the END
         * of the paid period, so for a mid-year yearly subscriber it said
         * "Another month / until 15 Mar 2027" on 15 Aug 2026 — describing SEVEN
         * MONTHS of free access. `startsOn` is the current period end, the same
         * instant `addOffer` measures from. Signed and pinned.
         */
        until: offerGiftWindow(offer.startsOn, chargeOnLabel),
        amount: "$0.00 USD",
      },
      terms,
      dismiss: "I'd rather cancel",
      confirm: `Another ${period}, thanks`,
    };
  }

  if (phase === "granted") {
    /**
     * ⚠️ D24: THE NOUN FOLLOWS THE GRANTED PERIOD, NOT THE PLAN.
     *
     * The built paid variant substituted the plan and produced "Your plan
     * finishes on 18 Oct" — telling a paying customer their plan is ENDING, on
     * the screen congratulating them for staying. The trial variant keeps the
     * approved line unchanged.
     *
     * ⚠️ And the dateless fallback here is deleted too (§3.11). It read " is
     * extended" with no day. The grant has already happened by the time this
     * renders, so refusing to render is not an option — instead `endsOn` is
     * required on a successful grant, and `claimExtraTime` fails the claim
     * rather than returning a success it cannot date.
     */
    const period = offerPeriodWord(offer?.noun ?? "week");
    return {
      title: "Thank you!",
      /**
       * ⚠️ F2: ONE SENTENCE, NAMING THE WINDOW, FOR BOTH KINDS.
       *
       * The two variants this replaces were "Enjoy your free {period} on us. Your
       * free {period} finishes on {date}..." and "...Your extended trial finishes
       * on {date}...". Both named only the END, and "Enjoy" is the present tense
       * about a period that, for a mid-year yearly subscriber, starts in six
       * months.
       *
       * The founder signed ONE sentence and it names no cohort, so the branch
       * goes: a trialist who takes the offer has their cancellation lifted and is
       * billed after the free time exactly as a paid subscriber is, which is what
       * "your plan picks up from there" says — and what the tail of both old
       * variants already said.
       *
       * `grantedUntil` is the grant's OWN end date, returned by `claimExtraTime`
       * from the updated subscription, so the sentence is dated from what actually
       * happened rather than from what was offered.
       */
      /**
       * ⚠️ BOTH DATES ARE NON-NULL BY CONSTRUCTION, and the fallbacks are inert.
       * `offerAfterCancel` refuses to return an offer whose window it cannot
       * resolve, before the shown-marker is written, so this phase is unreachable
       * without `startsOn`; and `claimExtraTime` fails the claim rather than
       * returning a success it cannot date, so it is unreachable without
       * `grantedUntil`. The previous code interpolated the same values with no
       * fallback at all.
       */
      body: offerGrantedBody(period, offer?.startsOn ?? "", grantedUntil ?? ""),
      /**
       * ⚠️ THE OTHER HALF OF THE PROMISE, gated by the SAME switch as the terms
       * line (amended D1). Both together or neither: a thank-you screen silent
       * about reminders under a terms line that promised one reads as the app
       * dropping the commitment between two taps.
       */
      quiet: reminderQuietLine(remindersPromised),
      dismiss: null,
      confirm: "Back to Trackd Co",
    };
  }

  if (phase === "declined") {
    /**
     * NOT A SECOND ASK. It confirms and it stops.
     *
     * The cancellation was written before the offer was ever looked up, so
     * nothing here changes anything: this exists purely so nobody closes the app
     * unsure whether it worked.
     */
    /**
     * ⚠️ D78 APPLIES HERE TOO, AND IT DID NOT — THE FIX WAS UNDONE ONE TAP LATER.
     *
     * The confirm dialog gives a free-for-life comp the D78 replacement body, and
     * then this screen restored all three sentences D78 exists to delete: a date
     * they do not have, "goes read only", and the history line. `compForever` was
     * already a parameter of this function and already consumed by the confirm
     * branch; this branch simply ignored it. `03` §5's own checkbox — "no date, no
     * read-only sentence and no history sentence appears for them" — fails
     * verbatim on the second screen of the same flow.
     *
     * That is the shape this whole review keeps finding: a correct fix that one
     * branch elsewhere does not honour.
     *
     * ## The copy is D78's, reused rather than written
     *
     * `04` §0 assigns the declined screen's copy to that spec, but the cohort
     * branch and the `compForever` prop are both `03`'s and both live in this
     * file, so it is closed here. **No new string is invented**: D78's signed
     * sentence is already the true and approved thing to say to this cohort about
     * a cancellation, and it is exactly as true after declining the offer as it
     * was before. Reusing signed copy for the same cohort stating the same fact is
     * the move `02b` §3.2 and D82 both already make.
     *
     * The TITLE is untouched. Their subscription genuinely is cancelled.
     */
    return {
      title: `Your ${noun} is cancelled`,
      body: compForever
        ? `You'll stop being charged. Your free access carries on as it always has, and nothing about your account changes.`
        : cancelConfirmBody(endsOn),
      dismiss: null,
      confirm: "Close",
    };
  }

  return null;
}
