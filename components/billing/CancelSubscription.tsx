"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import {
  cancelSubscription,
  claimExtraTime,
  resumeSubscription,
} from "@/app/(app)/billing/actions";
import type { SaveOfferKind } from "@/lib/billing/manage";

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

type Phase = "closed" | "confirm" | "offer" | "granted";

export function CancelSubscription({
  mode,
  endsOn,
  endsOnShort,
  isTrial,
  renewalNoun,
}: {
  mode: "cancel" | "resume";
  /** Already formatted in the user's own timezone by the server. */
  endsOn: string;
  /** The same date without the year, for the control's own label. */
  endsOnShort: string;
  isTrial: boolean;
  /**
   * "year" / "month" / "week", from the Stripe price, for the paid offer's
   * wording. Null when prices could not be loaded, which the copy handles rather
   * than guessing — see `offerCopy`.
   */
  renewalNoun?: string | null;
}) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ kind: SaveOfferKind; days: number } | null>(null);
  const [grantedUntil, setGrantedUntil] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  /** Guards the same-TICK double fire that `pending` cannot: `useTransition`
   *  has not committed within the same tick, so `disabled` is still false and
   *  two clicks in one tick sent two requests (measured at a 0ms gap). */
  const inFlight = useRef(false);

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
    if (phase === "closed") return;
    const node = dialogRef.current;
    // An ENABLED button, falling back to the dialog. `querySelector("button")`
    // returned a disabled one during the pending window, and `.focus()` on a
    // disabled button is a no-op — so focus stayed wherever the click left it.
    (node?.querySelector<HTMLElement>("button:not([disabled])") ?? node)?.focus();

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

  const noun = isTrial ? "trial" : "subscription";

  /**
   * THE UNDO CONTROL SAYS WHAT IT GIVES YOU, NOT WHAT IT DOES TO A RECORD.
   *
   * It read "Restart my trial", and Adrian's objection (2026-08-13) was that it
   * is meaningless: nothing has stopped. The user cancelled ten seconds ago, the
   * trial is still running, and "restart" describes an operation on a Stripe
   * flag rather than anything happening to them.
   *
   * On a TRIAL the honest thing is the date, because that is the only thing that
   * changes: today is identical either way, and 19 Aug is the day the two
   * futures separate. On a PAID subscription there is no comparable cliff — the
   * plan simply continues — so it names the plan instead.
   *
   * The cancel side is untouched. "Cancel my trial" is already exactly what it
   * does.
   */
  const resumeLabel = isTrial
    ? `Keep Trackd after ${endsOnShort}`
    : "Keep my subscription";

  /** The confirm's action: cancel, or resume. */
  function runConfirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      // The two branches are written out rather than sharing a call site, so
      // each keeps its own result type. `cancelSubscription` is the only one
      // that can carry an offer.
      if (mode === "cancel") {
        const result = await cancelSubscription();
        inFlight.current = false;
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
          setOffer(result.offer);
          setPhase("offer");
          return;
        }
        close();
        return;
      }

      const result = await resumeSubscription();
      inFlight.current = false;
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      close();
    });
  }

  /** The offer's action. Failing here leaves them cancelled, which is correct. */
  function runClaim() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      const result = await claimExtraTime();
      inFlight.current = false;
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setGrantedUntil(result.endsOn ?? null);
      setPhase("granted");
    });
  }

  const copy = dialogCopy({
    phase,
    mode,
    noun,
    endsOn,
    resumeLabel,
    offer,
    grantedUntil,
    renewalNoun: renewalNoun ?? null,
  });

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => {
          setError(null);
          setOffer(null);
          setGrantedUntil(null);
          setPhase("confirm");
        }}
        className="w-full rounded-xl px-1 py-3 text-left text-sm text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {mode === "cancel" ? `Cancel my ${noun}` : resumeLabel}
      </button>

      {phase !== "closed" &&
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
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            >
              <h2 id="cancel-title" className="text-base font-medium text-foreground">
                {copy.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{copy.body}</p>

              {error ? (
                <p className="mt-3 text-sm text-accent-destructive">{error}</p>
              ) : null}

              <div className="mt-5 flex gap-3">
                {copy.dismiss ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={close}
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
                  disabled={pending}
                  onClick={
                    phase === "granted"
                      ? close
                      : phase === "offer"
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
  renewalNoun,
}: {
  phase: Phase;
  mode: "cancel" | "resume";
  noun: string;
  endsOn: string;
  resumeLabel: string;
  offer: { kind: SaveOfferKind; days: number } | null;
  grantedUntil: string | null;
  renewalNoun: string | null;
}): DialogCopy | null {
  if (phase === "confirm") {
    return mode === "cancel"
      ? {
          title: `Cancel your ${noun}?`,
          // The date is the whole point of this sentence. Somebody cancelling
          // on day 2 of a paid year needs to know they are not throwing away
          // eleven months.
          body: `You'll keep Trackd until ${endsOn}, and you won't be charged after that.`,
          dismiss: `Keep my ${noun}`,
          confirm: "Yes, cancel",
        }
      : {
          title: `${resumeLabel}?`,
          body: `Billing will carry on as normal from ${endsOn}.`,
          dismiss: "Not now",
          confirm: "Yes, keep it",
        };
  }

  if (phase === "offer" && offer) {
    /**
     * THE TRIAL OFFER CHANGES NOTHING ABOUT THE CANCELLATION, and says so.
     *
     * Seven more free days, and it still ends. That is the whole offer: no
     * re-commitment, no billing, no small print, so the sentence can say
     * "you still won't be charged" and be completely true. It is also why this
     * one is safe to put in front of somebody who has just cancelled.
     */
    if (offer.kind === "trial") {
      return {
        title: `Want another ${offer.days} days?`,
        body: `Your trial is cancelled, and that stands. If you'd like longer to decide, we'll add ${offer.days} more free days. You still won't be charged.`,
        dismiss: "No thanks",
        confirm: `Add ${offer.days} days`,
      };
    }

    /**
     * THE PAID OFFER DOES RE-ENABLE BILLING, and says THAT.
     *
     * There is no way to give a paying customer extra free time without
     * un-cancelling, because the thing they cancelled IS the next period. So the
     * sentence states it in the same breath as the offer rather than in a
     * footnote: free period, then billing resumes, cancel any time.
     */
    const period = renewalNoun ? `next ${renewalNoun}` : "next payment";
    return {
      title: `Your ${period}, free?`,
      body: `Your subscription is cancelled, and that stands unless you choose this. If you'd rather stay, your ${period} is on us. Billing carries on after that, and you can cancel again any time.`,
      dismiss: "No thanks",
      confirm: "Yes, stay",
    };
  }

  if (phase === "granted") {
    const until = grantedUntil ? ` until ${grantedUntil}` : "";
    return offer?.kind === "paid"
      ? {
          title: "Done.",
          body: grantedUntil
            ? `Your next payment is on us, so nothing will be charged on ${grantedUntil}.`
            : "Your next payment is on us.",
          dismiss: null,
          confirm: "Close",
        }
      : {
          title: "Done.",
          body: `You've got Trackd${until}, free. We won't charge you.`,
          dismiss: null,
          confirm: "Close",
        };
  }

  return null;
}
