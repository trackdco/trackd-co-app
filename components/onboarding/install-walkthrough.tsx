"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";

import {
  INSTALL_WALKTHROUGH,
  installFlowId,
  type DeviceGuess,
} from "@/lib/onboarding/platform";
import { cn } from "@/lib/utils";

/**
 * The install, shown rather than described (Adrian, 2026-08-29).
 *
 * The screen used to carry a three-line text list. That is fine if you already
 * know roughly where the control is; it is not fine for the person this step
 * exists for, who is looking at a menu they have never opened and cannot find
 * the row we are naming. So each step is a drawing of their own screen at that
 * moment.
 *
 * ## ONE frame, not a row of cards (Adrian, 2026-08-29)
 *
 * This was a side-scrolling carousel first, and he asked for the earlier shape
 * back: **a single phone frame with the steps sliding through it, and a slider
 * underneath to move between them.** He is right. A carousel puts three
 * half-steps on screen at once and invites you to compare them; what is being
 * taught here is a sequence, and a sequence wants one frame that changes. The
 * scrubber also gives the thing a visible length, so nobody wonders how much
 * further it goes.
 *
 * The slide is native scroll-snap rather than a hand-written transition, so a
 * thumb-drag gets the platform's own momentum and rubber-banding, and the
 * slider simply scrolls the same box.
 *
 * ## Two decisions worth knowing
 *
 * **The frames are images, not DOM.** `app-carousel.tsx` already ships real
 * captures out of the `/preview/*` harness for the same reason, and the same
 * warning applies here: **re-render the frames when the drawn screens change**
 * or this quietly goes stale. The alternative was porting every browser's
 * chrome into production JSX, which is a second copy of a thing that already
 * exists and would be the copy that drifts.
 *
 * **The frames are CROPPED to the control, not whole phones.** A whole phone
 * scaled into this screen is about 140px wide and its menu rows are unreadable,
 * which defeats the entire point. Each frame is a window on the part of the
 * screen that matters, with everything dimmed except the row to press.
 *
 * The caption is real text below the frame rather than burned into the image,
 * so it is readable by a screen reader and editable without re-rendering.
 */
export function InstallWalkthrough({ device }: { device: DeviceGuess }) {
  const flow = installFlowId(device);
  const steps = flow ? INSTALL_WALKTHROUGH[flow] : null;
  const railRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  /* Which step fills the frame. Read back off the scroll position so a drag
     and the slider can never disagree about where we are. */
  const onScroll = useCallback(() => {
    const rail = railRef.current;
    if (!rail || !rail.clientWidth) return;
    const i = Math.round(rail.scrollLeft / rail.clientWidth);
    setAt((prev) => (prev === i ? prev : i));
  }, []);

  const go = useCallback((i: number) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollTo({
      left: i * rail.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, []);

  // A device change swaps the whole set, so start back at step one rather than
  // leaving someone on "step 4 of 3" from the platform they just left. Adjusted
  // during render rather than in an effect — an effect here sets state after
  // paint, which shows the new frames under the old index for one frame. The
  // rail is keyed by flow too, so its scroll position resets with it.
  const [shownFlow, setShownFlow] = useState(flow);
  if (flow !== shownFlow) {
    setShownFlow(flow);
    setAt(0);
  }

  if (!steps || !flow) return null;

  const last = steps.length - 1;
  const now = Math.min(at, last);
  const step = steps[now];

  return (
    <section aria-label="How to add Trackd, step by step" className="space-y-3">
      {/* ONE frame. Every step slides through this same box. */}
      <div
        key={flow}
        ref={railRef}
        onScroll={onScroll}
        className={cn(
          "flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain",
          "rounded-2xl border border-border-default bg-bg-surface",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {steps.map((s, i) => (
          <Image
            key={s.text}
            src={`/onboarding/install/${flow}/${String(i + 1).padStart(2, "0")}.webp`}
            alt={s.text}
            width={660}
            height={528}
            // the first frame is the one that blocks; the rest arrive as the
            // frame is dragged through
            loading={i === 0 ? "eager" : "lazy"}
            className="block h-auto w-full shrink-0 snap-center"
          />
        ))}
      </div>

      {/* The scrubber. A real range input, so a dragged thumb and the arrow
          keys both work without reimplementing either. */}
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={now}
          onChange={(e) => go(Number(e.target.value))}
          aria-label="Step"
          aria-valuetext={`Step ${now + 1} of ${steps.length}: ${step.text}`}
          className={cn(
            "h-1.5 min-w-0 flex-1 cursor-pointer rounded-full",
            "bg-border-strong accent-accent-amber",
            "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-amber",
          )}
        />
        <span className="shrink-0 text-[0.78rem] tabular-nums text-text-muted">
          {now + 1} / {steps.length}
        </span>
      </div>

      {/* One caption, changing with the frame. `aria-live` so a screen reader
          hears the new instruction when the slider moves. */}
      <p
        aria-live="polite"
        className="min-h-[2.6rem] text-[0.92rem] leading-snug text-foreground"
      >
        <Emphasise text={step.text} strong={step.strong} />
      </p>
    </section>
  );
}

/**
 * The control's name, picked out of the sentence.
 *
 * A plain substring match rather than markup in the copy: these strings are
 * user-facing and get edited, and `dangerouslySetInnerHTML` on a string
 * somebody might one day paste a user's browser name into is not a trade worth
 * making for one bold word.
 */
function Emphasise({ text, strong }: { text: string; strong?: string }) {
  if (!strong) return <>{text}</>;
  const at = text.indexOf(strong);
  if (at < 0) return <>{text}</>;
  // "Tap ⋯" and "Tap ⋮" name a control by drawing it, and at caption size both
  // glyphs all but vanish — the one word carrying the instruction was the least
  // visible thing in the sentence. Symbols get set larger than the text around
  // them; words do not need it.
  const isGlyph = strong.length <= 2 && !/[\p{L}\p{N}]/u.test(strong);
  return (
    <>
      {text.slice(0, at)}
      <b
        className={cn(
          "font-medium text-accent-amber",
          isGlyph && "px-0.5 text-[1.45em] leading-none tracking-[0.08em]",
        )}
      >
        {strong}
      </b>
      {text.slice(at + strong.length)}
    </>
  );
}
