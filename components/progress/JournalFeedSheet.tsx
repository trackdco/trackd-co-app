"use client";

import { useState } from "react";
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  NotebookPen,
  Plus,
  Tags,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { SHEET_TITLE } from "@/lib/ui-presets";
import {
  formatJournalDate,
  formatMonthLabel,
  groupJournalByMonth,
  type JournalEntry,
} from "@/lib/progress/journal";

function bodyFirstLine(body: string | null): string | null {
  return body?.split("\n").find((l) => l.trim() !== "")?.trim() ?? null;
}

/**
 * The journal feed (Step 5) — the user's entries, newest first (one row per day).
 * The "+" branches into the two ways to log: Write (a free-write note) or Markers
 * (dial markers, no body). Tap an entry to read/edit/delete it.
 */
export function JournalFeedSheet({
  open,
  onOpenChange,
  entries,
  onWrite,
  onMarkers,
  onEdit,
  composeOnOpen = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: JournalEntry[];
  onWrite: () => void;
  onMarkers: () => void;
  onEdit: (entry: JournalEntry) => void;
  /** Open with the Write/Markers branch already expanded (the + menu's Journal). */
  composeOnOpen?: boolean;
}) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);
  const [branchOpen, setBranchOpen] = useState(false);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setBranchOpen(composeOnOpen);
      setMonthMenuOpen(false);
      setSelectedMonth("all");
    }
  }

  // Entries grouped by calendar month (newest first); the dropdown filters to one.
  const months = groupJournalByMonth(entries);
  const visibleMonths =
    selectedMonth === "all"
      ? months
      : months.filter((g) => g.key === selectedMonth);

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

          <SheetTitle className="sr-only">Journal</SheetTitle>
          <SheetDescription className="sr-only">
            Your journal entries, newest first.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <div className="flex items-center justify-between gap-3 pb-1">
              <h2 className={SHEET_TITLE}>Journal</h2>
              <button
                type="button"
                onClick={() => setBranchOpen((o) => !o)}
                aria-expanded={branchOpen}
                className="flex items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-raised"
              >
                <Plus className="h-4 w-4" aria-hidden />
                New
              </button>
            </div>

            {/* The "+" branch — Write vs Markers. */}
            {branchOpen && (
              <div className="animate-shortcut-in mt-2 grid grid-cols-2 gap-2">
                <BranchButton
                  icon={<NotebookPen className="h-4 w-4" aria-hidden />}
                  label="Write a note"
                  sub="Free-write + optional markers"
                  onClick={() => {
                    setBranchOpen(false);
                    onWrite();
                  }}
                />
                <BranchButton
                  icon={<Tags className="h-4 w-4" aria-hidden />}
                  label="Log markers"
                  sub="Dial how you feel"
                  onClick={() => {
                    setBranchOpen(false);
                    onMarkers();
                  }}
                />
              </div>
            )}

            {entries.length === 0 ? (
              <p className="mt-4 text-sm text-text-muted">
                No entries yet. Tap New to write a note or log markers.
              </p>
            ) : (
              <>
                {/* Month filter — jump to a particular month's entries. */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setMonthMenuOpen((o) => !o)}
                    aria-expanded={monthMenuOpen}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-border-default bg-bg-input px-3.5 py-2.5 text-sm transition-colors hover:border-border-strong"
                  >
                    <span className="flex items-center gap-2">
                      <CalendarRange className="h-4 w-4 text-text-muted" aria-hidden />
                      <span className="font-medium text-foreground">
                        {selectedMonth === "all"
                          ? "All months"
                          : formatMonthLabel(selectedMonth)}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-text-muted transition-transform duration-200",
                        monthMenuOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>

                  {monthMenuOpen && (
                    <div className="animate-shortcut-in mt-1.5 divide-y divide-border-default overflow-hidden rounded-xl border border-border-default bg-bg-surface-raised">
                      <MonthOption
                        label="All months"
                        count={entries.length}
                        active={selectedMonth === "all"}
                        onClick={() => {
                          setSelectedMonth("all");
                          setMonthMenuOpen(false);
                        }}
                      />
                      {months.map((g) => (
                        <MonthOption
                          key={g.key}
                          label={g.label}
                          count={g.entries.length}
                          active={selectedMonth === g.key}
                          onClick={() => {
                            setSelectedMonth(g.key);
                            setMonthMenuOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Entries, grouped under a month heading. */}
                <div className="mt-4 space-y-5">
                  {visibleMonths.map((group) => (
                    <section key={group.key}>
                      <h3 className="px-1 pb-2 font-display text-lg font-medium text-foreground">
                        {group.label}
                      </h3>
                      <ul className="space-y-2">
                        {group.entries.map((e) => {
                          const line = bodyFirstLine(e.body);
                          return (
                            <li key={e.id}>
                              <button
                                type="button"
                                onClick={() => onEdit(e)}
                                className="flex w-full items-start gap-3 rounded-2xl border border-border-default bg-bg-surface-raised px-4 py-3.5 text-left transition-colors hover:border-border-strong"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium text-foreground">
                                    {formatJournalDate(e.date)}
                                  </span>
                                  {line && (
                                    <span className="mt-1 block truncate text-xs text-text-muted">
                                      {line}
                                    </span>
                                  )}
                                  {e.markers.length > 0 && (
                                    <span className="mt-2 flex flex-wrap gap-1.5">
                                      {e.markers.slice(0, 3).map((m) => (
                                        <MarkerChip key={m.markerId} name={m.name} word={m.word} />
                                      ))}
                                      {e.markers.length > 3 && (
                                        <span className="self-center text-[11px] text-text-subtle">
                                          +{e.markers.length - 3}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </span>
                                <ChevronRight
                                  className="mt-0.5 h-4 w-4 shrink-0 text-text-subtle"
                                  aria-hidden
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MonthOption({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-bg-input/60"
    >
      <span className={cn("min-w-0 truncate font-medium", active ? "text-accent-amber" : "text-text-muted")}>
        {label}
      </span>
      <span className="shrink-0 font-mono text-xs text-text-subtle">{count}</span>
    </button>
  );
}

function MarkerChip({ name, word }: { name: string; word: string }) {
  return (
    <span className="rounded-full bg-bg-input px-2 py-0.5 text-[11px]">
      <span className="text-text-muted">{name}</span>{" "}
      <span className="text-foreground">{word}</span>
    </span>
  );
}

function BranchButton({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1 rounded-xl border border-border-default bg-bg-surface-raised px-4 py-3 text-left transition-colors hover:border-border-strong"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        {icon}
        {label}
      </span>
      <span className="text-xs text-text-muted">{sub}</span>
    </button>
  );
}
