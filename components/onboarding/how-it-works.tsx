"use client";

import { useEffect, useRef, useState } from "react";

import { FLOW_DISPLAY } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * "Here's how it works." — the beat between the celebrate screen and the demo
 * (Adrian, 2026-08-27).
 *
 * ## It is an OVERLAY, not a step, and that was a decision
 *
 * It has no `StepId`, no `?step=`, and no slot in `STEP_ORDER`. Three reasons,
 * all of which a real step would have got wrong:
 *
 *   - It leaves on a timer. A deep link to a screen that removes itself 2.6s
 *     after you arrive is a broken link, and `resolveStepId` accepts anything
 *     in the step order.
 *   - The progress rail counts steps. Adding one would shift every percentage
 *     after celebrate and make the flow read a screen longer, for something
 *     that is a transition rather than a screen.
 *   - Back. `prevStep` would walk a user backwards INTO a screen that
 *     immediately throws them forward again, which is a trap, not a history.
 *
 * So it lives inside the celebrate screen, over the top of it, and calls
 * `onDone` when it is finished. The step machinery never learns it exists.
 *
 * ## Why the button underneath it does not say this
 *
 * The CTA said "Show me how it works" for exactly one round before Adrian
 * caught it: a button saying that, followed instantly by a screen saying
 * "Here's how it works.", is the same sentence twice. The button is a plain
 * forward action and this carries the line.
 *
 * ## The timings are measured, not guessed
 *
 * It shipped too slow, then too fast. What fixed it was not only duration but
 * the CURVE: on the house `--motion-ease` (a fast-out curve) a 200ms fade reads
 * as a snap. These use a symmetric ease-in-out, and the rings glide over 2.6s
 * rather than pinging over 1.5s.
 */

/** How long the line holds at full strength before it begins to leave. */
const HOLD_MS = 1700;
/** The fade out, which is also what a tap skips TO — never a hard cut. */
const OUT_MS = 460;
/** The line needs to have arrived before the hold clock is meaningful. */
const IN_MS = 900;

export function HowItWorks({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Guards `onDone` against a tap that lands in the same tick as the timer. */
  const finished = useRef(false);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    /**
     * ⚠️ REDUCED MOTION SKIPS THE WHOLE THING, it does not play it stripped.
     *
     * There is nothing here but motion — a line, a glow and three rings. With
     * the animation removed it is a static sentence on a black field that
     * disappears on a timer, which is worse than not showing it: the user gets
     * an unexplained pause instead of a transition. So it hands straight over.
     */
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      return;
    }

    timers.current.push(setTimeout(() => setLeaving(true), IN_MS + HOLD_MS));
    timers.current.push(
      setTimeout(() => {
        finished.current = true;
        onDone();
      }, IN_MS + HOLD_MS + OUT_MS),
    );

    return clear;
    // `onDone` is `goNext`, which is stable for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * A tap cuts the hold short and runs the FADE-OUT — it does not jump to the
   * demo. Skipping straight to the next screen reads as a glitch; the same
   * dissolve, started early, reads as a skip (Adrian, 2026-08-27).
   */
  const skip = () => {
    if (finished.current || leaving) return;
    clear();
    setLeaving(true);
    timers.current.push(
      setTimeout(() => {
        finished.current = true;
        onDone();
      }, OUT_MS),
    );
  };

  return (
    <div
      // Not a `button`: it covers the whole screen, and a full-bleed button is
      // announced as one enormous control. It is a decorative transition with a
      // skip affordance, so the role is presentational and the keyboard path is
      // the Escape/Enter handler below.
      role="presentation"
      onClick={skip}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") skip();
      }}
      tabIndex={0}
      className={cn(
        "absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center",
        "bg-bg-base transition-opacity duration-[var(--motion-slow)] ease-[cubic-bezier(0.4,0,0.2,1)]",
        "focus-visible:outline-none",
        leaving ? "opacity-0" : "opacity-100",
      )}
    >
      {/* A warm swell, so the canvas is LIT rather than merely black. Without
          it the rings read as grey circles on a void — which is what the first
          pass looked like, and why it was rejected. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[50px]",
          "bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent-amber)_42%,transparent),transparent_68%)]",
          "transition-[opacity,transform] duration-[2600ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
          leaving ? "scale-110 opacity-0" : "scale-100 opacity-50",
        )}
      />

      {/* Three rings, staggered, each a one-shot. */}
      {!leaving
        ? [0, 480, 960].map((d) => (
            <span
              key={d}
              aria-hidden
              className="animate-hero-ring pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[300px] rounded-full border border-[color-mix(in_srgb,var(--accent-amber)_55%,transparent)]"
              style={{ animationDelay: `${d}ms` }}
            />
          ))
        : null}

      <p
        className={cn(
          FLOW_DISPLAY,
          "relative px-5 text-center font-medium",
          "transition-[opacity,filter,transform] ease-[cubic-bezier(0.4,0,0.2,1)]",
          leaving
            ? "scale-[0.992] opacity-0 blur-[7px] duration-[460ms]"
            : "animate-hero-line scale-100 opacity-100 blur-0 duration-[900ms]",
        )}
      >
        Here&apos;s how it works.
      </p>

      <p
        aria-hidden
        className={cn(
          "absolute bottom-[max(1.6rem,env(safe-area-inset-bottom))] font-mono text-[10px] uppercase tracking-[0.16em] text-text-subtle",
          "transition-opacity duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]",
          leaving ? "opacity-0" : "opacity-100 delay-[1100ms]",
        )}
      >
        Tap to skip
      </p>
    </div>
  );
}
