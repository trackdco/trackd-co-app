"use client";

import { useEffect, useRef, useState } from "react";

/** Matches `.container-fill`'s 400ms in `globals.css`, and the ~400ms the
 *  METRIC_VALUE count-up uses. One tempo for "a number resolving". */
export const FILL_EASE_MS = 400;

/**
 * Ease a container's fill toward its target instead of jumping to it.
 *
 * `.container-fill` already transitions the VIAL, because its liquid is a
 * `<rect>` and `y`/`height` are CSS-animatable SVG geometry. Neither of the
 * other two containers can be done that way: a tub's powder is a `<path d>`
 * (not reliably animatable outside Chromium) and a bottle's contents are
 * DISCRETE tablets that appear and disappear. Easing the NUMBER covers all
 * three, because every container derives its artwork from it.
 *
 * **Changes only.** The first value it is handed is adopted outright: opening
 * a tab and watching every card fill from empty is decoration, and the point is
 * to show a level CHANGING — stock added, a dose logged. `undefined` passes
 * through untouched so the illustrative fallback still means "no figure".
 *
 * Instant under `prefers-reduced-motion`, per `ui-context.md` → Motion.
 *
 * The in-flight value is the ONLY thing held in state, and it is written from
 * inside a rAF callback rather than from the effect body. Every "no animation"
 * path simply returns and lets `target` fall through — a `setState` in an effect
 * to say "use the value you were already given" is both a wasted render and the
 * thing `react-hooks/set-state-in-effect` exists to stop.
 */
export function useAnimatedFill(
  target: number | undefined,
  durationMs: number = FILL_EASE_MS,
): number | undefined {
  /** The eased value while an animation is running; `undefined` when none is. */
  const [eased, setEased] = useState<number | undefined>(undefined);
  /** Where the fill actually IS — the last target, or wherever a still-running
   *  animation has reached, so a retarget mid-flight starts from there rather
   *  than snapping back. */
  const currentRef = useRef(target);

  useEffect(() => {
    const from = currentRef.current;
    currentRef.current = target;
    // Nothing to ease between: no previous number, no new one, or no change.
    if (target === undefined || from === undefined || from === target) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || durationMs <= 0) return;

    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic — fast off the mark, settling into the final level, the
      // same shape every `animate-*` class in the app uses.
      const next = from + (target - from) * (1 - Math.pow(1 - t, 3));
      currentRef.current = t < 1 ? next : target;
      setEased(t < 1 ? next : undefined);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // Cancel ONLY. Clearing `eased` here would paint one frame at the new target
    // before the replacement animation's first rAF fires — a visible pop on
    // every retarget, which is exactly when the eye is on it. The stale value is
    // harmless: the new animation overwrites it on its first frame, and a
    // completed one already cleared itself at `t >= 1`.
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  // `target === undefined` means "no figure", and must not be masked by a value
  // left over from an animation that was interrupted on its way somewhere.
  return target === undefined ? undefined : (eased ?? target);
}
