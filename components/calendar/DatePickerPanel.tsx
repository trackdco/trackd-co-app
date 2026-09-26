"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { CaretDown, CaretLeft, CaretRight } from "@/components/icons";

import { cn } from "@/lib/utils";
import {
  WEEKDAY_INITIALS,
  addMonths,
  anchorDay,
  buildMonthMatrix,
  canGoToday,
  canStepMonth,
  dayAccessibleName,
  dayMoveForKey,
  isDayOutside,
  isMonthOutside,
  isYearOutside,
  monthIndex,
  monthOfKey,
  monthShort,
  monthTitle,
  moveDay,
  panelBounds,
  rovingDay,
} from "@/lib/calendar/calendar";
import type { DateKey } from "@/lib/home/mockHomeData";
import { CARD_EYEBROW, HIT_Y_36, PRESS } from "@/lib/ui-presets";

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

type Month = { year: number; month0: number };

/**
 * A MONTH, TO PICK A DAY WITH: the calendar inside a sheet step, a journal
 * tile, and (since W32) every date field in the app, through
 * `components/feel/DateField.tsx`.
 *
 * Adrian chose this shape from a four-variant prototype on 2026-09-11 ("do A but
 * add animations"), after a screenshot of another app's picker: the date is the
 * sheet's title, and tapping it pushes the sheet across to this. Built
 * 2026-09-12 for `AddProgressPhotoSheet`. On 2026-09-26 he asked for one
 * calendar on every date field (W32), in place of `<input type="date">`, which
 * ran off the screen on iOS.
 *
 * ## Nothing here is new maths
 *
 * The cells, the Mon-first order and the fixed six rows are `buildMonthMatrix`,
 * the same function the Calendar screen's grid runs on. Which days can be
 * picked, where it opens, where the arrow keys go and when Today can act are
 * the pure, tested rules in `lib/calendar/calendar.ts` (`panelBounds`,
 * `anchorDay`, `moveDay`, `rovingDay`, `canGoToday`, `canStepMonth`).
 *
 * The look is the final check's (r6 `calPanel`): rounded-rectangle days
 * (radius 8), the chosen day white, today ringed, a day that cannot be picked
 * MUTED and never the faintest grey, and the neighbouring months' days left
 * blank. Stepping a month is the Schedule's WEEK PARALLAX, reused by class:
 * `animate-schedule-back` / `-forward` with the far layer (`schedule-dayhead`,
 * 26px / 220ms) and the near layer (`schedule-group`, 10px / 190ms).
 *
 * ## The rules that are load-bearing
 *
 * 1. **Bounds.** `min` and `max` are inclusive. Leaving `max` out keeps TODAY
 *    as the last day, which the photo, weight and journal calendars were built
 *    on (a photo cannot be dated tomorrow); `max={null}` opens the future (an
 *    end date). The arrows stop at the last month with a day to pick.
 * 2. **`onSettled` fires after the pop, not with it.** The parent closes the
 *    step (or the pop-up) on it, so shortening this to zero would yank the
 *    calendar away before the day you tapped had visibly filled. Under
 *    `prefers-reduced-motion` it IS zero, deliberately.
 * 3. **The grid is ONE Tab stop.** The arrow keys move a day or a week, Home /
 *    End to the week's ends, Page Up / Down a month (a year with Shift), and a
 *    move never lands on a day that cannot be picked. Crossing into another
 *    month turns the page.
 * 4. **`monthJump`** makes the month's title a button that swaps the days for
 *    a year and its twelve months, for a date far away (a birthday). Off by
 *    default, so the sheets that had this calendar keep it as it was.
 */
export function DatePickerPanel({
  value,
  todayKey,
  active,
  onPick,
  onSettled,
  className,
  min,
  max,
  monthJump = false,
  autoFocus = false,
  secondaryAction,
}: {
  /** The chosen day, or "" when none is chosen yet. */
  value: DateKey | "";
  /** Today, from the caller's timezone-resolved key — never `new Date()` here. */
  todayKey: DateKey;
  /** True while this is the visible step: re-anchors the month on the way in. */
  active: boolean;
  /** Fires the moment a day is chosen, before the beat that follows it. */
  onPick: (key: DateKey) => void;
  /** Fires once the disc has popped and held. */
  onSettled?: () => void;
  className?: string;
  /** The first day that can be picked (inclusive). Omitted: no limit. */
  min?: DateKey | null;
  /** The last day that can be picked (inclusive). Omitted: TODAY. `null`: no limit. */
  max?: DateKey | null;
  /** The title opens a month-and-year view, for far dates. */
  monthJump?: boolean;
  /** Focus the grid's day each time the panel becomes active. */
  autoFocus?: boolean;
  /** A second word in the footer, left of Today ("Clear"). */
  secondaryAction?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  const bounds = useMemo(() => panelBounds(todayKey, min, max), [todayKey, min, max]);

  const [view, setView] = useState<Month>(() => monthOfKey(anchorDay(value, todayKey, bounds)));
  const [travel, setTravel] = useState<{ dir: "back" | "forward"; n: number } | null>(null);
  /** The day mid-pop. Cleared after, so picking the same day twice replays it. */
  const [popKey, setPopKey] = useState<DateKey | null>(null);
  /** The day the arrow keys last reached: the grid's one Tab stop. */
  const [focusKey, setFocusKey] = useState<DateKey>(() => anchorDay(value, todayKey, bounds));
  /** The month-and-year view, and the year it is showing. */
  const [months, setMonths] = useState(false);
  const [browseYear, setBrowseYear] = useState(view.year);

  const titleId = useId();
  const animRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);
  /** A day to focus once the render that shows it has landed. */
  const pendingFocus = useRef<DateKey | null>(null);

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
   * would re-anchor the month the instant a day is chosen and rebuild the grid
   * under the disc while it was still popping. React's own
   * adjust-state-on-prop-change idiom (also how this sheet resets itself on
   * open), not an effect, because an effect here renders twice.
   */
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) {
      const anchor = anchorDay(value, todayKey, bounds);
      setView(monthOfKey(anchor));
      setFocusKey(anchor);
      setMonths(false);
    }
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

  /** The one day in view that Tab lands on. */
  const tabKey = rovingDay(view.year, view.month0, [focusKey, value, todayKey], bounds);

  // A keyboard move or a picked month asked for a day to be focused: give it
  // focus once the render that shows it has landed.
  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    pendingFocus.current = null;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${want}"]`)?.focus({ preventScroll: true });
  });

  // Opened by a control (a date field's pop-up): the keyboard starts on the
  // day, not on the first arrow. A passive effect, so it runs after the
  // pop-up's own focus move and settles the question. On the way in only: a
  // later month step must not pull focus into the grid.
  useEffect(() => {
    if (!active || !autoFocus) return;
    gridRef.current?.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus({ preventScroll: true });
  }, [active, autoFocus]);

  function turnTo(next: Month) {
    const from = monthIndex(view.year, view.month0);
    const to = monthIndex(next.year, next.month0);
    if (from === to) return;
    setView(next);
    setTravel((t) => ({ dir: to < from ? "back" : "forward", n: (t?.n ?? 0) + 1 }));
  }

  function choose(key: DateKey) {
    if (busy.current || isDayOutside(key, bounds)) return;
    busy.current = true;
    setFocusKey(key);
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
    const today = monthOfKey(todayKey);
    setMonths(false);
    if (view.year !== today.year || view.month0 !== today.month0) {
      turnTo(today);
      busy.current = true;
      after(TRAVEL_MS, () => {
        busy.current = false;
        choose(todayKey);
      });
      return;
    }
    choose(todayKey);
  }

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const move = dayMoveForKey(e.key, e.shiftKey);
    if (!move) return;
    const from = (e.target as HTMLElement).closest<HTMLElement>("[data-day]")?.dataset.day;
    if (!from) return;
    e.preventDefault();
    const next = moveDay(from, move, bounds);
    // At a bound the move goes nowhere, and nothing re-renders to take a
    // pending focus: leaving one set would pull focus back here on some later,
    // unrelated render.
    if (next === from) return;
    setFocusKey(next);
    turnTo(monthOfKey(next));
    pendingFocus.current = next;
  }

  function toggleMonths() {
    if (!months) setBrowseYear(view.year);
    setMonths((m) => !m);
  }

  /** A month from the month-and-year view: back to its days, focus on one. */
  function pickMonth(month0: number) {
    const next = { year: browseYear, month0 };
    setMonths(false);
    turnTo(next);
    const key = rovingDay(next.year, next.month0, [focusKey, value, todayKey], bounds);
    if (key) {
      setFocusKey(key);
      pendingFocus.current = key;
    }
  }

  const stepBack = months ? !isYearOutside(browseYear - 1, bounds) : canStepMonth(view, -1, bounds);
  const stepOn = months ? !isYearOutside(browseYear + 1, bounds) : canStepMonth(view, 1, bounds);
  const today = monthOfKey(todayKey);
  const title = months ? String(browseYear) : monthTitle(view.year, view.month0);
  // From the month view Today always has somewhere to go, if today can be picked.
  const todayOk = canGoToday(todayKey, months ? "" : value, view, bounds);

  const titleText = (
    <span id={titleId} aria-live="polite" className="text-base font-light tracking-[-0.02em] text-foreground">
      {title}
    </span>
  );

  return (
    <div className={className}>
      <div ref={animRef}>
        <div className="schedule-dayhead flex items-center justify-between pb-2">
          {monthJump ? (
            <button
              type="button"
              onClick={toggleMonths}
              aria-expanded={months}
              aria-label={months ? `Back to ${monthTitle(view.year, view.month0)}` : `Choose a month, showing ${title}`}
              className={cn(
                PRESS.text,
                HIT_Y_36,
                "-ml-1.5 flex h-9 items-center gap-1.5 rounded-md px-1.5 outline-none transition-colors",
                "hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-amber/50",
              )}
            >
              {titleText}
              <CaretDown
                aria-hidden
                className={cn(
                  "h-3.5 w-3.5 text-text-muted transition-transform duration-[var(--motion-base)] ease-motion motion-reduce:transition-none",
                  months && "rotate-180",
                )}
              />
            </button>
          ) : (
            titleText
          )}
          <span className="flex items-center gap-1">
            <StepButton
              label={months ? "Previous year" : "Previous month"}
              onClick={() => (months ? setBrowseYear((y) => y - 1) : turnTo(addMonths(view.year, view.month0, -1)))}
              disabled={!stepBack}
            >
              <CaretLeft className="h-4 w-4" aria-hidden />
            </StepButton>
            <StepButton
              label={months ? "Next year" : "Next month"}
              onClick={() => (months ? setBrowseYear((y) => y + 1) : turnTo(addMonths(view.year, view.month0, 1)))}
              disabled={!stepOn}
            >
              <CaretRight className="h-4 w-4" aria-hidden />
            </StepButton>
          </span>
        </div>

        {/* The days and the months share one box, so the panel keeps its height
            when you swap between them. */}
        <div className="grid">
          <div className="date-layer [grid-area:1/1]" data-shown={months ? "false" : "true"} inert={months}>
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

            <div
              ref={gridRef}
              role="group"
              aria-labelledby={titleId}
              onKeyDown={onGridKeyDown}
              className="schedule-group grid grid-cols-7 gap-[2px]"
            >
              {cells.map((cell) => {
                // The neighbouring months' days are left blank (r6 calPanel):
                // a number that belongs to another page is one more thing to
                // read, and the arrows are how you get there.
                if (!cell.inMonth) return <span key={cell.key} aria-hidden className="h-10" />;
                const outside = isDayOutside(cell.key, bounds);
                const selected = cell.key === value;
                const isToday = cell.key === todayKey;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    data-day={cell.key}
                    disabled={outside}
                    tabIndex={cell.key === tabKey ? 0 : -1}
                    onClick={() => choose(cell.key)}
                    onFocus={() => setFocusKey(cell.key)}
                    aria-pressed={selected}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={dayAccessibleName(cell.key)}
                    className={cn(
                      !outside && PRESS.day,
                      "flex h-10 w-full min-w-0 items-center justify-center rounded-sm font-mono text-sm outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-amber/60",
                      selected
                        ? "bg-accent-primary font-medium text-bg-base"
                        : outside
                          ? "cursor-default text-text-muted"
                          : "text-foreground hover:bg-bg-surface-raised",
                      !selected && isToday && "ring-1 ring-inset ring-border-strong",
                      popKey === cell.key && "animate-date-pop",
                    )}
                  >
                    {cell.date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {monthJump ? (
            <div
              className="date-layer date-layer-months [grid-area:1/1] grid grid-cols-3 content-start gap-1.5 pt-1"
              data-shown={months ? "true" : "false"}
              inert={!months}
              role="group"
              aria-label={`Months of ${browseYear}`}
            >
              {Array.from({ length: 12 }, (_, m) => {
                const outside = isMonthOutside(browseYear, m, bounds);
                const inView = browseYear === view.year && m === view.month0;
                const isNow = browseYear === today.year && m === today.month0;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={outside}
                    onClick={() => pickMonth(m)}
                    aria-pressed={inView}
                    aria-label={monthTitle(browseYear, m)}
                    className={cn(
                      !outside && PRESS.day,
                      "flex h-11 items-center justify-center rounded-lg text-sm outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-amber/60",
                      inView
                        ? "bg-accent-primary font-medium text-bg-base"
                        : outside
                          ? "cursor-default text-text-muted"
                          : "text-foreground hover:bg-bg-surface-raised",
                      !inView && isNow && "ring-1 ring-inset ring-border-strong",
                    )}
                  >
                    {monthShort(m)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className={cn("mt-2 flex hairline-t pt-1", secondaryAction ? "justify-between" : "justify-center")}>
        {secondaryAction ? (
          <FooterWord onClick={secondaryAction.onClick} disabled={secondaryAction.disabled}>
            {secondaryAction.label}
          </FooterWord>
        ) : null}
        <FooterWord onClick={goToday} disabled={!todayOk}>
          Today
        </FooterWord>
      </div>
    </div>
  );
}

/** A word used as a button in the footer ("Today", "Clear"). */
function FooterWord({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        CARD_EYEBROW,
        "min-h-11 rounded-md px-4 outline-none transition-colors hover:text-foreground",
        "focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-amber/50",
        "disabled:cursor-default disabled:opacity-40 disabled:hover:text-text-muted",
      )}
    >
      {children}
    </button>
  );
}

/** A month (or year) arrow: drawn 44 by 36, reaching 44 tall. */
function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        HIT_Y_36,
        "flex h-9 w-11 items-center justify-center rounded-md text-text-muted outline-none transition-colors",
        "hover:bg-bg-surface-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-amber/50",
        "disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted",
      )}
    >
      {children}
    </button>
  );
}
