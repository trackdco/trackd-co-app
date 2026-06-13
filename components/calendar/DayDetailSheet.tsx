"use client";

import { ChevronRight } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories";
import { formatTimeLabel } from "@/lib/home/stack";
import { siteLabel } from "@/lib/home/siteCatalog";
import { formatJournalDate, type EntryMarker } from "@/lib/progress/journal";
import { formatWeight, type WeightUnit } from "@/lib/weight";
import type { DateKey } from "@/lib/home/mockHomeData";
import type { LoggedCompound } from "@/lib/calendar/calendar";

interface DayDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected day; null only before the first selection. */
  dateKey: DateKey | null;
  /** Compounds actually logged that day (the "Running" read). */
  running: LoggedCompound[];
  /** Weight logged that day, in kg, or null. */
  weightKg: number | null;
  unit: WeightUnit;
  /** Marker words dialed that day. */
  markers: EntryMarker[];
  /** That day's journal body, or null. */
  journalBody: string | null;
  /** Whether a journal entry exists for the day (enables the deep-link). */
  hasJournalEntry: boolean;
  /** Deep-link to the canonical weight view. */
  onOpenWeight: () => void;
  /** Deep-link to that day's entry in the Journal. */
  onOpenJournal: () => void;
}

/**
 * The day-detail review sheet (Spec 10 → Step 5). Reuses the app's bottom-sheet
 * primitive (drag handle + `useSheetDrag`). Rows, in order: Running → Weight →
 * Markers → Journal → Photos (reserved, empty). Read-only: Weight and Journal
 * deep-link to their existing editors; nothing is created or edited here. No
 * amber — the sheet stays muted/hairline (amber is the selected day only).
 */
export function DayDetailSheet({
  open,
  onOpenChange,
  dateKey,
  running,
  weightKg,
  unit,
  markers,
  journalBody,
  hasJournalEntry,
  onOpenWeight,
  onOpenJournal,
}: DayDetailSheetProps) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(
    () => onOpenChange(false),
    open,
  );

  const bodyLine = journalBody
    ?.split("\n")
    .find((l) => l.trim() !== "")
    ?.trim();

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

          <SheetTitle className="sr-only">
            {dateKey ? formatJournalDate(dateKey) : "Day detail"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            What you logged on this day — running, weight, markers, and journal.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <h2 className="pb-4 font-display text-2xl font-medium text-foreground">
              {dateKey ? formatJournalDate(dateKey) : ""}
            </h2>

            <div className="space-y-5">
              {/* 1 — Running (what was logged that day). */}
              <Row label="Running">
                {running.length === 0 ? (
                  <Empty />
                ) : (
                  <ul className="space-y-2">
                    {running.map((c) => (
                      <RunningRow key={c.id} compound={c} />
                    ))}
                  </ul>
                )}
              </Row>

              {/* 2 — Weight (deep-links to the canonical weight view). */}
              <Row label="Weight">
                {weightKg == null ? (
                  <Empty />
                ) : (
                  <DeepLink onClick={onOpenWeight}>
                    <span className="font-mono text-base text-foreground">
                      {formatWeight(weightKg, unit)}
                      <span className="ml-1 text-sm text-text-muted">{unit}</span>
                    </span>
                  </DeepLink>
                )}
              </Row>

              {/* 3 — Markers (read-only words). */}
              <Row label="Markers">
                {markers.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {markers.map((m) => (
                      <span
                        key={m.markerId}
                        className="rounded-full bg-bg-input px-2.5 py-1 text-xs"
                      >
                        <span className="text-text-muted">{m.name}</span>{" "}
                        <span className="text-foreground">{m.word}</span>
                      </span>
                    ))}
                  </div>
                )}
              </Row>

              {/* 4 — Journal (deep-links to that day's entry). */}
              <Row label="Journal">
                {!hasJournalEntry ? (
                  <Empty />
                ) : (
                  <DeepLink onClick={onOpenJournal}>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                      {bodyLine ?? "Open entry"}
                    </span>
                  </DeepLink>
                )}
              </Row>

              {/* 5 — Photos (RESERVED — empty pending the storage decision). */}
              <Row label="Photos">
                <p className="text-sm text-text-subtle">Reserved</p>
              </Row>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="pb-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
        {label}
      </h3>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-text-subtle">—</p>;
}

/** A tappable row that deep-links out to an existing editor/view. */
function DeepLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border-default bg-bg-surface-raised px-4 py-3 text-left outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent-amber/50"
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
    </button>
  );
}

function RunningRow({ compound }: { compound: LoggedCompound }) {
  const meta =
    CATEGORY_META[compound.category as CompoundCategory] ?? FALLBACK_CATEGORY_META;
  const parts = [
    `${compound.amount}${compound.unit ? ` ${compound.unit}` : ""}`,
    formatTimeLabel(compound.time24),
    compound.siteId ? siteLabel(compound.siteId) : null,
  ].filter(Boolean);

  return (
    <li className="flex items-start gap-2.5 rounded-xl border border-border-default bg-bg-surface-raised px-4 py-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {compound.name}
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-muted">
          {parts.join(" · ")}
        </span>
      </span>
    </li>
  );
}
