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
 * Progress, as a short bar with its figure beside it.
 *
 * It used to be a full-bleed hairline across the very top, which Adrian could
 * not see on a phone: a 2px line the width of the screen reads as part of the
 * chrome rather than as a reading. This is deliberately small, white and
 * slightly thick, and it sits in the header row next to the back arrow where
 * the eye already goes.
 *
 * It moves SLOWLY. The bar is the only thing on screen that says "you are
 * getting somewhere", so watching it move is the point; snapping wastes it.
 */
export function ProgressRail({ progress }: { progress: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  // Nothing to report on the first screen, and a bar reading 0% is a worse
  // first impression than no bar.
  if (pct <= 0) return null;

  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Setup progress"
    >
      <span className="h-[3px] w-16 overflow-hidden rounded-full bg-bg-surface-raised">
        <span
          className="block h-full rounded-full bg-accent-primary transition-[width] duration-[900ms] ease-[var(--motion-ease)] motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-mono text-[10px] tabular-nums text-text-muted">
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
      className="mx-auto block rounded-md px-3 py-2 text-xs text-text-subtle transition-colors duration-[var(--motion-fast)] hover:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

/**
 * The screen scaffold: header block, a body that takes the slack, and a footer
 * that holds the CTA above the home indicator.
 *
 * `center` vertically centres the body for the moments that are one object on a
 * field (the hook, celebrate, welcome) rather than a form.
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
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col px-5 pt-2", className)}>
      {(eyebrow || title || sub) && (
        <header className="shrink-0 space-y-3 text-center">
          {eyebrow ? <StepEyebrow>{eyebrow}</StepEyebrow> : null}
          {title ? <FlowTitle>{title}</FlowTitle> : null}
          {sub ? <FlowSub className="mx-auto max-w-[20rem]">{sub}</FlowSub> : null}
        </header>
      )}

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          center ? "justify-center" : "justify-start",
          (eyebrow || title || sub) && "pt-8",
        )}
      >
        {children}
      </div>

      <footer className="shrink-0 space-y-3 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {footer}
      </footer>
    </div>
  );
}
