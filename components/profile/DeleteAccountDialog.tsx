"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { deleteMyAccount } from "@/app/(app)/profile/delete-account-action";
import { clearDeviceDataFor } from "@/lib/account/clearDeviceData";
import { isRedirectSignal } from "@/lib/account/redirectSignal";
import {
  DELETE_ACCOUNT_COPY as COPY,
  DELETE_ACCOUNT_FAILURE_COPY,
  DELETE_ACCOUNT_MONEY_LINE,
  deletionConfirmed,
} from "@/lib/account/deleteCopy";
import { DANGER_ROW } from "@/lib/ui-presets";

/**
 * ⚠️ ACCOUNT DELETION. The last screen a leaving user reads.
 *
 * Replaces the beta-era `DeleteAccountRequest`, which opened a pre-filled email
 * to support and left the erasure to be performed by hand. Everything visible
 * here is signed copy — see `lib/account/deleteCopy.ts`, pinned byte for byte.
 *
 * ## ⚠️ THE EXIT IS NOT A FUNNEL
 *
 * No save offer, no discount, no pause, no "are you sure you don't want to just
 * cancel instead". `16-account-deletion.md` §2 forbids all four by name. This is
 * somebody leaving, and the only thing this screen does is make sure they meant
 * it and then get out of the way.
 *
 * ## ⚠️ NOT GATED
 *
 * Nothing here consults write access, and the action behind it does not either.
 * A lapsed, read-only account must be able to complete this end to end — an
 * account nobody can leave is data held hostage.
 *
 * ## Type-to-confirm (D58), exact and case-sensitive
 *
 * `delete` does not enable the button and neither does `DELETE ` with a trailing
 * space. Hold-to-confirm and a plain two-button dialog were both declined: this
 * is irreversible health data and the friction is the feature. The comparison
 * lives in `deletionConfirmed`, tested separately, so it cannot drift into a
 * `.trim()` here.
 *
 * ## Focus, and why it is this much code
 *
 * Same pattern as `CancelSubscription`, for the same measured reason: without
 * it, `aria-modal="true"` is a lie — focus never enters, Tab walks out onto the
 * nav behind the backdrop, and a screen-reader user operates controls they were
 * never told about. Focus moves in on open, Tab cycles inside, Escape closes,
 * and focus returns to the trigger.
 *
 * ⚠️ The focusable set includes the INPUT, not just buttons. `CancelSubscription`
 * queries `button:not([disabled])` because it has no input; copying that
 * selector here would trap focus on two buttons and skip the one control the
 * screen exists for.
 */
export function DeleteAccountDialog({
  userId,
  hasBillableSubscription,
  hasOpenRefundRequest,
  variant = "row",
}: {
  /**
   * ⚠️ FOR THE DEVICE SWEEP ONLY, AND IT IS NOT AN ACTION ARGUMENT.
   *
   * The server action still takes NO user id and resolves the account from the
   * verified session. This id never leaves the browser: it is the key prefix
   * `clearDeviceDataFor` matches on to remove this user's local stores once the
   * deletion has actually succeeded. Passing it to a client component is not the
   * thing §3.8 forbids; passing it to a `"use server"` export would be.
   */
  userId: string;
  /** D59's money line renders only when a live subscription or trial exists. */
  hasBillableSubscription: boolean;
  /** D56's warning renders only when an open refund request exists. */
  hasOpenRefundRequest: boolean;
  variant?: "link" | "row";
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** ⚠️ The control a RETRY means. See the restore branch in the effect below. */
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  /** Guards the same-tick double fire `pending` cannot: `useTransition` has not
   *  committed within the same tick, so `disabled` is still false. */
  const inFlight = useRef(false);
  const didFocus = useRef(false);

  const armed = deletionConfirmed(typed);

  /** Close, reset, and put focus back where it came from. */
  const close = useCallback(() => {
    setOpen(false);
    setTyped("");
    setError(null);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) {
      didFocus.current = false;
      return;
    }
    const node = dialogRef.current;

    /**
     * ⚠️ FOCUS GOES TO THE INPUT, ONCE.
     *
     * It is the only control that can make progress, and putting focus on a
     * disabled confirm button would be a no-op that leaves focus outside the
     * dialog. Once, because re-running on every keystroke would fight the caret.
     */
    if (!didFocus.current) {
      didFocus.current = true;
      (inputRef.current ?? node)?.focus();
    } else if (!pending && node && !node.contains(document.activeElement)) {
      /**
       * ⚠️ FOCUS GOES TO THE CONTROL THAT RETRIES, NOT TO WHATEVER HAD IT.
       *
       * Submitting disables the input AND both buttons in the same commit, so
       * whichever of them held focus is disabled and the browser drops focus to
       * `<body>` - outside a dialog still asserting `aria-modal="true"`. When
       * the request then FAILS, nothing put it back: `didFocus` is already
       * true, so the open-branch above does not re-run.
       *
       * ⚠️ NOT "restore whatever had it before". `CancelSubscription` tried
       * that and a cold review measured it wrong: **WebKit does not focus a
       * `<button>` on tap**, so on the iPhone the capture returned the DISMISS
       * control, and the restore landed the user on the button that ABANDONS
       * the action, under a message reading "Please try again". One Enter threw
       * the whole thing away.
       *
       * The confirm button is held by ref instead. It is the control the
       * failure is about and the one a retry means, and it is the same answer
       * on every engine.
       */
      const retry = confirmRef.current;
      if (retry && !retry.disabled) {
        retry.focus();
      } else {
        (
          node.querySelector<HTMLElement>(
            "button:not([disabled]), input:not([disabled])",
          ) ?? node
        ).focus();
      }
    }

    const focusableIn = (n: HTMLElement) =>
      Array.from(
        n.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled])",
        ),
      );

    const onKey = (e: KeyboardEvent) => {
      // ⚠️ Escape is refused mid-flight. The request is already in the air and
      // closing would leave somebody staring at a profile screen with no idea
      // whether their account is being erased.
      // ⚠️ `inFlight` AS WELL AS `pending`. `useTransition` has not committed
      // in the same tick as the submit, so `pending` is still false and Escape
      // would close over a request already in the air - see the backdrop.
      if (e.key === "Escape" && !pending && !inFlight.current) {
        close();
        return;
      }
      if (e.key !== "Tab" || !node) return;

      const focusable = focusableIn(node);
      /**
       * Nothing enabled is not permission to leave. During the request every
       * control is disabled; without this, Tab walks out of a dialog still
       * claiming `aria-modal` onto the nav behind the backdrop. The dialog is
       * `tabIndex={-1}` so it is a legitimate target.
       */
      if (focusable.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const outside = !node.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, close]);

  function submit() {
    // Belt and braces behind `disabled`: the server re-checks the phrase too.
    if (!armed || inFlight.current) return;
    inFlight.current = true;
    setError(null);

    startTransition(async () => {
      try {
        // On success this never returns - the action signs the browser out and
        // redirects to the public homepage. Only a failure comes back.
        const result = await deleteMyAccount(typed);
        /**
         * ⚠️ REACHING HERE AT ALL MEANS THE DELETION DID **NOT** SUCCEED.
         *
         * Measured in the installed Next 16.2.7 rather than reasoned about, and
         * two cold reviewers disagreed about it, so the source is cited:
         * `client/components/router-reducer/reducers/server-action-reducer.js`
         * REJECTS the action promise when the response carries a redirect
         * (`:215-233`) and only `resolve()`s when there is none (`:237`). It
         * also discards the action's own return value on a redirect
         * (`:140`, `actionResult = redirectLocation ? undefined : response.a`).
         *
         * `deleteMyAccount` redirects on success, so **the success path always
         * lands in the `catch` below and never here.** This branch sees only a
         * returned failure.
         *
         * ⚠️ SO NOTHING HERE MAY CLEAR THE DEVICE. It used to, on the reasoning
         * that the runtime might resolve instead of reject; it does not, and a
         * clear on this path would have destroyed on-device health data for an
         * account that still exists.
         *
         * An answer we cannot read is not a success either. It gets the same
         * honest sentence as any other failure we cannot classify.
         */
        if (result?.error) {
          setError(result.error);
        } else {
          setError(DELETE_ACCOUNT_FAILURE_COPY.unknown);
        }
      } catch (e) {
        /**
         * ⚠️ THE REDIRECT SIGNAL IS THE ONLY SUCCESS SIGNAL THIS FUNCTION GETS,
         * AND IT IS IDENTIFIED BY THE DIGEST'S **VALUE**, NEVER ITS PRESENCE.
         *
         * This read `"digest" in e`, and React attaches a digest to server
         * errors too. Measured against the installed Next 16.2.7:
         *
         *     redirect      digest = "NEXT_REDIRECT;replace;/;307;"
         *     server crash  digest = "3849572013"
         *     `"digest" in e`   TRUE for BOTH
         *
         * So a crashed action was read as a completed deletion: the device copy
         * was wiped for an account that still existed, and the failure message
         * never rendered. See {@link isRedirectSignal}, whose test builds its
         * fixture with Next's own `getRedirectError`.
         */
        if (isRedirectSignal(e)) {
          // The deletion completed and the navigation is already in flight. This
          // is the ONLY place the device copy may be cleared.
          clearDeviceDataFor(userId);
          throw e;
        }
        /**
         * ⚠️ IT DOES NOT SAY WHAT WAS REMOVED, BECAUSE IT DOES NOT KNOW.
         *
         * Reaching here means the request itself failed, so how far the server
         * got is genuinely unknown, and the one thing that must not be asserted
         * is that nothing happened.
         *
         * ⚠️ This was previously unreachable for a SERVER-SIDE failure, which is
         * the commonest way to get here: such an error carries a digest, so the
         * presence test above swallowed it as a success and rethrew. Signed copy
         * that rendered to nobody. The value test restores it.
         */
        setError(DELETE_ACCOUNT_FAILURE_COPY.unknown);
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "row"
            ? DANGER_ROW
            : "mx-auto block min-h-11 rounded-md px-2 py-2 text-xs text-text-subtle underline underline-offset-2 outline-none transition-colors hover:text-text-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        }
      >
        Delete my account
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
            onClick={() => {
              /**
               * ⚠️ `inFlight` AS WELL AS `pending`, AND THE REF IS WHY IT
               * EXISTS. A backdrop tap in the SAME TICK as the confirm closed
               * the dialog mid-request on `CancelSubscription`, and the failure
               * then had nowhere to render its message - leaving somebody on a
               * profile screen with no idea whether their account was being
               * erased, which is the exact state the Escape guard above names.
               * `pending` cannot cover it: `useTransition` has not committed.
               */
              if (!pending && !inFlight.current) close();
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-account-title"
              /**
               * ⚠️ THE MONEY LINE AND THE REFUND WARNING ARE PART OF WHAT THIS
               * DIALOG SAYS. Named only the body, a screen reader announced the
               * title and the body and NOT the one sentence on the screen about
               * money. Both are present at open rather than appearing later, so
               * they belong in the description rather than in a live region.
               */
              aria-describedby={[
                "delete-account-body",
                hasBillableSubscription ? "delete-account-money" : null,
                hasOpenRefundRequest ? "delete-account-refund" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-busy={pending}
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg outline-none animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            >
              <h2
                id="delete-account-title"
                className="text-base font-medium text-foreground"
              >
                {COPY.title}
              </h2>

              <p
                id="delete-account-body"
                className="mt-1.5 text-sm leading-relaxed text-text-muted"
              >
                {COPY.body}
              </p>

              {/* ⚠️ D59. Only when a live subscription or trial exists - a
                  sentence about a subscription somebody does not have is noise
                  on the one screen where clarity matters most. */}
              {hasBillableSubscription ? (
                <p
                  id="delete-account-money"
                  className="mt-3 text-sm leading-relaxed text-text-muted"
                >
                  {DELETE_ACCOUNT_MONEY_LINE}
                </p>
              ) : null}

              {/* ⚠️ D56. Only when an open refund request exists. */}
              {hasOpenRefundRequest ? (
                <p
                  id="delete-account-refund"
                  className="mt-3 rounded-xl border border-accent-destructive/40 p-3 text-sm leading-relaxed text-text-muted"
                >
                  {COPY.refundWarning}
                </p>
              ) : null}

              <label
                htmlFor="delete-account-confirm"
                className="mt-5 block text-xs font-medium text-text-muted"
              >
                {COPY.inputLabel}
              </label>
              <input
                ref={inputRef}
                id="delete-account-confirm"
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && armed && !pending) submit();
                }}
                disabled={pending}
                placeholder={COPY.placeholder}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                /**
                 * ⚠️ DESTRUCTIVE RED, NOT THE DEFAULT AMBER (Adrian, 2026-09-10).
                 *
                 * `--ring` is `--accent-amber`, so the stock `ring-ring` lit this
                 * field amber on focus - the same colour the app uses for neutral
                 * emphasis everywhere else. On the one field that arms an
                 * irreversible deletion that reads as ordinary.
                 *
                 * `--accent-destructive` is the documented token for exactly this
                 * ("deep red, for deliberate destructive actions - sign out,
                 * delete", `ui-context.md` §Colour), and the fill and border
                 * opacities are existing house values rather than new ones.
                 *
                 * ⚠️ `outline-accent-destructive` IS LOAD-BEARING, NOT BELT AND
                 * BRACES. `globals.css`'s base layer applies `outline-ring/50` to
                 * `*`, and `--ring` is `--accent-amber` - so this field inherited
                 * a pale amber outline colour. Adrian saw it on an iPhone and read
                 * it as WHITE, which is exactly what a 50%-alpha tan reads as on a
                 * dark ground. `outline-none` sets the STYLE and leaves that colour
                 * behind for iOS Safari to paint its own ring with, so the colour
                 * has to be pinned too. Measured in Chromium: the computed
                 * outline-color was `oklab(0.671 0.041 0.130 / 0.5)`, i.e. #C8861A
                 * at half alpha.
                 *
                 * ⚠️ The placeholder is RED, not `text-text-subtle`. Grey was the
                 * default and it made the one word somebody has to copy read as
                 * disabled text on a field that is anything but.
                 */
                className="mt-1.5 h-11 w-full rounded-xl border border-accent-destructive bg-accent-destructive/25 px-3 font-mono text-sm text-foreground outline-none outline-accent-destructive transition-colors placeholder:text-accent-destructive-on-surface/60 focus-visible:ring-2 focus-visible:ring-accent-destructive disabled:opacity-50"
              />

              {error ? (
                <p role="alert" className="mt-3 text-sm text-[var(--state-error)]">
                  {error}
                </p>
              ) : null}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="min-h-11 flex-1 rounded-xl border border-border-strong py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
                >
                  {COPY.dismiss}
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={submit}
                  disabled={!armed || pending}
                  className="min-h-11 flex-1 rounded-xl bg-accent-destructive py-2.5 text-center text-sm font-medium text-text-primary transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {pending ? "Deleting…" : COPY.confirm}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
