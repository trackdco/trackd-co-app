"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { cancelSubscription, resumeSubscription } from "@/app/(app)/billing/actions";

/**
 * The cancel control, and its undo.
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
 */
export function CancelSubscription({
  mode,
  endsOn,
  isTrial,
}: {
  mode: "cancel" | "resume";
  /** Already formatted in the user's own timezone by the server. */
  endsOn: string;
  isTrial: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  /** Guards the same-TICK double fire that `pending` cannot: `useTransition`
   *  has not committed within the same tick, so `disabled` is still false and
   *  two clicks in one tick sent two requests (measured at a 0ms gap). */
  const inFlight = useRef(false);

  /** Close, and put focus back where it came from. */
  const close = useCallback(() => {
    setOpen(false);
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
   */
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    node?.querySelector<HTMLElement>("button")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) {
        close();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>("button:not([disabled])"),
      );
      if (focusable.length === 0) return;
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
  }, [open, pending, close]);

  const noun = isTrial ? "trial" : "subscription";

  function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      const result =
        mode === "cancel" ? await cancelSubscription() : await resumeSubscription();
      inFlight.current = false;
      if (result.ok) {
        close();
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="w-full rounded-xl px-1 py-3 text-left text-sm text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {mode === "cancel" ? `Cancel my ${noun}` : `Restart my ${noun}`}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
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
                {mode === "cancel" ? `Cancel your ${noun}?` : `Restart your ${noun}?`}
              </h2>
              <p className="mt-1.5 text-sm text-text-muted">
                {mode === "cancel"
                  ? // The date is the whole point of this sentence. Somebody
                    // cancelling on day 2 of a paid year needs to know they are
                    // not throwing away eleven months.
                    `You'll keep Trackd until ${endsOn}, and you won't be charged after that.`
                  : `Billing will carry on as normal from ${endsOn}.`}
              </p>

              {error ? (
                <p className="mt-3 text-sm text-accent-destructive">{error}</p>
              ) : null}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={close}
                  className="flex-1 rounded-2xl border border-border-default py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {/* The stay-put option is the one that keeps its full weight.
                      Not a trick: it is also the shorter path, and it is what
                      most people who open this dialog by accident want. */}
                  {mode === "cancel" ? `Keep my ${noun}` : "Not now"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={run}
                  className="flex-1 rounded-2xl border border-border-default bg-bg-surface-raised py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {pending
                    ? "Working…"
                    : mode === "cancel"
                      ? "Yes, cancel"
                      : "Yes, restart"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
