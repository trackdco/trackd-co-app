"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

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

/** How much of an edge the mask eats. Must match `.flow-scroll-fade`. */
const FADE_TOP_PX = 34;
const FADE_BOTTOM_PX = 44;

/**
 * The scrolling body of a flow screen. ONE definition, seven callers.
 *
 * There were seven hand-rolled copies of this class string, which is how a
 * fault in it reached seven screens at once and how two separate faults sat in
 * it unnoticed. Both are described at `.flow-scroll-fade` in `globals.css`: the
 * clipped focus ring, and a fade that ran whether or not there was anything
 * hidden behind it.
 *
 * This owns the second one. `data-fade` is written from the REAL scroll
 * position, and an edge only earns a gradient when more than that gradient's
 * own depth is hidden past it.
 *
 * ## It writes the DOM directly and holds no state
 *
 * Deliberate, and not only for the render it saves: this has to settle on
 * mount, on scroll, and whenever the content or the viewport resizes, and the
 * house ESLint config forbids `setState` in an effect body. Setting an
 * attribute is not a render, so the mount case stops being a special one.
 */
export function ScrollPort({
  children,
  className,
  style,
  portRef,
  fade = true,
}: {
  children?: ReactNode;
  className?: string;
  /**
   * ⚠️ THE EDGE MASK, WHICH A SCREEN MAY DECLINE.
   *
   * `.flow-scroll-fade` is a `mask-image`, not a tint — it does not fade
   * content, it REMOVES it, 34px off the top and 44px off the bottom. That is
   * right for a flow screen you are reading through and wrong for one you are
   * filling in: on the card screen it eats the field you are typing into and
   * the price line you are checking.
   *
   * False means the effect below never runs and `data-fade` is never written,
   * so every rule in `globals.css` — all of them keyed on `[data-fade="…"]` —
   * simply does not match. Nothing is deleted for the six screens that want it.
   */
  fade?: boolean;
  /**
   * Longhands only. An inline `animation` or `transition` shorthand outranks
   * the reduced-motion block in the stylesheet and cannot be switched off from
   * it, which is the trap `ui-context.md` → Motion names.
   */
  style?: CSSProperties;
  /** Supply one only if the screen also drives the scroll itself (the demo). */
  portRef?: RefObject<HTMLDivElement | null>;
}) {
  const ownRef = useRef<HTMLDivElement | null>(null);
  const ref = portRef ?? ownRef;

  useEffect(() => {
    if (!fade) return;
    const el = ref.current;
    if (!el) return;

    const sync = () => {
      const above = el.scrollTop;
      const below = el.scrollHeight - el.clientHeight - el.scrollTop;
      const top = above > FADE_TOP_PX;
      const bottom = below > FADE_BOTTOM_PX;
      el.dataset.fade =
        top && bottom ? "both" : top ? "top" : bottom ? "bottom" : "none";
    };

    sync();
    el.addEventListener("scroll", sync, { passive: true });

    // The content grows and shrinks under us: images decode, Kyle arrives, the
    // demo accumulates cards, an error line appears above the CTA. Observing
    // the port alone catches the viewport but not the content, so both.
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    return () => {
      el.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [ref, fade]);

  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        "flow-scroll-fade flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden",
        className,
      )}
    >
      {children}
    </div>
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
  fade = true,
  above,
}: {
  /**
   * A slot ABOVE the headline, inside the scroll port.
   *
   * Mirrors {@link footer} at the other end. It exists because the paywall
   * leads with Kyle and nothing else in this frame can sit higher than the
   * title — passing him as `eyebrow` would wrap a render in
   * `StepEyebrow`'s tracked-uppercase span, and passing him inside `title`
   * would put him inside `FlowTitle`.
   */
  above?: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  center?: boolean;
  className?: string;
  /** See `ScrollPort`. False makes this screen one plain scroll with no mask. */
  fade?: boolean;
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
    <div className={cn("flex min-h-0 flex-1 flex-col px-5 pt-2", className)}>
      {/* `center` CENTRES THE HEADLINE TOO.
       *
       * It used to centre only the body and leave the title pinned to the top,
       * which is right for a screen with a form under it and wrong for the three
       * that have almost nothing under it. Install, Notifications and
       * Attribution pass an EMPTY body, so the old arrangement gave them a
       * headline against the top edge and a large hole beneath it — Adrian's
       * "it's too high", on all three (2026-08-01). */}
      {!center && above}
      {!center && header}

      {/* THE BODY SCROLLS, THE CHROME DOES NOT.
       *
       * The flex child is the SCROLL PORT and is itself a flex column; the
       * wrapper inside it is `flex-1`. Because a flex item's default
       * `min-height` is `auto`, that wrapper can never be shrunk below its own
       * content — so it is `max(content, available)`. `justify-center` then
       * centres only when there IS free space, and when there is not the
       * wrapper is exactly content height and the port scrolls from the top
       * with nothing cut off.
       *
       * `min-h-full` was tried instead and silently did nothing: a percentage
       * min-height needs a definite containing height, and Chrome resolved it
       * against content — measured at 328px inside a 664px port, so
       * `justify-center` had no free space and every centred screen hugged the
       * top. Sizing with flex removes the question.
       *
       * `overflow-x-hidden` explicitly: setting `overflow-y` alone computes
       * `overflow-x` to `auto`, which gave the hook 4px of real sideways scroll
       * at 360. The shell's `overflow-x-clip` cannot reach inside a port. */}
      <ScrollPort
        fade={fade}
        className={cn(
          // NO PINNED FOOTER: the safe area becomes the SCROLL PORT's problem,
          // because the element that would have held it clear of the home
          // indicator no longer exists. Without this a CTA at the end of the
          // content is reachable and then sits under the indicator.
          !footer && "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div
          className={cn(
            "flex w-full flex-1 flex-col",
            center ? "justify-center" : "justify-start",
            !center && hasHeader && "pt-8",
          )}
        >
          {center && above}
          {center && header}
          {center && hasHeader && children ? <div className="h-8 shrink-0" /> : null}
          {children}
        </div>
      </ScrollPort>

      {/* THE FOOTER IS OPTIONAL, and its absence is a real layout, not an empty
          box. Rendered unconditionally it contributed `pt-6` plus the whole
          bottom safe area of nothing, so a screen that deliberately puts its
          CTA in the scroll flow (the founder letter) still paid for a pinned
          one. Every other screen passes a footer and is unaffected. */}
      {footer ? (
        <footer className="shrink-0 space-y-3 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
