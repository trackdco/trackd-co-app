"use client";

import { useEffect, useState, useTransition } from "react";
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  const noun = isTrial ? "trial" : "subscription";

  function run() {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "cancel" ? await cancelSubscription() : await resumeSubscription();
      if (result.ok) {
        setOpen(false);
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
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
              if (!pending) setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-title"
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
                  onClick={() => setOpen(false)}
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
