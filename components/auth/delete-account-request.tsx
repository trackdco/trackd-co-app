"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Account-deletion request (the in-app "deletion control" the Privacy Policy
 * refers to). During the beta there is no self-serve delete — tapping this opens
 * a pre-filled email to legal@trackdco.app, and we erase the account + all its
 * data on request (within 30 days). The full self-serve flow — a SECURITY
 * DEFINER delete of the caller's auth.users row (which cascades every user-owned
 * table) plus a storage-file sweep — is post-beta work.
 *
 * Quiet, destructive affordance: a small muted link (rare + irreversible), not a
 * loud button. The modal is portaled to <body> so it clears the fixed bottom nav
 * (same reason as SignOutConfirm).
 */
const LEGAL_EMAIL = "legal@trackdco.app";

export function DeleteAccountRequest({ email }: { email: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const mailto =
    `mailto:${LEGAL_EMAIL}` +
    `?subject=${encodeURIComponent("Account deletion request")}` +
    `&body=${encodeURIComponent(
      "Please permanently delete my Trackd account and all of my data.\n\n" +
        `Account email: ${email || "(unknown)"}\n\n` +
        "I understand this is permanent and cannot be undone.",
    )}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto block rounded-md px-2 py-2 text-xs text-text-subtle underline underline-offset-2 outline-none transition-colors hover:text-text-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        Delete my account
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-account-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            >
              <h2
                id="delete-account-title"
                className="text-base font-semibold text-foreground"
              >
                Delete your account?
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
                During the beta, account deletion is handled by request. Tap
                below to email us at{" "}
                <span className="whitespace-nowrap text-foreground">
                  {LEGAL_EMAIL}
                </span>
                , and we&apos;ll permanently erase your account and all your data
                within 30 days. This can&apos;t be undone.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-border-strong py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
                >
                  Cancel
                </button>
                <a
                  href={mailto}
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl bg-accent-destructive py-2.5 text-center text-sm font-semibold text-text-primary transition-opacity hover:opacity-90"
                >
                  Email request
                </a>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
