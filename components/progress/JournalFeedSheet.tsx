"use client";

import { useState, type ReactNode } from "react";
import { CalendarBlank, CaretRight, NotePencil, Plus, Tag } from "@/components/icons";

import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { CloseArrow, CloseArrowIcon } from "@/components/feel/CloseArrow";
import { JournalSavedMark } from "@/components/progress/JournalSavedMark";
import {
  ADD_ACTION,
  CARD_EYEBROW,
  PRESS,
  ROW_CHEVRON,
  ROWS,
  SHEET_TITLE,
} from "@/lib/ui-presets";
import { dayLong } from "@/lib/format/date";
import {
  bodyFirstLine,
  formatMonthLabel,
  groupJournalByMonth,
  type JournalEntry,
} from "@/lib/progress/journal";

/**
 * The journal feed (Step 5) — the user's entries, newest first (one row per day).
 * The "+" branches into the two ways to log: Write (a free-write note) or Markers
 * (dial markers, no body). Tap an entry to read/edit/delete it.
 *
 * The one sheet frame (`BottomSheet`, consistency fix #1), its title with the
 * small "+" at the top right (fix #21). The month filter opens in place, so it
 * closes with the one close arrow (fix #11); an entry goes somewhere, so it
 * keeps the chevron. Back here from a save, the day's row shows a small tick
 * and "Saved" for a couple of seconds (W10).
 */
export function JournalFeedSheet({
  open,
  onOpenChange,
  entries,
  onWrite,
  onMarkers,
  onEdit,
  composeOnOpen = false,
  savedMark = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: JournalEntry[];
  onWrite: () => void;
  onMarkers: () => void;
  onEdit: (entry: JournalEntry) => void;
  /** Open with the Write/Markers branch already expanded (the + menu's Journal). */
  composeOnOpen?: boolean;
  /** The save just made (a count and its day): that day's row shows the tick. */
  savedMark?: { n: number; date: string } | null;
}) {
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
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Journal"
      description="Your journal entries, newest first."
      header={
        <div className="flex items-center justify-between gap-3">
          <span aria-hidden className={SHEET_TITLE}>
            Journal
          </span>
          <button
            type="button"
            onClick={() => setBranchOpen((o) => !o)}
            aria-expanded={branchOpen}
            aria-label="New entry"
            className={cn(ADD_ACTION, "relative before:absolute before:-inset-1.5 before:content-['']")}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      }
    >
      {/* The sections rise in as the sheet lands (feel pass §4). The
          "+" branch keeps its own drop-in. */}
      <div data-sheet-body>
        {/* The "+" branch — Write vs Markers. */}
        {branchOpen && (
          <div className="animate-shortcut-in grid grid-cols-2 gap-2">
            <BranchButton
              icon={<NotePencil className="h-4 w-4" aria-hidden />}
              label="Write a note"
              onClick={() => {
                setBranchOpen(false);
                onWrite();
              }}
            />
            <BranchButton
              icon={<Tag className="h-4 w-4" aria-hidden />}
              label="Log markers"
              onClick={() => {
                setBranchOpen(false);
                onMarkers();
              }}
            />
          </div>
        )}

        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">No entries yet.</p>
        ) : (
          <>
            {/* Month filter — jump to a particular month's entries. It opens
                in place: a small down arrow while shut, the close arrow once
                open. */}
            <div className={branchOpen ? "mt-3" : undefined}>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMonthMenuOpen((o) => !o)}
                  aria-expanded={monthMenuOpen}
                  className={cn(
                    PRESS.field,
                    "flex min-h-11 w-full items-center gap-2 rounded-xl bg-bg-input py-2.5 pr-12 pl-3.5 text-sm",
                  )}
                >
                  <CalendarBlank className="h-4 w-4 text-text-muted" aria-hidden />
                  <span className="font-medium text-foreground">
                    {selectedMonth === "all" ? "All months" : formatMonthLabel(selectedMonth)}
                  </span>
                </button>
                <span className="pointer-events-none absolute top-1/2 right-1.5 flex h-[30px] w-[30px] -translate-y-1/2 items-center justify-center">
                  <span
                    aria-hidden
                    className={cn(
                      "flex rotate-180 text-text-muted transition-opacity duration-200",
                      monthMenuOpen && "opacity-0",
                    )}
                  >
                    <CloseArrowIcon size={12} />
                  </span>
                  <CloseArrow
                    onClick={() => setMonthMenuOpen(false)}
                    label="Close months"
                    shown={monthMenuOpen}
                    className="pointer-events-auto absolute inset-0"
                  />
                </span>
              </div>

              {monthMenuOpen && (
                <div className={cn(ROWS, "animate-shortcut-in mt-1.5 overflow-hidden")}>
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

            {/* Entries, grouped under a month heading. Each month is a
                direct child of the body, so each rises in its turn. */}
            {visibleMonths.map((group, gi) => (
              <section key={group.key} className={gi === 0 ? "mt-4" : "mt-5"}>
                <h3 className={`px-1 pb-2 ${CARD_EYEBROW}`}>{group.label}</h3>
                <ul className={cn(ROWS, "overflow-hidden")}>
                  {group.entries.map((e) => {
                    const line = bodyFirstLine(e.body);
                    const photoUrl = e.attachments.find((a) => a.url)?.url ?? null;
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => onEdit(e)}
                          className={cn(
                            PRESS.row,
                            "flex w-full items-start gap-3 px-4 py-3.5 text-left",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                              <span className="truncate">{dayLong(e.date)}</span>
                              {savedMark && savedMark.date === e.date ? (
                                <JournalSavedMark key={savedMark.n} className="shrink-0 font-normal" />
                              ) : null}
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
                                  <span className="self-center text-[11px] text-text-muted">
                                    +{e.markers.length - 3}
                                  </span>
                                )}
                              </span>
                            )}
                          </span>
                          {photoUrl && (
                            <span className="relative mt-0.5 shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photoUrl}
                                alt=""
                                className="h-12 w-9 rounded-lg border border-border-default object-cover object-top"
                              />
                              {e.attachments.length > 1 && (
                                <span className="absolute -right-1 -bottom-1 rounded-lg border border-border-strong bg-bg-surface px-1 text-[10px] leading-tight text-text-muted">
                                  {e.attachments.length}
                                </span>
                              )}
                            </span>
                          )}
                          <CaretRight className={cn(ROW_CHEVRON, "mt-0.5")} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </BottomSheet>
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
      className={cn(
        PRESS.row,
        "flex min-h-11 w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm",
      )}
    >
      <span className={cn("min-w-0 truncate font-medium", active ? "text-foreground" : "text-text-muted")}>
        {label}
      </span>
      <span className="shrink-0 font-mono text-xs text-text-muted">{count}</span>
    </button>
  );
}

function MarkerChip({ name, word }: { name: string; word: string }) {
  return (
    <span className="rounded-lg bg-bg-input px-2 py-0.5 text-[11px]">
      <span className="text-text-muted">{name}</span>{" "}
      <span className="text-foreground">{word}</span>
    </span>
  );
}

function BranchButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        PRESS.card,
        "inst-ghost flex min-h-11 items-center gap-2 px-4 py-3 text-left text-sm font-medium text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
