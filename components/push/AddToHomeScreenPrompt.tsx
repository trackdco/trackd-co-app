import { MoreHorizontal, Plus, Share } from "lucide-react";

import { CARD_TITLE } from "@/lib/ui-presets";

/**
 * The shared "Add to Home Screen" instructions for iPhone. Used by the install
 * popup (components/pwa/InstallHomeScreenPopup), the permanent Profile → "Add to
 * Home Screen" row (components/profile/InstallAppRow), and the push flow when iOS
 * isn't installed yet (iOS only delivers Web Push to a Home-Screen-installed
 * standalone PWA).
 *
 * NOTE on spacing: every bold <span> is followed by an explicit {" "} so the space
 * survives JSX whitespace collapsing — without it, a line wrap turns "Share button"
 * into "Sharebutton".
 *
 * Presentational only (no hook, no state) — the parent decides when to show it.
 */
export function AddToHomeScreenPrompt() {
  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-5">
      <p className={CARD_TITLE}>Add Trackd to your Home Screen</p>
      <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
        Get the full app, not a Safari tab — here&apos;s how:
      </p>
      <ol className="mt-4 space-y-3">
        <li className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-surface-raised text-accent-amber">
            <Share className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm leading-snug text-text-muted">
            Tap the <span className="text-foreground">Share</span>{" "}
            button — on newer iPhones it&apos;s inside the{" "}
            <span className="text-foreground">•••</span> menu.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-surface-raised text-accent-amber">
            <MoreHorizontal className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm leading-snug text-text-muted">
            Tap <span className="text-foreground">View more</span>{" "}
            if you don&apos;t see the next option yet.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-surface-raised text-accent-amber">
            <Plus className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm leading-snug text-text-muted">
            Choose <span className="text-foreground">Add to Home Screen</span>,
            then open Trackd from your Home Screen.
          </span>
        </li>
      </ol>
    </div>
  );
}
