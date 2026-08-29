"use client";

import { cn } from "@/lib/utils";

/**
 * "Skip for now", and the one question worth asking first.
 *
 * ⚠️ THE WARNING IS TRUE, WHICH IS THE ONLY REASON IT IS HERE. Skipping is not
 * a preference on iOS: Apple only delivers Web Push to a home-screen app, so an
 * un-installed Trackd cannot send a reminder at all. A confirm step that
 * invented a consequence to keep somebody in the flow would be a dark pattern.
 * This one states the mechanism and names the way back — there IS a permanent
 * "Add to Home Screen" row in Profile — which is what stops it reading as a
 * threat rather than a fact.
 *
 * ## ⚠️ IT REPLACES THE ACTIONS, IT DOES NOT EXPAND BELOW THEM
 *
 * The first build opened the panel underneath the buttons. Measured, "Skip
 * anyway" landed at viewport y=1020 in a 932pt viewport and the page would only
 * scroll 33px — a confirmation whose answer was off-screen. `scrollIntoView`
 * did not save it, because the shell clips rather than scrolls that far.
 *
 * Swapping the block for the panel keeps the height bounded by construction, so
 * there is nothing to scroll to and nothing to measure. Cancelling puts the
 * actions straight back.
 */
export function SkipConfirm({
  onCancel,
  onSkip,
}: {
  onCancel: () => void;
  onSkip: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[color-mix(in_srgb,var(--color-accent-destructive)_38%,transparent)]",
        "bg-[color-mix(in_srgb,var(--color-accent-destructive)_10%,transparent)] px-4 py-3.5",
        "animate-in fade-in slide-in-from-bottom-2 duration-[var(--motion-base)] ease-[var(--motion-ease)]",
        "motion-reduce:animate-none",
      )}
    >
      <p className="text-[0.92rem] font-medium text-foreground">Skip adding it?</p>
      <p className="mt-1 text-[0.83rem] leading-snug text-text-muted">
        Reminders can&rsquo;t reach you until Trackd is on your home screen. You
        can add it later from your profile.
      </p>
      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 flex-1 rounded-xl bg-bg-surface-raised text-[0.88rem] font-medium text-foreground transition-colors duration-[var(--motion-fast)] hover:bg-bg-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
        >
          Go back
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="h-11 flex-1 rounded-xl bg-[var(--color-accent-destructive)] text-[0.88rem] font-medium text-white transition-[filter] duration-[var(--motion-fast)] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
        >
          Skip anyway
        </button>
      </div>
    </div>
  );
}

/** The quiet row that opens the question. Dark red, because it is the exit. */
export function SkipTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto block rounded-md px-3 py-2 text-xs text-[color-mix(in_srgb,var(--color-accent-destructive)_82%,white)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--color-state-error)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
    >
      Skip for now
    </button>
  );
}
