"use client";

import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import { CrossGlyph } from "@/components/progress/markers/glyphs";
import type { MarkerOption } from "@/lib/progress/journal";
import { keyStep, stepAt, stepLook, tapStep } from "@/lib/progress/markerPick";
import { PRESS } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/** The steps' reach: 8px above and below the 22px bars (rows sit 16px apart,
 *  so two rows' reaches never overlap). */
const STEPS_REACH = "relative before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']";
/** The x's reach: 10px round the 24px square, 44 in all. */
const X_REACH = "relative before:absolute before:-inset-[10px] before:content-['']";

/**
 * ONE MARKER ON THE ENTRY (markers8): its name (a muted "yours" after one of
 * your own) and the level word on a top line padded to the x's column, then the
 * steps and the x. The word is white once rated, a muted "Not rated" before,
 * and pops up 4px as it changes.
 */
export function MarkerRow({
  marker,
  value,
  bump,
  arriveDelay,
  onRate,
  onRemove,
}: {
  marker: MarkerOption;
  /** The rating, 1-based; 0 = not rated. */
  value: number;
  /** Bumps when the word changes, so it pops in. */
  bump: number;
  /** Set when the row has just been added: its place in the one-by-one arrival (ms). */
  arriveDelay?: number;
  onRate: (value: number) => void;
  onRemove: () => void;
}) {
  const word = value >= 1 ? marker.tierLabels[value - 1] : undefined;
  return (
    <div
      data-marker-row={marker.id}
      className={cn(arriveDelay !== undefined && "md-row-in")}
      style={arriveDelay ? { animationDelay: `${arriveDelay}ms` } : undefined}
    >
      <div className="mb-[7px] flex items-baseline justify-between gap-3 pr-[34px] text-[12px] leading-[1.3]">
        <span className="min-w-0 truncate text-foreground">
          {marker.name}
          {marker.kind === "custom" ? <span className="text-[10px] text-text-muted"> yours</span> : null}
        </span>
        <span
          key={bump}
          className={cn("shrink-0", word ? "text-foreground" : "text-text-muted", bump > 0 && "md-word-in")}
        >
          {word ?? "Not rated"}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <MarkerSteps name={marker.name} words={marker.tierLabels} value={value} onRate={onRate} />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${marker.name}`}
          className={cn(PRESS.pill, X_REACH, "shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring")}
        >
          {/* Raised grey at 45% (markers8), the x in the text colour. */}
          <span className="grid h-6 w-6 place-items-center rounded-sm bg-bg-surface-raised text-foreground opacity-45 transition-opacity hover:opacity-70">
            <CrossGlyph />
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * THE STEPS: one bar per word (five for the catalogue), 22px tall, radius 7,
 * 4px apart. Empty bars are raised grey; rated bars fill white up to the
 * rating on a brightness ramp, the chosen one full and enlarged (stepLook).
 *
 * Drag across them or tap one; tapping the chosen bar again clears it. A drag
 * starts once the finger has moved sideways, so a vertical swipe that begins on
 * the bars still scrolls the page and never rates by accident. To assistive
 * tech it is a slider from "Not rated" to the top word: arrow keys step, Home
 * clears, End goes to the top, Delete clears.
 */
function MarkerSteps({
  name,
  words,
  value,
  onRate,
}: {
  name: string;
  words: string[];
  value: number;
  onRate: (value: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; engaged: boolean; last: number } | null>(null);
  const swallowUntil = useRef(0);
  const n = words.length;

  const at = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? stepAt(clientX, r.left, r.width, n) : 0;
  };

  const endDrag = () => {
    if (drag.current?.engaged) swallowUntil.current = performance.now() + 350;
    drag.current = null;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, engaged: false, last: value };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (e.pointerType === "mouse" && (e.buttons & 1) === 0) {
      drag.current = null;
      return;
    }
    if (!d.engaged) {
      const dx = Math.abs(e.clientX - d.x);
      const dy = Math.abs(e.clientY - d.y);
      if (dy > 10 && dy > dx) {
        drag.current = null; // a scroll, not a drag
        return;
      }
      if (dx < 6 || dx < dy) return;
      d.engaged = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // The pointer has already gone; the drag ends with it.
      }
    }
    const v = at(e.clientX);
    if (v >= 1 && v !== d.last) {
      d.last = v;
      onRate(v);
    }
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    // The click that ends a drag is not a tap: it must not clear the step.
    if (performance.now() < swallowUntil.current) return;
    const v = at(e.clientX);
    if (v >= 1) onRate(tapStep(value, v));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = keyStep(value, e.key, n);
    if (next === null) return;
    e.preventDefault();
    if (next !== value) onRate(next);
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={name}
      aria-valuemin={0}
      aria-valuemax={n}
      aria-valuenow={value}
      aria-valuetext={value >= 1 ? words[value - 1] : "Not rated"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        STEPS_REACH,
        "flex min-w-0 flex-1 cursor-pointer touch-pan-y select-none gap-1 rounded-[7px] outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ring",
      )}
    >
      {words.map((w, i) => {
        const look = stepLook(i, value);
        return (
          <span
            key={`${i}-${w}`}
            aria-hidden
            className="md-bar relative block h-[22px] min-w-0 flex-1 rounded-[7px]"
            style={look.scale !== 1 ? { transform: `scale(${look.scale})` } : undefined}
          >
            <i
              className="absolute inset-0 rounded-[inherit] bg-bg-surface-raised"
              style={{ opacity: look.filled ? 0 : 1 }}
            />
            <i className="absolute inset-0 rounded-[inherit] bg-text-primary" style={{ opacity: look.opacity }} />
          </span>
        );
      })}
    </div>
  );
}
