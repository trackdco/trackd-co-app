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
}: {
  cell: MonthCell;
  selected: boolean;
  isToday: boolean;
  info: DayInfo;
  onSelect: (cell: MonthCell) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(cell)}
      aria-pressed={selected}
      aria-label={`${cell.date.toDateString()}`}
      className={cn(
        "flex flex-col items-center gap-1 py-0.5 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-accent-amber/50",
        !cell.inMonth && "opacity-40",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm transition-colors",
          selected
            ? "bg-accent-primary font-medium text-bg-base"
            : cn(RING[info.status], isToday && "ring-1 ring-border-strong"),
          isToday && !selected && "text-foreground",
        )}
      >
        {cell.date.getDate()}
      </span>
      {/* The "what was logged" mark — only under logged days. */}
      <span className="flex h-3 items-center justify-center" aria-hidden>
        {!selected && info.status === "logged" && <KindIcon kind={info.kind} />}
      </span>
    </button>
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
