"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { CaretLeft, CaretRight } from "@/components/icons";

import { cn } from "@/lib/utils";
import {
  WEEKDAY_INITIALS,
  addMonths,
  buildMonthMatrix,
  monthTitle,
} from "@/lib/calendar/calendar";
import { dateKeyToDate, type DateKey } from "@/lib/home/mockHomeData";
import { CARD_EYEBROW } from "@/lib/ui-presets";

/** The disc's pop, then long enough to watch it land before the step closes. */
const POP_MS = 260;
const HOLD_MS = 200;
/** "Today" from another month: travel first, land after. */
const TRAVEL_MS = 160;

function reduceMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}

function monthOf(key: DateKey): { year: number; month0: number } {
  const d = dateKeyToDate(key);
  return { year: d.getFullYear(), month0: d.getMonth() };
}

/**
 * A MONTH, TO PICK A PAST DAY WITH — the calendar step inside a sheet.
 *
 * Adrian chose this shape from a four-variant prototype on 2026-09-11 ("do A but
 * add animations"), after a screenshot of another app's picker: the date is the
 * sheet's title, and tapping it pushes the sheet across to this. Built
 * 2026-09-12 for `AddProgressPhotoSheet`.
 *
 * ## Nothing here is new maths or new motion
 *
 * The cells, the Mon-first order and the fixed six rows are `buildMonthMatrix`,
 * the same function the Calendar screen's grid runs on, so a month cannot be
 * laid out one way here and another way there. The ring treatment is
 * `MonthGrid`'s, minus the adherence states — this picker answers "which day",
 * not "what happened on it".
 *
 * Stepping a month is the Schedule's WEEK PARALLAX, reused by class rather than
 * re-specified: `animate-schedule-back` / `animate-schedule-forward` with the
 * far layer (`schedule-dayhead`, 26px / 220ms) and the near layer
 * (`schedule-group`, 10px / 190ms). The names say "schedule" because that is
 * where the numbers were chosen (Adrian, 2026-09-03, over a flat slide and a
 * crossfade); copying them under new names is how two timings drift apart.
 *
 * ## The two rules that are load-bearing
 *
 * 1. **A photo cannot be dated tomorrow.** Future days are `disabled` and the
 *    next-month arrow stops at this month. The `<input type="date">` this
 *    replaced carried `max={todayKey}`, and losing that on the way across would
 *    be a silent regression, not a visual one.
 * 2. **`onSettled` fires after the pop, not with it.** The parent closes the
 *    step on it, so shortening this to zero would yank the calendar away before
 *    the day you tapped had visibly filled. Under `prefers-reduced-motion` it
 *    IS zero, deliberately: no animation to wait for.
 */
export function DatePickerPanel({
  value,
  todayKey,
  active,
  onPick,
  onSettled,
  className,
}: {
  /** The chosen day. */
  value: DateKey;
  /** Today, from the caller's timezone-resolved key — never `new Date()` here. */
  todayKey: DateKey;
  /** True while this is the visible step: re-anchors the month on the way in. */
  active: boolean;
  /** Fires the moment a day is chosen, before the beat that follows it. */
  onPick: (key: DateKey) => void;
  /** Fires once the disc has popped and held. */
  onSettled?: () => void;
  className?: string;
}) {
  const [view, setView] = useState(() => monthOf(value));
  const [travel, setTravel] = useState<{ dir: "back" | "forward"; n: number } | null>(
    null,
  );
  /** The day mid-pop. Cleared after, so picking the same day twice replays it. */
  const [popKey, setPopKey] = useState<DateKey | null>(null);

  const animRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);

  const after = (ms: number, fn: () => void) => {
    if (ms <= 0 || reduceMotion()) {
      fn();
      return;
    }
    timers.current.push(window.setTimeout(fn, ms));
  };

  // A pick in flight holds two timers. Leaving them to fire after the sheet has
  // gone would call the parent's `onSettled` on an unmounted tree.
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  /**
   * Entering the step lands you on the chosen day's month, wherever you had
   * browsed to last time.
   *
   * ⚠️ ON THE WAY IN ONLY, and not whenever `value` changes. Following `value`
   * would re-anchor the month the instant a day is chosen, which is fine for
   * every day except a SPILL day — tap 1 October from September's trailing row
   * and the grid would rebuild around October while that disc was still
   * popping, so the beat you tapped would vanish under you. React's own
   * adjust-state-on-prop-change idiom (also how this sheet resets itself on
   * open), not an effect, because an effect here renders twice.
   */
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setView(monthOf(value));
  }

  /**
   * Replay the parallax WITHOUT remounting the grid — remove the class, force a
   * reflow, add it back. `key={n}` would rebuild all 42 cells to restart an
   * animation, which is the mistake `ScheduleWeeks` already documents.
   */
  useLayoutEffect(() => {
    const el = animRef.current;
    if (!el || !travel || reduceMotion()) return;
    const cls = travel.dir === "back" ? "animate-schedule-back" : "animate-schedule-forward";
    el.classList.remove("animate-schedule-back", "animate-schedule-forward");
    void el.offsetWidth;
    el.classList.add(cls);
  }, [travel]);

  const cells = useMemo(
    () => buildMonthMatrix(view.year, view.month0),
    [view.year, view.month0],
  );

  const today = monthOf(todayKey);
  const atLatestMonth =
    view.year > today.year || (view.year === today.year && view.month0 >= today.month0);
  const todayDisabled = value === todayKey && view.year === today.year && view.month0 === today.month0;

  function step(delta: 1 | -1) {
    setView((v) => addMonths(v.year, v.month0, delta));
    setTravel((t) => ({ dir: delta < 0 ? "back" : "forward", n: (t?.n ?? 0) + 1 }));
  }

  function choose(key: DateKey) {
    if (busy.current) return;
    busy.current = true;
    setPopKey(key);
    onPick(key);
    after(POP_MS + HOLD_MS, () => {
      setPopKey(null);
      busy.current = false;
      onSettled?.();
    });
  }

  /** Today from another month TRAVELS there first, so you see where you were
   *  taken rather than arriving by teleport. */
  function goToday() {
    if (busy.current) return;
    if (view.year !== today.year || view.month0 !== today.month0) {
      const back = today.year * 12 + today.month0 < view.year * 12 + view.month0;
      setView(today);
      setTravel((t) => ({ dir: back ? "back" : "forward", n: (t?.n ?? 0) + 1 }));
      busy.current = true;
      after(TRAVEL_MS, () => {
        busy.current = false;
        choose(todayKey);
      });
      return;
    }
    choose(todayKey);
  }

  return (
    <div className={className}>
      <div ref={animRef}>
        <div className="schedule-dayhead flex items-center justify-between pb-2">
          <span className="text-base font-light tracking-[-0.02em] text-foreground">
            {monthTitle(view.year, view.month0)}
          </span>
          <span className="flex items-center gap-1">
            <StepButton label="Previous month" onClick={() => step(-1)}>
              <CaretLeft className="h-4 w-4" aria-hidden />
            </StepButton>
            <StepButton label="Next month" onClick={() => step(1)} disabled={atLatestMonth}>
              <CaretRight className="h-4 w-4" aria-hidden />
            </StepButton>
          </span>
        </div>

        <div className="grid grid-cols-7 pb-1.5" aria-hidden>
          {WEEKDAY_INITIALS.map((d, i) => (
            <span
              key={i}
              className="text-center text-[11px] font-medium uppercase tracking-wide text-text-muted"
            >
              {d}
            </span>
          ))}
        </div>

        <div className="schedule-group grid grid-cols-7 gap-y-1">
          {cells.map((cell) => {
            const future = cell.key > todayKey;
            const selected = cell.key === value;
            return (
              <button
                key={cell.key}
                type="button"
                disabled={future}
                onClick={() => choose(cell.key)}
                aria-pressed={selected}
                aria-label={cell.date.toDateString()}
                className="flex justify-center py-0.5 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-accent-amber/50 disabled:cursor-default"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm transition-colors",
                    selected
                      ? "bg-accent-primary font-medium text-bg-base"
                      : "text-text-muted",
                    !selected && cell.key === todayKey && "text-foreground ring-1 ring-border-strong",
                    !cell.inMonth && "opacity-40",
                    future && "opacity-25",
                    popKey === cell.key && "animate-date-pop",
                  )}
                >
                  {cell.date.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex justify-center hairline-t pt-1">
        <button
          type="button"
          onClick={goToday}
          disabled={todayDisabled}
          className={cn(
            CARD_EYEBROW,
            "min-h-11 rounded-md px-4 outline-none transition-colors hover:text-foreground",
            "focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface",
            "disabled:cursor-default disabled:opacity-40 disabled:hover:text-text-muted",
          )}
        >
          Today
        </button>
      </div>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full text-text-muted outline-none transition-colors",
        "hover:bg-bg-input hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-amber/50",
        "disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-muted",
      )}
    >
      {children}
    </button>
  );
}
