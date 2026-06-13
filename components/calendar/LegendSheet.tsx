"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { cn } from "@/lib/utils";
import type { CalendarDayStatus } from "@/lib/calendar/calendar";

const RING: Record<CalendarDayStatus, string> = {
  logged: "bg-text-primary text-bg-base font-semibold",
  scheduled: "border border-dashed border-border-strong text-text-primary",
  "none-past": "border border-border-strong text-text-muted",
  "none-future": "border border-border-default text-text-subtle",
};

const KEY: { status: CalendarDayStatus; title: string; body: string }[] = [
  {
    status: "logged",
    title: "Logged",
    body: "Filled disc. You logged at least one dose, journal entry, or weight on this day. The icon below shows which.",
  },
  {
    status: "scheduled",
    title: "Not yet logged",
    body: "Dotted ring. A dose was scheduled that day but isn't logged yet — past days you missed and upcoming days you haven't logged both land here.",
  },
  {
    status: "none-past",
    title: "No dose that day",
    body: "Regular stroke. A past day with no scheduled dose — a rest day or off-cycle day.",
  },
  {
    status: "none-future",
    title: "Nothing scheduled",
    body: "Faint stroke. A future day with no scheduled dose. Also used for days before your protocol started.",
  },
];

/**
 * The "Calendar key" legend (the Milligram info sheet). Read-only reference for
 * what each day-ring means. Reuses the app bottom-sheet primitive; the sample
 * rings are rendered from the same classes the grid uses so they stay in sync.
 */
export function LegendSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(
    () => onOpenChange(false),
    open,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        <div
          ref={cardRef}
          style={cardStyle}
          className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
        >
          <div
            {...handleProps}
            className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          <SheetTitle className="sr-only">Calendar key</SheetTitle>
          <SheetDescription className="sr-only">
            What each day marker on the calendar means.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <h2 className="pb-4 font-display text-2xl font-medium text-foreground">
              Calendar key
            </h2>
            <ul className="space-y-4">
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
                    <span className="block text-sm font-medium text-foreground">
                      {k.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">
                      {k.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
