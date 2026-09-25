"use client";

import type { ComponentProps, ReactNode } from "react";

import { CaretRight, DotsThree, Plus } from "@/components/icons";
import type { OneOffLog } from "@/lib/home/oneOffLogs";
import { Container } from "@/components/containers";
import { inventoryTypeForCompound } from "@/lib/containers/form";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { CategoryIcon } from "@/components/compounds/CategoryIcon";
import { FlowDoseGroups } from "@/components/home/log/FlowRow";
import { LogFlowContext, type LogFlow } from "@/components/home/log/LogFlow";
import { TrackBar } from "@/components/home/log/TrackBar";
import { ADD_ACTION, CARD_EYEBROW, PRESS, ROW_CHEVRON, ROW_NAME, SHEET_TITLE } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";
import { dayLong } from "@/lib/format/date";
import { formatDose } from "@/lib/format/dose";
import { formatTimeLabel } from "@/lib/home/stack";
import { siteDisplayName, siteLabel } from "@/lib/home/siteCatalog";
import type { DayDose } from "@/lib/home/logRows";
import type { DrawSource } from "@/lib/home/draw";
import type { EntryMarker } from "@/lib/progress/journal";
import { formatWeight, type WeightUnit } from "@/lib/weight";
import type { DateKey } from "@/lib/home/mockHomeData";
import type { CalendarPhoto, LoggedCompound } from "@/lib/calendar/calendar";
import { cycleColourVar, type CycleColour } from "@/lib/protocol/cycleRule";

interface DayDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected day; null only before the first selection. */
  dateKey: DateKey | null;
  /**
   * The day's doses as the SAME Flow B rows Home draws (consistency fix #0),
   * with the host's flow and its Track bar (the sheet's footer).
   */
  log: {
    flow: LogFlow;
    bar: ComponentProps<typeof TrackBar>;
    doses: DayDose[];
    drawSources: Record<string, DrawSource>;
  };
  /** Doses logged for a compound that is no longer in the protocol at all:
   *  shown read-only, because the dose happened. */
  orphans: LoggedCompound[];
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
  /** Things taken off-plan on this day (Spec w2b-13, Step 8). */
  oneOffs?: OneOffLog[];
  /** The "+" at the top right: log something else on THIS day. */
  onAddOneOff?: () => void;
  /** The "⋯" beside Also logged: the day's off-plan list, to remove one. */
  onManageOneOffs?: () => void;
  /** Cycles covering this day (Spec 03 · part two). */
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

/** An off-plan amount in the one dose format when it is a number. */
function oneOffAmount(o: OneOffLog): string | null {
  if (!o.amount) return null;
  const n = Number.parseFloat(o.amount);
  return Number.isFinite(n) ? formatDose(n, o.unit) : `${o.amount}${o.unit ? ` ${o.unit}` : ""}`;
}

/**
 * The day sheet (Spec 10 → Step 5), on the one sheet frame (consistency fix
 * #1). The day's doses are Flow B rows: a tap opens one, Track logs it on THIS
 * day, a logged circle un-logs it (consistency fix #0). Then what else was
 * logged: off-plan entries, weight, markers, journal, photos. A section with
 * nothing in it is not drawn (consistency fix #10). No amber beyond the due
 * beat: the day being incomplete is not an alarm.
 */
export function DayDetailSheet({
  open,
  onOpenChange,
  dateKey,
  log,
  orphans,
  oneOffs,
  onAddOneOff,
  onManageOneOffs,
  weightKg,
  unit,
  markers,
  journalBody,
  hasJournalEntry,
  photos,
  onOpenWeight,
  onOpenJournal,
  onOpenPhotos,
  cycles,
}: DayDetailSheetProps) {
  const title = dateKey ? dayLong(dateKey) : "Day";
  const bodyLine = journalBody
    ?.split("\n")
    .find((l) => l.trim() !== "")
    ?.trim();
  const hasDoses = log.doses.length > 0 || orphans.length > 0;
  const hasOneOffs = (oneOffs?.length ?? 0) > 0;
  const nothing =
    !hasDoses &&
    !hasOneOffs &&
    weightKg == null &&
    markers.length === 0 &&
    !hasJournalEntry &&
    photos.length === 0 &&
    (cycles?.length ?? 0) === 0;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="What you logged on this day, and the doses due on it."
      desktop="rail"
      header={
        <div className="flex items-center justify-between gap-3">
          <h2 className={cn(SHEET_TITLE, "min-w-0 truncate")}>{title}</h2>
          {onAddOneOff ? (
            <button type="button" onClick={onAddOneOff} aria-label="Log something else on this day" className={ADD_ACTION}>
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      }
      footer={log.doses.length > 0 ? <TrackBar inline {...log.bar} /> : undefined}
    >
      {/* Each section rises in as the sheet lands (feel pass §4). */}
      <div data-sheet-body className="space-y-5 pb-1">
        {nothing ? <p className="text-sm text-text-muted">Nothing logged on this day.</p> : null}

        {/* Cycles covering this day, only when the day is inside one. */}
        {cycles && cycles.length > 0 && (
          <Section label="Cycle">
            <ul className="space-y-2">
              {cycles.map((c) => (
                <li key={c.compoundId} className="flex items-center gap-3">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: cycleColourVar(c.colour) }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block", ROW_NAME)}>{c.compoundName}</span>
                    <span className="block text-xs text-text-muted">
                      {c.pattern} · {c.end}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* The day's doses, as Home draws them: grouped by type, each a row
            that opens in place and logs on Track. */}
        {log.doses.length > 0 && (
          <LogFlowContext.Provider value={log.flow}>
            <FlowDoseGroups flow={log.flow} doses={log.doses} drawSources={log.drawSources} />
          </LogFlowContext.Provider>
        )}
        {orphans.length > 0 && (
          <Section label="Logged">
            <ul className="space-y-2">
              {orphans.map((c) => (
                <OrphanRow key={c.id} compound={c} />
              ))}
            </ul>
          </Section>
        )}

        {/* Off-plan entries: a section of their own, only on a day that has
            some. The "⋯" lists them to remove one. */}
        {hasOneOffs && (
          <Section
            label="Also logged"
            action={
              onManageOneOffs && (
                <button
                  type="button"
                  onClick={onManageOneOffs}
                  aria-label="Manage what else was logged on this day"
                  className={cn(PRESS.icon, "-mr-1 flex h-7 items-center rounded-lg px-2 text-text-muted transition-colors hover:text-text-primary")}
                >
                  <DotsThree className="h-4 w-4" aria-hidden />
                </button>
              )
            }
          >
            <ul className="space-y-2">
              {oneOffs?.map((o) => (
                <li key={o.id} className="flex items-center gap-2.5 rounded-xl bg-bg-surface-raised px-4 py-3">
                  <Container
                    name={o.compoundName ?? o.label}
                    inventoryType={inventoryTypeForCompound(o.compoundName ?? o.label, o.method ?? "po")}
                    category={o.category ?? "supplement"}
                    size={26}
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block", ROW_NAME)}>{o.label}</span>
                    {oneOffAmount(o) || o.time24 ? (
                      <span className="mt-0.5 block truncate text-xs text-text-muted">
                        {[oneOffAmount(o), o.time24 ? formatTimeLabel(o.time24) : null].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {weightKg != null && (
          <Section label="Weight">
            <DeepLink onClick={onOpenWeight}>
              <span className="font-mono text-base text-foreground">
                {formatWeight(weightKg, unit)}
                <span className="ml-1 text-sm text-text-muted">{unit}</span>
              </span>
            </DeepLink>
          </Section>
        )}

        {markers.length > 0 && (
          <Section label="Markers">
            <div className="flex flex-wrap gap-1.5">
              {markers.map((m) => (
                <span key={m.markerId} className="rounded-lg bg-bg-input px-2.5 py-1 text-xs">
                  <span className="text-text-muted">{m.name}</span> <span className="text-foreground">{m.word}</span>
                </span>
              ))}
            </div>
          </Section>
        )}

        {hasJournalEntry && (
          <Section label="Journal">
            <DeepLink onClick={onOpenJournal}>
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{bodyLine ?? "Open entry"}</span>
            </DeepLink>
          </Section>
        )}

        {photos.length > 0 && (
          <Section label="Photos">
            <DeepLink onClick={onOpenPhotos}>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                {photos.slice(0, 4).map((p) => (
                  <span
                    key={p.id}
                    className="h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-border-default bg-bg-surface-raised"
                  >
                    {p.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" className="h-full w-full object-cover object-top" />
                    )}
                  </span>
                ))}
                {photos.length > 4 && <span className="self-center text-xs text-text-muted">+{photos.length - 4}</span>}
              </span>
            </DeepLink>
          </Section>
        )}
      </div>
    </BottomSheet>
  );
}

function Section({
  label,
  action,
  children,
}: {
  label: string;
  /** A control railed right of the heading (the "⋯" of a section's menu). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex min-h-7 items-center justify-between gap-3 pb-2">
        <h3 className={CARD_EYEBROW}>{label}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A row that GOES somewhere (another screen): the chevron says so. */
function DeepLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        PRESS.row,
        "flex w-full items-center gap-3 rounded-xl border border-border-default bg-bg-surface-raised px-4 py-3 text-left outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {children}
      <CaretRight className={cn(ROW_CHEVRON, "ml-auto")} aria-hidden />
    </button>
  );
}

/** A dose whose compound has left the protocol: read only. */
function OrphanRow({ compound }: { compound: LoggedCompound }) {
  const n = Number.parseFloat(compound.amount);
  const amount = Number.isFinite(n) ? formatDose(n, compound.unit || null) : compound.amount;
  const parts = [
    amount,
    formatTimeLabel(compound.time24),
    compound.siteId ? siteDisplayName(siteLabel(compound.siteId)) : null,
  ].filter(Boolean);
  return (
    <li className="flex items-start gap-2.5 rounded-xl bg-bg-surface-raised px-4 py-3">
      <CategoryIcon category={compound.category} className="mt-0.5 h-3.5 w-3.5" />
      <span className="min-w-0 flex-1">
        <span className={cn("block", ROW_NAME)}>{compound.name}</span>
        <span className="mt-0.5 block truncate text-xs text-text-muted">{parts.join(" · ")}</span>
      </span>
    </li>
  );
}
