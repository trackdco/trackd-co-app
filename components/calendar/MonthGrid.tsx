"use client";

import { Camera, Info, NotePencil, Scales, Syringe } from "@/components/icons";

import { cn } from "@/lib/utils";
import type { DateKey } from "@/lib/home/mockHomeData";
import {
  WEEKDAY_INITIALS,
  type CalendarDayStatus,
  type DayInfo,
  type LoggedKind,
  type MonthCell,
} from "@/lib/calendar/calendar";
import type { CycleSegment } from "@/lib/calendar/cycleBands";
import { cycleColourVar } from "@/lib/protocol/cycleRule";

interface MonthGridProps {
  cells: MonthCell[];
  todayKey: DateKey;
  selectedKey: DateKey;
  /** Ring state + icon for a day (driven by the real / sample data). */
  infoFor: (key: DateKey) => DayInfo;
  onSelect: (cell: MonthCell) => void;
  /** Jump to today's month + select today. */
  onToday: () => void;
  /** Open the Calendar key legend. */
  onOpenLegend: () => void;
  /** Cycles on each day (Spec 03 · part two). Absent = no cycles, and the grid
   *  then renders exactly as it did before cycles existed. */
  cycleBands?: Map<DateKey, CycleSegment[]>;
}

/**
 * The month grid (Milligram-style). Each day is a ring whose weight encodes its
 * adherence state — filled disc (logged), dotted ring (scheduled, unlogged),
 * regular stroke (past, nothing due), faint stroke (future / pre-protocol) — with
 * a tiny icon under a logged day showing what was logged. The selected day reads
 * white — the primary accent, matching the Home WeekStrip (Context/ui-context.md →
 * amber restraint). A "Today" button and an ⓘ legend sit in the footer.
 */
export function MonthGrid({
  cells,
  todayKey,
  selectedKey,
  infoFor,
  onSelect,
  onToday,
  onOpenLegend,
  cycleBands,
}: MonthGridProps) {
  return (
    <section className="rounded-2xl bg-bg-surface px-3 pt-4 pb-3">
      {/* Weekday header (Mon-first). */}
      <div className="grid grid-cols-7 pb-2">
        {WEEKDAY_INITIALS.map((d, i) => (
          <span
            key={i}
            aria-hidden
            className="text-center text-[11px] font-medium uppercase tracking-wide text-text-subtle"
          >
            {d}
          </span>
        ))}
      </div>

      {/* The 6×7 day grid. */}
      <div className="grid grid-cols-7 gap-y-2">
        {cells.map((cell) => (
          <DayCell
            key={cell.key}
            cell={cell}
            selected={cell.key === selectedKey}
            isToday={cell.key === todayKey}
            info={infoFor(cell.key)}
            onSelect={onSelect}
            segments={cycleBands?.get(cell.key)}
          />
        ))}
      </div>

      {/* Footer — Today + the legend key. */}
      <div className="mt-3 flex items-center justify-between hairline-t px-1 pt-3">
        <button
          type="button"
          onClick={onToday}
          className="rounded-full px-2 py-1 text-sm font-medium text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-amber/50"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onOpenLegend}
          aria-label="Calendar key"
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted outline-none transition-colors hover:bg-bg-surface-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-amber/50"
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

const RING: Record<CalendarDayStatus, string> = {
  logged: "bg-text-primary font-medium text-bg-base",
  scheduled: "border border-dashed border-border-strong text-text-primary",
  "none-past": "border border-border-strong text-text-muted",
  "none-future": "border border-border-default text-text-subtle",
};

function DayCell({
  cell,
  selected,
  isToday,
  info,
  onSelect,
  segments,
}: {
  cell: MonthCell;
  selected: boolean;
  isToday: boolean;
  info: DayInfo;
  onSelect: (cell: MonthCell) => void;
  segments?: CycleSegment[];
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(cell)}
      aria-pressed={selected}
      aria-label={`${cell.date.toDateString()}`}
      className={cn(
        "relative flex flex-col items-center gap-1 py-0.5 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-accent-amber/50",
        !cell.inMonth && "opacity-40",
      )}
    >
      <span
        className={cn(
          "relative z-10 flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm transition-colors",
          selected
            ? "bg-accent-primary font-medium text-bg-base"
            : cn(RING[info.status], isToday && "ring-1 ring-border-strong"),
          isToday && !selected && "text-foreground",
        )}
      >
        {cell.date.getDate()}
      </span>
      {/* The cycle mark, IN FLOW and directly BENEATH THE DAY DISC (Adrian,
          2026-07-31). Absolute placement put it straight through the logged-day
          icon — measured on 23 of 23 logged days, a coloured bar across a
          syringe — and a stack of them climbed into the disc and disappeared
          behind it from the fourth cycle on.

          It sat below the icon row, which put it ~20px under the disc and moved
          it depending on what else the day drew, so on a filled day it read as
          belonging to nothing. Directly under the disc it is the same distance
          from the number on EVERY day, logged or not, which is what makes a
          column of them scannable. The row is always present, so every cell is
          the same height whether or not it has a cycle. */}
      <span className="flex h-[2px] items-center" aria-hidden>
        {segments && segments.length > 0 && <CycleFill segments={segments} />}
      </span>
      {/* The "what was logged" mark — only under logged days. */}
      <span className="relative z-10 flex h-3 items-center justify-center" aria-hidden>
        {!selected && info.status === "logged" && <KindIcon kind={info.kind} />}
      </span>
    </button>
  );
}

/**
 * The cycle mark under a day (Adrian, 2026-07-30 — replaces the coloured fill).
 *
 * A wash of colour behind the numbers fought everything drawn on top of it: the
 * ring states, the selected day's white, the little type icons. It read as
 * background noise rather than as information, and with two cycles the cell was
 * split down the middle, which made a calendar stop looking like a calendar.
 *
 * ONE BAR, DIVIDED — not a stack of them. Stacking grew upward into the day disc
 * and vanished behind it from the fourth cycle on, so five concurrent cycles
 * silently read as three, and at eleven a stray bar escaped into the row above.
 * A single 16px rule split into equal segments is the same width whatever the
 * count, so it can never collide with anything or misreport how many there are.
 *
 * Order is by cycle start date (fixed upstream) so segments never reshuffle
 * between months. Full opacity: at 2px a colour needs to be itself to be seen.
 */
function CycleFill({ segments }: { segments: CycleSegment[] }) {
  return (
    <span className="flex h-[2px] w-4 gap-[1px] overflow-hidden rounded-full">
      {segments.map((s) => (
        <span
          key={s.compoundId}
          className="h-full min-w-[2px] flex-1"
          style={{ background: cycleColourVar(s.colour) }}
        />
      ))}
    </span>
  );
}

function KindIcon({ kind }: { kind: LoggedKind }) {
  const cls = "h-2.5 w-2.5 text-text-muted";
  if (kind === "dose") return <Syringe className={cls} aria-hidden />;
  if (kind === "photo") return <Camera className={cls} aria-hidden />;
  if (kind === "journal") return <NotePencil className={cls} aria-hidden />;
  if (kind === "weight") return <Scales className={cls} aria-hidden />;
  return null;
}
