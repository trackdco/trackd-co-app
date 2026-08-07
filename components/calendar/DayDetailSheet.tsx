"use client";

import { CaretRight, DotsThree } from "@/components/icons";
import type { OneOffLog } from "@/lib/home/oneOffLogs";
import { Container } from "@/components/containers";
import { inventoryTypeForCompound } from "@/lib/containers/form";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { CategoryIcon } from "@/components/compounds/CategoryIcon";
import { SHEET_TITLE } from "@/lib/ui-presets";
import { formatTimeLabel, type StackCompound } from "@/lib/home/stack";
import { siteLabel } from "@/lib/home/siteCatalog";
import { formatJournalDate, type EntryMarker } from "@/lib/progress/journal";
import { formatWeight, type WeightUnit } from "@/lib/weight";
import type { DateKey } from "@/lib/home/mockHomeData";
import type { CalendarPhoto, LoggedCompound } from "@/lib/calendar/calendar";
import { cycleColourVar, type CycleColour } from "@/lib/protocol/cycleRule";

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
  /** Progress photos taken that day (signed for display). */
  photos: CalendarPhoto[];
  /** Deep-link to the canonical weight view. */
  onOpenWeight: () => void;
  /** Deep-link to that day's entry in the Journal. */
  onOpenJournal: () => void;
  /** Deep-link to the progress-photo gallery. */
  onOpenPhotos: () => void;
  /** Compounds due on this day that aren't logged yet — the calendar's log path.
   *  Empty means nothing outstanding, so the section doesn't render. */
  dueToLog: StackCompound[];
  /** Log one of them. The caller writes to THIS sheet's day, not to today. */
  onLogDose: (compound: StackCompound) => void;
  /** Things taken off-plan on this day (Spec w2b-13, Step 8). They appear here
   *  and in a block's look-back, and nowhere that counts anything. */
  oneOffs?: OneOffLog[];
  /** Open the off-plan menu for THIS day — the "⋯" beside Running. */
  onOpenOneOffs?: () => void;
  /** Cycles covering this day (Spec 03 · part two). End dates live here rather
   *  than on the grid, where they would clutter every single on-day. */
  cycles?: CycleDayDetail[];
}

/** A cycle covering the open day, with the end it is heading for. */
export interface CycleDayDetail {
  compoundId: string;
  compoundName: string;
  colour: CycleColour;
  /** "7 on / 7 off" — the pattern. */
  pattern: string;
  /** "Ends 26 Jul" / "No end set" / "Ends when the vial runs out". */
  end: string;
}

/**
 * The day-detail review sheet (Spec 10 → Step 5). Reuses the app's bottom-sheet
 * primitive (drag handle + `useSheetDrag`). Rows, in order: Running → Weight →
 * Markers → Journal → Photos (reserved, empty). Read-only: Weight and Journal
 * deep-link to their existing editors; nothing is created or edited here. No
 * amber — the sheet stays muted/hairline (the selected day reads white, not amber).
 */
export function DayDetailSheet({
  open,
  onOpenChange,
  dateKey,
  running,
  oneOffs,
  onOpenOneOffs,
  weightKg,
  unit,
  markers,
  journalBody,
  hasJournalEntry,
  photos,
  dueToLog,
  onLogDose,
  onOpenWeight,
  onOpenJournal,
  onOpenPhotos,
  cycles,
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
            What you logged on this day: running, weight, markers, and journal.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <h2 className={`pb-4 ${SHEET_TITLE}`}>
              {dateKey ? formatJournalDate(dateKey) : ""}
            </h2>

            <div className="space-y-5">
              {/* 0 — Cycles covering this day. Only shown when the day is inside
                  one, so an uncycled day's sheet is unchanged. */}
              {cycles && cycles.length > 0 && (
                <Row label="Cycle">
                  <ul className="space-y-2">
                    {cycles.map((c) => (
                      <li key={c.compoundId} className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ background: cycleColourVar(c.colour) }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {c.compoundName}
                          </span>
                          <span className="block text-xs text-text-muted">
                            {c.pattern} · {c.end}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Row>
              )}

              {/* 1 — Running (what was logged that day).

                  OFF-PLAN entries hang off the "⋯" here rather than occupying a
                  section of their own (Adrian, 2026-08-07). Most days have none,
                  and a permanently empty "Also taken" block was a heading
                  earning its space on the rare day and wasting it on every
                  other. The count rides the button so the menu is never a
                  surprise when you open it. */}
              <Row
                label="Running"
                action={
                  // Only while the day HAS none. Once there are some they get a
                  // section of their own below, and the "⋯" goes with them —
                  // two of them on one sheet is a puzzle, not an affordance.
                  onOpenOneOffs &&
                  (oneOffs?.length ?? 0) === 0 && (
                    <button
                      type="button"
                      onClick={onOpenOneOffs}
                      aria-label="Log something else on this day"
                      className="-mr-1 flex h-7 items-center gap-1.5 rounded-full px-2 text-text-muted transition-colors hover:text-text-primary"
                    >
                      <DotsThree className="h-4 w-4" aria-hidden />
                    </button>
                  )
                }
              >
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

              {/* 1a — ALSO TAKEN. A real section, with the compound in it, and
                  ONLY on a day that has some (Adrian, 2026-08-07). It used to
                  live entirely behind a "+2" on the "⋯", which is too small a
                  thing to represent something the user actually did — you could
                  not see WHAT you had taken without opening a menu first. The
                  empty case still costs nothing, because on a day with none this
                  does not render at all. */}
              {(oneOffs?.length ?? 0) > 0 && (
                <Row
                  label="Also logged"
                  action={
                    onOpenOneOffs && (
                      <button
                        type="button"
                        onClick={onOpenOneOffs}
                        aria-label={`Manage the ${oneOffs?.length} other things logged on this day`}
                        className="-mr-1 flex h-7 items-center rounded-full px-2 text-text-muted transition-colors hover:text-text-primary"
                      >
                        <DotsThree className="h-4 w-4" aria-hidden />
                      </button>
                    )
                  }
                >
                  <ul className="space-y-2">
                    {oneOffs?.map((o) => (
                      <li
                        key={o.id}
                        className="flex items-center gap-2.5 rounded-xl bg-bg-surface-raised px-4 py-3"
                      >
                        <Container
                          name={o.compoundName ?? o.label}
                          inventoryType={inventoryTypeForCompound(
                            o.compoundName ?? o.label,
                            o.method ?? "po",
                          )}
                          category={o.category ?? "supplement"}
                          size={26}
                          className="shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {o.label}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-text-muted">
                            {[
                              o.amount
                                ? `${o.amount}${o.unit ? ` ${o.unit}` : ""}`
                                : null,
                              o.time24 ? formatTimeLabel(o.time24) : null,
                              // The one thing every row must say: this counted
                              // toward nothing. Otherwise it reads as a dose.
                              "off-plan",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Row>
              )}

              {/* 1b — Due but not logged. The calendar used to be strictly
                  read-only, so a day you'd missed could be reviewed but not
                  filled in. Tapping one opens the same Log sheet the dashboard
                  uses, writing to THIS day (Spec 01 → date context on logging).
                  Muted like the rest of the sheet — no amber; the day being
                  incomplete isn't an alarm. */}
              {dueToLog.length > 0 && (
                <Row label="Due">
                  <ul className="space-y-2">
                    {dueToLog.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onLogDose(c)}
                          className="flex w-full items-center gap-2.5 rounded-lg py-1 text-left transition-opacity active:scale-[0.99] hover:opacity-80"
                        >
                          <CategoryIcon category={c.category} className="h-3.5 w-3.5" />
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {c.name}
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
                            Log
                          </span>
                          <CaretRight className="h-3.5 w-3.5 shrink-0 text-text-subtle" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </Row>
              )}

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

              {/* 5 — Photos (that day's progress photos; deep-links to the gallery). */}
              <Row label="Photos">
                {photos.length === 0 ? (
                  <Empty />
                ) : (
                  <DeepLink onClick={onOpenPhotos}>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {photos.slice(0, 4).map((p) => (
                        <span
                          key={p.id}
                          className="h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-border-default bg-bg-surface-raised"
                        >
                          {p.url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.url}
                              alt=""
                              className="h-full w-full object-cover object-top"
                            />
                          )}
                        </span>
                      ))}
                      {photos.length > 4 && (
                        <span className="self-center text-xs text-text-subtle">
                          +{photos.length - 4}
                        </span>
                      )}
                    </span>
                  </DeepLink>
                )}
              </Row>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  action,
  children,
}: {
  label: string;
  /** A control railed right of the heading — the "⋯" that opens a section's own
   *  menu, so the sheet does not grow a permanent block for something most days
   *  have none of. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 pb-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
          {label}
        </h3>
        {action}
      </div>
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
      <CaretRight className="ml-auto h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
    </button>
  );
}

function RunningRow({ compound }: { compound: LoggedCompound }) {
  const parts = [
    `${compound.amount}${compound.unit ? ` ${compound.unit}` : ""}`,
    formatTimeLabel(compound.time24),
    compound.siteId ? siteLabel(compound.siteId) : null,
  ].filter(Boolean);

  return (
    <li className="flex items-start gap-2.5 rounded-xl bg-bg-surface-raised px-4 py-3">
      <CategoryIcon category={compound.category} className="mt-0.5 h-3.5 w-3.5" />
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
