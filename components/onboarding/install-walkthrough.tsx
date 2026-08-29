"use client";

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
 * A three-line text list is fine if you already know roughly where the control
 * is. It is not fine for the person this step exists for, who is looking at a
 * menu they have never opened and cannot find the row we are naming.
 *
 * ## THE WHOLE PHONE, IN ONE FRAME (Adrian, 2026-08-29)
 *
 * Built three times before this landed. A row of cards was wrong: it puts three
 * half-steps on screen and invites comparing them, when what is being taught is
 * a sequence. Cropping to the control was wrong too, and that one was my
 * reasoning rather than his — I shrank the frame to keep menu text legible and
 * lost the thing that made the video work, which is that you are watching YOUR
 * phone do this. He asked for the device back, full screen, one frame, sliding.
 *
 * So: one phone, every step passing through it. The frame stays put and only
 * its contents change, which is what makes it read as a device being operated
 * rather than a gallery being paged.
 *
 * The slide is native scroll-snap, so a thumb-drag gets the platform's own
 * momentum and rubber-banding, and the slider scrolls the same box.
 *
 * ## Two decisions worth knowing
 *
 * **Frames are images, not DOM.** `app-carousel.tsx` already ships captures out
 * of the `/preview/*` harness for the same reason, and the same warning
 * applies: **re-render when the drawn screens change** or this goes stale. The
 * alternative was every browser's chrome copied into production JSX, and it
 * would be the copy that drifts.
 *
 * **Everything dims except the control.** Each frame punches the row you need
 * back to full brightness through the dim and rings it, so there is exactly one
 * lit thing on a screen otherwise full of menu items.
 *
 * The caption is real text below the frame, not burned into the image, so it is
 * screen-readable and editable without re-rendering anything.
 */
export function InstallWalkthrough({ device }: { device: DeviceGuess }) {
  const flow = installFlowId(device);
  const steps = flow ? INSTALL_WALKTHROUGH[flow] : null;
  const railRef = useRef<HTMLDivElement>(null);
  const attachRail = useCallback((node: HTMLDivElement | null) => {
    railRef.current = node;
    if (!node) return;
    node.scrollLeft = 0;
    // The lazy frames settle after first paint and can carry the offset with
    // them, so it is pinned again on the next frame and once more when the
    // first image has actually decoded.
    requestAnimationFrame(() => { node.scrollLeft = 0; });
    const first = node.querySelector("img");
    if (first && !first.complete) {
      first.addEventListener("load", () => { node.scrollLeft = 0; }, { once: true });
    }
  }, []);
  const [at, setAt] = useState(0);

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
  // leaving someone on "step 4 of 3". Adjusted during render, not in an effect,
  // which would show the new frames under the old index for one paint.
  const [shownFlow, setShownFlow] = useState(flow);
  if (flow !== shownFlow) {
    setShownFlow(flow);
    setAt(0);
  }

  if (!steps || !flow) return null;

  const last = steps.length - 1;
  const now = Math.min(at, last);
  const step = steps[now];
  const pct = last ? (now / last) * 100 : 0;

  return (
    <section aria-label="How to add Trackd, step by step" className="space-y-4">
      {/* ONE phone. Every step passes through this same frame. */}
      <div
        key={flow}
        ref={attachRail}
        onScroll={onScroll}
        className={cn(
          "flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain",
          "rounded-[34px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {steps.map((s, i) => (
          // The wrapper carries the snap width; the image keeps its own
          // proportions inside it. A bare <img> as a flex child gets stretched
          // to the row's cross-size, which silently squashed the phone.
          <div key={s.text} className="flex w-full shrink-0 snap-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element --
                A plain <img> on purpose. These are already WebP at exactly the
                size they render, so the optimiser adds nothing — and with an
                auto width it cannot infer a layout size, emitting widths the
                endpoint then rejects with a 400. */}
            <img
              src={`/onboarding/install/${flow}/${String(i + 1).padStart(2, "0")}.webp`}
              alt={s.text}
              width={750}
              height={1625}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className="block h-auto max-h-[54vh] w-auto rounded-[30px]"
            />
          </div>
        ))}
      </div>

      <p aria-live="polite" className="min-h-[2.6rem] text-center text-[0.95rem] leading-snug">
        <Emphasise text={step.text} strong={step.strong} />
      </p>

      {/* The scrubber. Ticks for every step and a filled track, so the length of
          the thing and how far in you are are both visible without counting. */}
      <div className="space-y-2">
        <div className="relative h-6">
          <div className="pointer-events-none absolute inset-x-1 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-bg-surface-raised" />
          <div
            className="pointer-events-none absolute top-1/2 left-1 h-1.5 -translate-y-1/2 rounded-full bg-accent-amber transition-[width] duration-200"
            style={{ width: `calc(${pct}% - ${pct * 0.02}px)` }}
          />
          <div className="pointer-events-none absolute inset-x-1 top-1/2 flex -translate-y-1/2 justify-between">
            {steps.map((s, i) => (
              <span
                key={s.text}
                className={cn(
                  "size-1.5 rounded-full",
                  i <= now ? "bg-accent-amber" : "bg-border-strong",
                )}
              />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={now}
            onChange={(e) => go(Number(e.target.value))}
            aria-label="Step"
            aria-valuetext={`Step ${now + 1} of ${steps.length}: ${step.text}`}
            className="absolute inset-0 h-full w-full cursor-grab appearance-none bg-transparent accent-accent-amber active:cursor-grabbing focus-visible:outline-none [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-bg-base [&::-moz-range-thumb]:bg-accent-amber [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg-base [&::-webkit-slider-thumb]:bg-accent-amber [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(0,0,0,.5)]"
          />
        </div>
        <p className="text-center text-[0.78rem] text-text-subtle">
          {now === last
            ? `Step ${now + 1} of ${steps.length}`
            : `Step ${now + 1} of ${steps.length} \u00b7 drag to move through`}
        </p>
      </div>
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
