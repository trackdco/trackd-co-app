"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { CaretDown, CaretLeft } from "@/components/icons";

import { cn } from "@/lib/utils";
import { DatePickerPanel } from "@/components/calendar/DatePickerPanel";
import { formatDateKeyNumeric } from "@/lib/calendar/calendar";
import { CARD_EYEBROW, PRESS } from "@/lib/ui-presets";

/** Both steps sit in one box, one on top of the other. Absolute, so the one on
 *  its way out stops holding the box open behind it. */
const STEP_PANE =
  "absolute inset-x-0 top-0 px-6 transition-[transform,opacity] " +
  "duration-[var(--motion-slow)] ease-motion motion-reduce:transition-none";

/**
 * A SHEET WHOSE DATE IS ITS TITLE, with the month a step away.
 *
 * Adrian, 2026-09-11 from a four-variant prototype ("do A but add animations"),
 * built for the photo sheet on 2026-09-12 and asked for on the weight sheet the
 * same day: "can you do the same calendar thing for weight too?".
 *
 * ## Why this is a component and not a second copy
 *
 * The weight sheet already carries the scar of the alternative. Its
 * drag-to-dismiss was a hand-copied version of `useSheetDrag` that dropped one
 * line, and the sheet jumped back up against your finger for months before
 * anybody caught it. Two copies of a mechanism drift; the ONE that both sheets
 * call cannot.
 *
 * The caller owns `step` rather than this owning it, because the sheet around
 * it needs the same answer: Escape has to unwind the calendar before it closes
 * the sheet, and the primary button has to go quiet while the calendar is up.
 *
 * ## The three things that break silently
 *
 * 1. **The panes are held in STATE, not a ref.** Radix mounts this into a
 *    portal, and a `useRef` does not re-run the measure when the node finally
 *    arrives — so the measure ran against `null`, the box kept `height: auto`,
 *    and a box whose children are all absolutely positioned computes that as
 *    ZERO. The sheet opened with its header and its footer and nothing between.
 * 2. **`overflow-hidden` on the box is load-bearing.** Without it the step
 *    sliding out widens the scroll parent, and the sheet gains a horizontal
 *    scrollbar for the length of the transition.
 * 3. **The hidden step is `inert`.** A control you cannot see must not be
 *    tabbable — the same pairing as `DropUp`.
 */
export function SheetDateSteps({
  label,
  value,
  onChange,
  todayKey,
  step,
  onStepChange,
  children,
  min,
  max,
}: {
  /** The eyebrow under the date: what this sheet is, in two or three words. */
  label: string;
  /** The chosen date key (`YYYY-MM-DD`). */
  value: string;
  onChange: (key: string) => void;
  /** Today, from the DEVICE clock — the server's is UTC and a day out east. */
  todayKey: string;
  /** True while the calendar is showing. Owned by the caller: see above. */
  step: boolean;
  onStepChange: (open: boolean) => void;
  /** The sheet's real job — the step the date sits above. */
  children: ReactNode;
  /** The first day the calendar offers (inclusive). Omitted: no limit. */
  min?: string | null;
  /** The last day it offers (inclusive). Omitted: TODAY, as both sheets that
   *  log a day need; `null` opens the future. */
  max?: string | null;
}) {
  const dateValueRef = useRef<HTMLSpanElement>(null);
  /** Whether the day just picked was a different one: the title only beats when
   *  something actually changed. */
  const changed = useRef(false);
  const [primaryPane, setPrimaryPane] = useState<HTMLDivElement | null>(null);
  const [calPane, setCalPane] = useState<HTMLDivElement | null>(null);
  const [stepHeight, setStepHeight] = useState<number>();

  /**
   * The box takes the height of whichever step is showing, so the sheet EASES
   * to fit the calendar instead of jumping to it.
   *
   * A `ResizeObserver` rather than a one-off measure: the primary step grows and
   * shrinks on its own (a drop-up opening, a pose picker, an error line), and a
   * height measured once would clip all three. It watches the ACTIVE pane only,
   * whose height is content-driven and independent of the box's, so there is no
   * loop to fall into.
   */
  useLayoutEffect(() => {
    const pane = step ? calPane : primaryPane;
    if (!pane) return;
    const sync = () => setStepHeight(pane.offsetHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(pane);
    return () => ro.disconnect();
  }, [step, primaryPane, calPane]);

  function handlePick(key: string) {
    changed.current = key !== value;
    onChange(key);
  }

  /** The calendar has had its beat: step back, and let the new date arrive in
   *  the title. Restarted by class, not by `key` — see `globals.css`. */
  function handleSettled() {
    onStepChange(false);
    const el = dateValueRef.current;
    if (!el || !changed.current) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.remove("animate-date-value");
    void el.offsetWidth;
    el.classList.add("animate-date-value");
  }

  return (
    <>
      {/* Two layers in one slot, crossfading past each other in the direction of
          travel, so the header moves WITH the step rather than being swapped
          under it. */}
      <div className="relative h-[4.125rem] shrink-0 px-6">
        <div
          inert={step}
          className={cn(
            "absolute inset-x-0 top-0 flex flex-col items-center transition-[transform,opacity] duration-[var(--motion-slow)] ease-motion motion-reduce:transition-none",
            step && "pointer-events-none -translate-x-[26px] opacity-0",
          )}
        >
          <button
            type="button"
            onClick={() => onStepChange(true)}
            aria-expanded={step}
            aria-label={`Change the date. Currently ${formatDateKeyNumeric(value)}`}
            className={cn(
              PRESS.field,
              "flex min-h-11 items-center gap-2 rounded-xl px-3 outline-none transition-colors hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent-amber/50",
            )}
          >
            <span
              ref={dateValueRef}
              className="font-mono text-[17px] tracking-[-0.01em] text-foreground"
            >
              {formatDateKeyNumeric(value)}
            </span>
            <CaretDown className="h-3.5 w-3.5 text-text-subtle" aria-hidden />
          </button>
          <span className={cn(CARD_EYEBROW, "-mt-0.5")}>{label}</span>
        </div>

        <div
          inert={!step}
          className={cn(
            "absolute inset-0 flex items-center px-6 transition-[transform,opacity] duration-[var(--motion-slow)] ease-motion motion-reduce:transition-none",
            !step && "pointer-events-none translate-x-[26px] opacity-0",
          )}
        >
          <button
            type="button"
            onClick={() => onStepChange(false)}
            className="-ml-2 flex min-h-11 items-center gap-1 rounded-xl pr-3 pl-2 text-sm text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-amber/50"
          >
            <CaretLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
          <span className={cn(CARD_EYEBROW, "ml-auto")}>Select date</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div
          style={{ height: stepHeight }}
          className="relative overflow-hidden transition-[height] duration-[var(--motion-slow)] ease-motion motion-reduce:transition-none"
        >
          <div
            ref={setPrimaryPane}
            inert={step}
            className={cn(STEP_PANE, step && "pointer-events-none -translate-x-[30%] opacity-0")}
          >
            {children}
          </div>

          <div
            ref={setCalPane}
            inert={!step}
            className={cn(STEP_PANE, !step && "pointer-events-none translate-x-full opacity-0")}
          >
            <DatePickerPanel
              value={value}
              todayKey={todayKey}
              min={min}
              max={max}
              active={step}
              onPick={handlePick}
              onSettled={handleSettled}
            />
            <div className="h-2" />
          </div>
        </div>
      </div>
    </>
  );
}
