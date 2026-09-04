"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { deleteMyAccount } from "@/app/(app)/profile/delete-account-action";
import {
  DELETE_ACCOUNT_COPY as COPY,
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
  hasBillableSubscription,
  hasOpenRefundRequest,
  variant = "row",
}: {
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
      if (e.key === "Escape" && !pending) {
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
        setError(result.error);
      } catch (e) {
        // ⚠️ `redirect()` throws a control-flow signal Next re-throws. Anything
        // else is a real failure and must not read as success.
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError("Your account could not be deleted. Nothing has been removed. Please try again.");
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
              if (!pending) close();
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-account-title"
              aria-describedby="delete-account-body"
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
                <p className="mt-3 text-sm leading-relaxed text-text-muted">
                  {DELETE_ACCOUNT_MONEY_LINE}
                </p>
              ) : null}

              {/* ⚠️ D56. Only when an open refund request exists. */}
              {hasOpenRefundRequest ? (
                <p
                  role="alert"
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
                className="mt-1.5 h-11 w-full rounded-xl border border-border-strong bg-bg-base px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
