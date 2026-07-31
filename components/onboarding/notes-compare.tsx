"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ArrowsLeftRight } from "@/components/icons";
import { cn } from "@/lib/utils";
import { DATA_MONO } from "@/lib/ui-presets";

/**
 * The Notes-vs-Trackd wipe (Spec 3-01 §9 Screen 0).
 *
 * Two panels stacked in the same box with a draggable divider over them: drag
 * left and you are back in the Notes app, drag right and it is Trackd. The
 * spec asks for a two-position slider; a continuous wipe is the same idea with
 * the seam under the user's thumb, which is what makes the contrast land.
 *
 * Accessible as a real slider: `role="slider"` with arrow-key support, so it is
 * operable without a pointer. The handle is the only interactive element; the
 * panels underneath are inert.
 *
 * **It slides itself until you touch it** (Adrian, 2026-07-31). A static seam
 * asks the user to work out that it is draggable; a moving one shows them both
 * panels and demonstrates the control in the same gesture. It is a one-shot
 * demonstration rather than ambient decoration: the first pointer or key from
 * the user stops it for good and hands the seam over, and it never restarts.
 * Under `prefers-reduced-motion` it never runs at all and simply sits at the
 * midpoint.
 */

/** Where the auto-sweep turns around, and how long a full there-and-back takes. */
const SWEEP_MIN = 28;
const SWEEP_MAX = 72;
const SWEEP_MS = 4200;

const NOTES_LINES = [
  "PROTOCOL",
  "test e 250 mon + thurs??",
  "  - last one 23rd i think",
  "npp 100 eod",
  "  - ran out? check vial",
  "",
  "bac water 2ml -> 5mg vial",
  "  = ??? mcg per unit",
  "",
  "bloods 10/07 - still not booked",
  "left delt last time. or right",
];

const TRACKD_ROWS = [
  { name: "Testosterone Enanthate", left: "6.5 mL", doses: "13 left" },
  { name: "NPP", left: "2.0 mL", doses: "4 left" },
  { name: "Semaglutide", left: "1.4 mL", doses: "7 left" },
  { name: "Vitamin D3", left: "84 tabs", doses: "84 left" },
];

export function NotesCompare() {
  const [position, setPosition] = useState(50);
  const [auto, setAuto] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  // The demonstration sweep. A sine so it eases at both ends instead of
  // ping-ponging, which reads mechanical.
  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const start = performance.now();
    const mid = (SWEEP_MIN + SWEEP_MAX) / 2;
    const amp = (SWEEP_MAX - SWEEP_MIN) / 2;

    const tick = (now: number) => {
      const elapsed = now - start;
      // TWO SWEEPS, then it stops. It used to loop forever, which meant a user
      // who parked on the first screen got a React state update and a re-render
      // of the whole comparison every frame, indefinitely. Two passes is enough
      // to show both panels and that the seam moves.
      if (elapsed >= SWEEP_MS * 2) {
        setPosition(mid);
        setAuto(false);
        return;
      }
      const t = (elapsed % SWEEP_MS) / SWEEP_MS;
      setPosition(mid + amp * Math.sin(t * Math.PI * 2));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto]);

  /** The user has taken over. Never give the sweep back. */
  const takeOver = useCallback(() => setAuto(false), []);

  const setFromClientX = useCallback((clientX: number) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(6, Math.min(94, pct)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    takeOver();
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;
    setFromClientX(e.clientX);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    takeOver();
    const step = e.shiftKey ? 10 : 4;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPosition((p) => Math.max(6, p - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPosition((p) => Math.min(94, p + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPosition(6);
    } else if (e.key === "End") {
      e.preventDefault();
      setPosition(94);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[9px] font-sans uppercase tracking-[0.18em] text-text-subtle">
          Notes app
        </span>
        <span
          id={labelId}
          className="text-[9px] font-sans uppercase tracking-[0.18em] text-text-muted"
        >
          Trackd
        </span>
      </div>

      <div
        ref={boxRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        className="relative h-[21.5rem] w-full touch-none select-none overflow-hidden rounded-2xl bg-bg-base"
      >
        {/* Panel A — the Notes app. Deliberately ugly: monospaced, unaligned,
            question marks where a figure should be. */}
        <div className="absolute inset-0 p-4" aria-hidden>
          <div className="space-y-[3px]">
            {NOTES_LINES.map((line, i) => (
              <p
                key={i}
                className={cn(
                  "font-mono text-[10px] leading-[1.5] text-text-muted",
                  line.startsWith("PROTOCOL") && "text-text-primary",
                  line.trim().startsWith("-") && "text-text-subtle",
                )}
              >
                {line || " "}
              </p>
            ))}
          </div>
        </div>

        {/* Panel B — Trackd. Clipped to the wipe, so it is revealed rather than
            cross-faded: the seam is the point. */}
        <div
          className="absolute inset-0 bg-bg-base"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
          aria-hidden
        >
          <div className="p-4">
            <p className="text-[9px] font-sans uppercase tracking-[0.18em] text-text-muted">
              Stock
            </p>
            <ul className="mt-3 divide-y divide-border-default">
              {TRACKD_ROWS.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                    {row.name}
                  </span>
                  <span className={cn(DATA_MONO, "shrink-0 text-[10px]")}>
                    {row.left}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[9px] font-sans uppercase tracking-[0.18em] text-text-subtle">
              Next dose
            </p>
            <p className="mt-1 font-mono text-lg font-light tabular-nums text-foreground">
              Today <span className="text-[11px] text-text-muted">8:00 pm</span>
            </p>
          </div>
        </div>

        {/* The seam */}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-accent-amber"
          style={{ left: `${position}%` }}
          aria-hidden
        />

        {/* A quiet nudge, only while the sweep is still running. */}
        {auto ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-sans uppercase tracking-[0.18em] text-text-subtle"
          >
            Drag
          </span>
        ) : null}

        {/* The handle. The one amber beat on this screen: it is the live thing. */}
        <button
          type="button"
          role="slider"
          aria-labelledby={labelId}
          aria-label="Drag to compare a Notes app with Trackd"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${Math.round(position)} percent Trackd`}
          onKeyDown={onKeyDown}
          className="absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent-amber text-bg-base shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          style={{ left: `${position}%` }}
        >
          <ArrowsLeftRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
