import { Plus, Share } from "lucide-react";

/**
 * The shared "Add to Home Screen" instructions for iPhone. Used by the one-time
 * install popup (components/pwa/InstallHomeScreenPopup), the permanent Profile →
 * "Add to Home Screen" row (components/profile/InstallAppRow), and the push flow
 * when iOS isn't installed yet (iOS only delivers Web Push to a Home-Screen-
 * installed standalone PWA).
 *
 * Presentational only (no hook, no state) — the parent decides when to show it.
 */
export function AddToHomeScreenPrompt() {
  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-5">
      <p className="font-display text-lg text-foreground">
        Add Trackd to your Home Screen
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
        On iPhone, reminders only work once Trackd is installed. It takes a
        second:
      </p>
      <ol className="mt-4 space-y-3">
        <li className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-surface-raised text-accent-amber">
            <Share className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm leading-snug text-text-muted">
            Tap the <span className="text-foreground">Share</span> button — on
            newer iPhones it&apos;s inside the{" "}
            <span className="text-foreground">•••</span> menu
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-surface-raised text-accent-amber">
            <Plus className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm leading-snug text-text-muted">
            Choose <span className="text-foreground">Add to Home Screen</span>,
            then open Trackd from your Home Screen and turn reminders on here.
          </span>
        </li>
      </ol>
    </div>
  );
}
