"use client";

import { useCallback, useEffect, useLayoutEffect, type RefObject } from "react";
import { flushSync } from "react-dom";

/**
 * The markers panel's motion, copied from the final-check page
 * (`~/trakabl-mockups/final-check/r6/`: `round3.js` EASE8 / SPRING8, the bars'
 * spring in `markers8.js`, the sideways swap in `markers7.js`). Transform and
 * opacity only; each start reads where the element is now, so a second tap
 * mid-motion carries on from there.
 */

/** EASE8: the rise of rows, the Add bar and the swap. */
export const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** SPRING8: a ticked chip's pop. */
export const SPRING = "cubic-bezier(0.34, 1.45, 0.64, 1)";

export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Where an element is drawn now (its running animations included), as a keyframe. */
export function currentLook(el: HTMLElement): Keyframe {
  const cs = getComputedStyle(el);
  return { opacity: cs.opacity, transform: cs.transform === "none" ? "none" : cs.transform };
}

/** A chip ticked on pops: .92, 1.04, 1 over 260ms, springy (markers8). */
export function popChip(el: HTMLElement) {
  if (reducedMotion()) return;
  el.animate([{ transform: "scale(0.92)" }, { transform: "scale(1.04)" }, { transform: "none" }], {
    duration: 260,
    easing: SPRING,
  });
}

/**
 * A row taken off the entry leaves the way rows arrive, reversed: a copy of it
 * sinks 8px as it fades (200ms) while the rows under it close the gap. The copy
 * is inert and hidden from assistive tech; it is gone when the fade ends.
 */
export function ghostOut(row: HTMLElement, host: HTMLElement) {
  const r = row.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  const ghost = row.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("data-marker-row");
  ghost.removeAttribute("class");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: "absolute",
    left: `${r.left - h.left}px`,
    top: `${r.top - h.top}px`,
    width: `${r.width}px`,
    margin: "0",
    pointerEvents: "none",
    animation: "none",
  });
  host.appendChild(ghost);
  const reduce = reducedMotion();
  const a = ghost.animate(
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: reduce ? "none" : "translateY(8px)" },
    ],
    { duration: reduce ? 150 : 200, easing: "ease-in", fill: "forwards" },
  );
  const drop = () => ghost.remove();
  a.finished.then(drop, drop);
}

/**
 * THE SIDEWAYS SWAP (markers7): out 120ms, 14px against the direction with a
 * fade; in 240ms from 14px along it. `run(dir, commit)` plays the out, commits
 * the new content, then plays the in, on the element `ref` holds (the same
 * element before and after). Reduced motion: a short fade in only.
 */
export function useSideSwap(ref: RefObject<HTMLElement | null>) {
  return useCallback((dir: 1 | -1, commit: () => void) => {
    const el = ref.current;
    if (!el || reducedMotion()) {
      commit();
      if (el) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
      return;
    }
    const from = currentLook(el);
    el.getAnimations().forEach((a) => a.cancel());
    const out = el.animate([from, { opacity: 0, transform: `translateX(${-dir * 14}px)` }], {
      duration: 120,
      easing: "ease-in",
      fill: "forwards",
    });
    out.finished
      .then(() => {
        flushSync(commit);
        const now = ref.current;
        if (!now) return;
        now.getAnimations().forEach((a) => a.cancel());
        now.animate(
          [
            { opacity: 0, transform: `translateX(${dir * 14}px)` },
            { opacity: 1, transform: "none" },
          ],
          { duration: 240, easing: EASE },
        );
      })
      .catch(() => {
        // Cancelled by a newer swap, which carries on from here.
      });
  }, [ref]);
}

/**
 * The panel's own CSS. Hoisted into <head> once by React (`href` dedupes it).
 * Values from markers8.js / markers7.js / extra8.css.
 */
export const MARKERS_CSS = `
@keyframes md-rise { from { opacity: 0; transform: translateY(8px); } }
@keyframes md-fade { from { opacity: 0; } }
@keyframes md-word { from { opacity: 0.3; transform: translateY(4px); } }
.md-row-in { animation: md-rise 320ms ${EASE} both; }
.md-word-in { animation: md-word 200ms ${EASE} both; }
.md-chip.inst-ghost, .md-chip.inst-thumb { border-radius: var(--r-sm); }
.md-chip.inst-ghost[data-editing="true"] { box-shadow: inset 0 0 0 1px var(--border-strong); }
.md-search:focus-within { box-shadow: inset 0 0 0 1.2px var(--text-muted); }
.md-bar { transition: transform 250ms cubic-bezier(0.34, 1.5, 0.64, 1); }
.md-bar > i, .md-fade { transition: opacity 180ms ease; }
@media (prefers-reduced-motion: reduce) {
  .md-row-in { animation: md-fade 200ms ease-out both; }
  .md-word-in { animation: none; }
  .md-bar { transition: none; }
}
`;
