"use client";

import { useState } from "react";
import { CaretDown, CaretLeft, CaretRight } from "@/components/icons";

import { cn } from "@/lib/utils";
import { PAGE_TITLE } from "@/lib/ui-presets";
import { monthTitle } from "@/lib/calendar/calendar";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface MonthYearPickerProps {
  year: number;
  /** 0-based month. */
  month0: number;
  onChange: (next: { year: number; month0: number }) => void;
}

/**
 * The "May 2026 ⌄" month/year title. Tapping it opens a small on-brand panel — a
 * year stepper over a 3-column month grid — to jump anywhere (the Milligram month
 * switcher, kept within ui-context tokens rather than a native wheel). The title
 * itself is the page's `PAGE_TITLE` heading (sans, light).
 */
export function MonthYearPicker({ year, month0, onChange }: MonthYearPickerProps) {
  const [open, setOpen] = useState(false);
  const [browseYear, setBrowseYear] = useState(year);

  function toggle() {
    if (!open) setBrowseYear(year); // re-anchor the year each open
    setOpen((o) => !o);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-xl px-1 py-0.5 outline-none transition-colors hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent-amber/50"
      >
        <span className={PAGE_TITLE}>
          {monthTitle(year, month0)}
        </span>
        <CaretDown
          className={cn(
            "h-5 w-5 text-text-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <>
          {/* Click-away backdrop. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="animate-shortcut-in absolute left-0 top-full z-40 mt-2 w-64 rounded-2xl border border-border-default bg-bg-surface-raised p-3 shadow-lg">
            {/* Year stepper. */}
            <div className="flex items-center justify-between pb-2">
              <StepButton label="Previous year" onClick={() => setBrowseYear((y) => y - 1)}>
                <CaretLeft className="h-4 w-4" aria-hidden />
              </StepButton>
              <span className="font-mono text-sm font-medium text-foreground">{browseYear}</span>
              <StepButton label="Next year" onClick={() => setBrowseYear((y) => y + 1)}>
                <CaretRight className="h-4 w-4" aria-hidden />
              </StepButton>
            </div>

            {/* Month grid. */}
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS_SHORT.map((label, i) => {
                const active = browseYear === year && i === month0;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      onChange({ year: browseYear, month0: i });
                      setOpen(false);
                    }}
                    className={cn(
                      "rounded-lg py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-amber/50",
                      active
                        ? "bg-accent-primary font-medium text-bg-base"
                        : "text-text-muted hover:bg-bg-input hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted outline-none transition-colors hover:bg-bg-input hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-amber/50"
    >
      {children}
    </button>
  );
}
