"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { signOut } from "@/app/(app)/actions";

/**
 * Sign out with a confirm step (Context/Feature Specs/08 → B6). Used on every
 * entry point — the shell header link and the Profile bottom button — so a tap
 * can never sign you out by accident. The actual sign-out is the `signOut` server
 * action (submitted from the Confirm button's form, so it still works without
 * client JS once the confirm is shown).
 *
 * `variant`:
 *  - `link`   — the quiet header text link.
 *  - `button` — the Profile bottom button, styled deep red (destructive token).
 */
export function SignOutConfirm({ variant }: { variant: "link" | "button" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
          variant === "link"
            ? "-mr-2 rounded-md px-2 py-2 text-sm text-text-muted hover:text-foreground"
            : "flex w-full items-center justify-center rounded-2xl border border-accent-destructive/50 bg-accent-destructive/10 py-3.5 text-sm font-medium text-accent-destructive hover:bg-accent-destructive/15",
        )}
      >
        Sign out
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="signout-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
          >
            <h2
              id="signout-title"
              className="text-base font-semibold text-foreground"
            >
              Sign out?
            </h2>
            <p className="mt-1.5 text-sm text-text-muted">
              You&apos;ll need to sign in again to get back to your protocol.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-border-strong py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
              <form action={signOut} className="flex-1">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-accent-destructive py-2.5 text-sm font-semibold text-text-primary transition-opacity hover:opacity-90"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
