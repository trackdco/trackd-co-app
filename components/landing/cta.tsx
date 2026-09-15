import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * ONE CONTROL, ONE LABEL, ONE OBJECTION LINE (spec 3-02 §Copy).
 *
 * The spec fixes both strings and requires the objection line under EVERY
 * instance of the button, so button and line are one component rather than two
 * things a future edit can separate.
 *
 * ## ⚠️ THE INK IS `--bg-base`, NOT WHITE
 *
 * Measured: near-black on `--accent-amber` is 6.19:1 and passes AA at every
 * size; `--text-primary` on the same amber is 2.65:1 and fails badly. Amber is
 * a mid-luminance hue, so it takes dark text. The instinct to put white on a
 * filled button is the wrong one here.
 *
 * Geometry is `FlowCta`'s, so the button a visitor presses on the landing page
 * is the same object they meet on every screen of the flow it leads into.
 */
export function PrimaryCta({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2.5", className)}>
      <Link
        href="/start"
        className={cn(
          "flex h-13 w-full items-center justify-center rounded-2xl px-6",
          "bg-accent-amber text-[0.95rem] font-medium text-bg-base",
          "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
          "active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
          "motion-reduce:transition-none motion-reduce:active:scale-100",
        )}
      >
        Start tracking
      </Link>
      <p className="text-xs text-text-secondary">7-day free trial. Cancel in one tap.</p>
    </div>
  );
}
