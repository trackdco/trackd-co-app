"use client";

import { BottomSheet } from "@/components/layout/BottomSheet";
import { cn } from "@/lib/utils";
import type { CalendarDayStatus } from "@/lib/calendar/calendar";

const RING: Record<CalendarDayStatus, string> = {
  logged: "bg-text-primary text-bg-base font-medium",
  scheduled: "border border-dashed border-border-strong text-text-primary",
  "none-past": "border border-border-strong text-text-muted",
  "none-future": "border border-border-default text-text-muted",
};

/** One sentence each (consistency fix #29). */
const KEY: { status: CalendarDayStatus; title: string; body: string }[] = [
  {
    status: "logged",
    title: "Logged",
    body: "You logged a dose, photo, journal entry or weight; the icon below says which.",
  },
  {
    status: "scheduled",
    title: "Not yet logged",
    body: "A dose was scheduled and is not logged yet.",
  },
  {
    status: "none-past",
    title: "No dose that day",
    body: "A past day with nothing scheduled, such as a rest or off-cycle day.",
  },
  {
    status: "none-future",
    title: "Nothing scheduled",
    body: "A future day, or one before your protocol started, with nothing scheduled.",
  },
];

/**
 * The "Calendar key" legend: what each day-ring means, on the one sheet frame
 * (consistency fix #1). The sample rings are rendered from the same classes
 * the grid uses so they stay in sync.
 */
export function LegendSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Calendar key"
      description="What each day marker on the calendar means."
      desktop="dialog"
    >
      {/* Each key rises in as the sheet lands (feel pass §4). */}
      <ul data-sheet-body className="space-y-4 pb-1">
        {KEY.map((k) => (
          <li key={k.status} className="flex items-start gap-3.5">
            <span
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs",
                RING[k.status],
              )}
            >
              15
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{k.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">{k.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
