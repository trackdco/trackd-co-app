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

import {
  cancelSubscription,
  claimExtraTime,
  resumeSubscription,
} from "@/app/(app)/billing/actions";
import type { SaveOffer } from "@/app/(app)/billing/actions";
import { STAYING_NOTICE_SLOT, StayingNotice } from "@/components/billing/StayingNotice";
import { CANCEL_FAILED, CLAIM_FAILED, RESUME_FAILED } from "@/lib/billing/manage";
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

/** Reject if the action has not answered inside {@link REQUEST_TIMEOUT_MS}. */
function withDeadline<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("the request timed out")), REQUEST_TIMEOUT_MS),
    ),
  ]);
}

export function CancelSubscription({
  mode,
  endsOn,
  isTrial,
  userId,
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
   * An offer that was shown and then dismissed, still inside its ten minutes.
   *
   * Lazily seeded from `sessionStorage`, so it survives a reload and a
   * navigation away and back, not just a stray tap on the backdrop. It grants
   * nothing: the server re-checks the window against Stripe's own stamp.
   */
  const [carried, setCarried] = useState<OpenOffer | null>(() =>
    typeof window === "undefined" ? null : readOffer(),
  );
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
    } else if (!pending && node && !node.contains(document.activeElement)) {
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
      if (e.key === "Escape" && !pending) {
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
  }, [phase, pending, close]);

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
        // The same approved string the server returns for this failure, shared
        // from the pure module so the two cannot drift into two wordings. It
        // states the fact and the next action, which "Something went wrong."
        // did not.
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
    endsOn,
    resumeLabel,
    offer,
    grantedUntil,
    chargeOnLabel,
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
              if (!pending && !inFlight.current) close();
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
              className="w-full max-w-xs rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            >
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
                    disabled={pending}
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
                  disabled={pending}
                  onClick={
                    shownPhase === "granted" || shownPhase === "declined"
                      ? close
                      : shownPhase === "offer"
                        ? runClaim
                        : runConfirm
                  }
                  className="flex-1 rounded-2xl border border-border-default bg-bg-surface-raised py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {pending ? "Working…" : copy.confirm}
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
  endsOn,
  resumeLabel,
  offer,
  grantedUntil,
  chargeOnLabel,
}: {
  phase: Phase;
  mode: "cancel" | "resume";
  noun: string;
  endsOn: string;
  resumeLabel: string;
  offer: SaveOffer | null;
  grantedUntil: string | null;
  /** `offer.chargeOn`, already formatted in the user's own zone by the caller. */
  chargeOnLabel: string | null;
}): DialogCopy | null {
  if (phase === "confirm") {
    return mode === "cancel"
      ? {
          title: `Cancel your ${noun}?`,
          /**
           * TWO SENTENCES, AND THE SECOND ONE IS THE POINT.
           *
           * The old copy said only what would NOT happen ("you won't be
           * charged"), which is the half that makes cancelling look free of
           * consequence. Adrian's note on 2026-08-14 was that it should say what
           * they are giving up. So: what they keep and until when, then what
           * actually changes on that date, in the app's own words for it.
           */
          body: `You'll have full access to your Pro plan until ${endsOn}, and you won't be charged. After that your account goes read only. You'll still see your whole history, you just can't add to it.`,
          dismiss: `Keep my ${noun}`,
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
    const period = offer.noun === "month" ? "month" : "week";
    const terms = chargeOnLabel
      ? `Your plan carries on as it is. You'll be charged on ${chargeOnLabel} unless you cancel before then, and we'll remind you first.`
      : `Your plan carries on as it is. You'll be charged when the extra ${period} is up unless you cancel before then, and we'll remind you first.`;

    return {
      title: "One more thing.",
      body: `Thank you for choosing Trackd Co to run your protocol. Before you go, we'd like to offer you another ${period}, free.`,
      terms,
      dismiss: "I'd rather cancel",
      confirm: `Another ${period}, thanks`,
    };
  }

  if (phase === "granted") {
    const until = grantedUntil ? ` finishes on ${grantedUntil}` : " is extended";
    const period = offer?.noun === "month" ? "month" : "week";
    return {
      title: "Thank you!",
      body:
        offer?.kind === "paid"
          ? `Enjoy your free ${period} on us. Your plan${until}, and billing picks up from there unless you choose to cancel.`
          : `Enjoy your free ${period} on us. Your extended trial${until}, and your plan picks up from there unless you choose to cancel.`,
      quiet: "We'll remind you before that happens.",
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
    return {
      title: `Your ${noun} is cancelled`,
      body: `You'll keep full access to your Pro plan until ${endsOn}, and you won't be charged${noun === "subscription" ? " again" : ""}. After that your account goes read only. You'll still see everything you've logged, you just can't add to it.`,
      dismiss: null,
      confirm: "Close",
    };
  }

  return null;
}
