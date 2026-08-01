"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { CARD_EYEBROW, FLOW_SUB, FLOW_TITLE } from "@/lib/ui-presets";

/**
 * The chrome every onboarding screen shares (Spec 3-01).
 *
 * One frame, so sixteen screens cannot drift into sixteen layouts. The scaffold
 * is the house page column (`mx-auto w-full max-w-md px-5`) stretched to the
 * viewport, with the CTA parked on the bottom safe area where a thumb is.
 *
 * These are onboarding-scoped, NOT new shared components: nothing outside this
 * flow imports them, which is the line the spec draws in §2.
 */

/**
 * Progress, as a bar with its figure beside it.
 *
 * It has been through three sizes. It was a full-bleed hairline across the very
 * top, which Adrian could not see on a phone: a 2px line the width of the screen
 * reads as part of the chrome rather than as a reading. It then became a 64x3
 * bar railed to the right of the header, which he could see but which sat off in
 * a corner. It is now **centred, and roughly double** (2026-08-01): the middle
 * of the header is where the eye lands between screens, and the one thing on
 * screen that says "you are getting somewhere" should not be the smallest.
 *
 * It moves SLOWLY, for the same reason: watching it move is the point, and
 * snapping wastes it.
 */
export function ProgressRail({ progress }: { progress: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  // Nothing to report on the first screen, and a bar reading 0% is a worse
  // first impression than no bar.
  if (pct <= 0) return null;

  return (
    <div
      className="flex items-center gap-2.5"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Setup progress"
    >
      <span className="h-[6px] w-36 overflow-hidden rounded-full bg-bg-surface-raised">
        <span
          className="block h-full rounded-full bg-accent-primary transition-[width] duration-[900ms] ease-[var(--motion-ease)] motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-mono text-[11px] tabular-nums text-text-muted">
        {pct}%
      </span>
    </div>
  );
}

/** "DEMO · 1 / 4" and friends. */
export function StepEyebrow({ children }: { children: ReactNode }) {
  return <p className={cn(CARD_EYEBROW, "text-center")}>{children}</p>;
}

export function FlowTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h1 className={cn(FLOW_TITLE, "text-balance", className)}>{children}</h1>;
}

export function FlowSub({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn(FLOW_SUB, "text-pretty", className)}>{children}</p>;
}

/**
 * The primary action. White, per "the primary action takes the primary accent".
 * Full width because it is the only thing to do on the screen.
 */
export function FlowCta({
  children,
  onClick,
  disabled,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-13 w-full rounded-2xl bg-accent-primary px-6 text-[0.95rem] font-medium text-bg-base",
        "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A skip. Deliberately NOT an equal-weight button (§4 "Post-paywall setup
 * order"): small, low-contrast text, so the CTA above it is plainly the path.
 */
export function SkipLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // --text-muted, not --text-subtle. The spec asks for a de-emphasised
      // skip and this still is one against a full-width white CTA, but subtle
      // measures 2.1:1 against the canvas and "de-emphasised" and "below the
      // legibility floor" are not the same requirement.
      className="mx-auto block rounded-md px-3 py-2 text-xs text-text-muted transition-colors duration-[var(--motion-fast)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

/**
 * The screen scaffold: header block, a body that takes the slack, and a footer
 * that holds the CTA above the home indicator.
 *
 * `center` vertically centres the HEADLINE AND the body together, for a screen
 * carrying little or no content under its title: Install, Notifications,
 * Attribution. (The hook, celebrate and welcome are hand-rolled and never come
 * through here — an earlier version of this comment named them, which sent you
 * looking in the wrong file.)
 */
export function StepFrame({
  eyebrow,
  title,
  sub,
  children,
  footer,
  center = false,
  className,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  center?: boolean;
  className?: string;
}) {
  const hasHeader = Boolean(eyebrow || title || sub);
  const header = hasHeader ? (
    <header className="shrink-0 space-y-3 text-center">
      {eyebrow ? <StepEyebrow>{eyebrow}</StepEyebrow> : null}
      {title ? <FlowTitle>{title}</FlowTitle> : null}
      {sub ? <FlowSub className="mx-auto max-w-[20rem]">{sub}</FlowSub> : null}
    </header>
  ) : null;

  return (
    <div className={cn("flex flex-1 flex-col px-5 pt-2", className)}>
      {/* `center` CENTRES THE HEADLINE TOO.
       *
       * It used to centre only the body and leave the title pinned to the top,
       * which is right for a screen with a form under it and wrong for the three
       * that have almost nothing under it. Install, Notifications and
       * Attribution pass an EMPTY body, so the old arrangement gave them a
       * headline against the top edge and a large hole beneath it — Adrian's
       * "it's too high", on all three (2026-08-01). */}
      {!center && header}

      {/* ONE PAGE. No scroll port and no `min-h-0` anywhere on this column.
       *
       * A pinned header and footer with the body scrolling between them was
       * built and Adrian did not want it (2026-08-01): "make it how it was
       * before where it was just all on one page." So the body simply grows,
       * the footer sits after it, and the PAGE scrolls when there is more than
       * fits.
       *
       * `flex-1` with no `min-h-0` is the whole trick. A flex item's default
       * `min-height: auto` means it can never be shrunk below its own content,
       * so short content still pushes the footer down the viewport and long
       * content grows the page instead of being squashed. `min-h-0` is what
       * removed that protection and let the hook's phone go small and the
       * paywall's carousel compress to nothing. */}
      <div
        className={cn(
          "flex w-full flex-1 flex-col",
          center ? "justify-center" : "justify-start",
          !center && hasHeader && "pt-8",
        )}
      >
        {center && header}
        {center && hasHeader && children ? <div className="h-8 shrink-0" /> : null}
        {children}
      </div>

      <footer className="shrink-0 space-y-3 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {footer}
      </footer>
    </div>
  );
}
