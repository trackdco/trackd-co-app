"use client";

import { CaretRight } from "@/components/icons";

import { EmptySection } from "@/components/progress/EmptySection";
import { CARD, CARD_EYEBROW, PRESS, ROWS, ROW_CHEVRON, ROW_META, TILE } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";
import { dayShort } from "@/lib/format/date";
import { bloodworkDateText, type BloodworkPhoto } from "@/lib/progress/bloodwork";

/**
 * Bloodwork card on the Progress scroll (Step 4, revised). The card leads with its
 * eyebrow (no icon badge); tapping it opens the bloodwork page. Once you've
 * uploaded, it shows the latest photo in a small box (the final-check page's
 * `card("b","Bloods")`: the report in a pressed-in tile, the draw date under it
 * in the mono line every card uses, "12 SEP"). Tap it to grow the report full.
 *
 * Empty on Progress it is the quiet "None yet" card, and its plus starts
 * attaching a report (build-brief-final §3.15). Its picture is a small report
 * in a box, rows of a name and a figure (Adrian's walk, W42: the bare lines it
 * had read as nothing). The two-up card's eyebrow is "Bloods", as the
 * final-check page draws it; every sentence says "bloodwork" (consistency fix #7).
 */
export function BloodworkCard({
  photos,
  onOpen,
  onViewLatest,
  onAttach,
  compact = false,
  todayKey,
}: {
  photos: BloodworkPhoto[];
  /** Open the bloodwork page (gallery of all panels). */
  onOpen: () => void;
  /** Grow the latest photo full-screen. */
  onViewLatest: () => void;
  /** The empty card's plus: attach a report. Falls back to the gallery. */
  onAttach?: () => void;
  /** Progress's two-up grid (spec 08 · part two). */
  compact?: boolean;
  /** The device's today: decides whether a date needs its year. Without it,
   *  the device's year is read. */
  todayKey?: string;
}) {
  const when = (date: string) => (todayKey ? bloodworkDateText(date, todayKey) : dayShort(date));

  if (compact && photos.length === 0) {
    return (
      <EmptySection
        title="Bloods"
        preview={<ReportSketch />}
        add={{ label: "Attach bloodwork", onClick: () => (onAttach ?? onOpen)() }}
      />
    );
  }

  if (compact) {
    const latest = photos[0];
    return (
      <button
        type="button"
        onClick={onViewLatest}
        aria-label={`View bloodwork from ${when(latest.date)}`}
        className={cn(PRESS.card, CARD, "flex flex-col p-5 text-left transition-colors hover:bg-bg-surface-raised/40")}
      >
        <span className={`block ${CARD_EYEBROW}`}>Bloods</span>
        {/* The report in a small pressed-in box. */}
        <span className={cn(TILE, "relative mt-3 block min-h-24 flex-1 overflow-hidden bg-bg-inset")}>
          {latest.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={latest.url}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
          )}
          {/* The tile's edge over the report (an inset shadow under an image
              is hidden by it). */}
          <span aria-hidden className={cn(TILE, "pointer-events-none absolute inset-0")} />
        </span>
        <span className={cn(ROW_META, "mt-2.5 block")}>{when(latest.date)}</span>
      </button>
    );
  }

  if (photos.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open bloodwork"
        className={cn(PRESS.card, "flow-card flex w-full items-center gap-3.5 inst-card p-5 text-left transition-colors hover:bg-bg-surface-raised/40")}
      >
        <span className="min-w-0 flex-1">
          <span className={`block ${CARD_EYEBROW}`}>Bloodwork</span>
          <span className="mt-1.5 block text-sm text-text-muted">None yet</span>
        </span>
        <CaretRight className={ROW_CHEVRON} aria-hidden />
      </button>
    );
  }

  const latest = photos[0];

  return (
    <div className={cn(CARD, "overflow-hidden")}>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open bloodwork"
        className={cn(PRESS.text, "flex w-full items-center gap-3.5 px-5 pt-5 pb-3.5 text-left")}
      >
        <span className="min-w-0 flex-1">
          <span className={`block ${CARD_EYEBROW}`}>Bloodwork</span>
          <span className="mt-1 block text-xs text-text-muted">
            {photos.length} {photos.length === 1 ? "panel" : "panels"}
          </span>
        </span>
        <CaretRight className={ROW_CHEVRON} aria-hidden />
      </button>

      {/* Latest photo — tap to grow it full. */}
      <button
        type="button"
        onClick={onViewLatest}
        aria-label={`View bloodwork from ${when(latest.date)}`}
        className={cn(PRESS.card, "block w-full px-5 pb-5")}
      >
        <span className={cn(TILE, "relative block overflow-hidden bg-bg-inset")}>
          {latest.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={latest.url}
              alt=""
              className="aspect-[4/3] w-full object-cover object-top"
            />
          )}
          <span aria-hidden className={cn(TILE, "pointer-events-none absolute inset-0")} />
        </span>
        <span className={cn(ROW_META, "mt-2.5 block text-left")}>{when(latest.date)}</span>
      </button>
    </div>
  );
}

/** A faint bar in the sketch: token colour only, never text. */
function Bar({ w }: { w: string }) {
  return <span className="block h-1.5 rounded-[3px] bg-border-strong" style={{ width: w }} />;
}

/**
 * The empty card's picture (W42): a small report in a box, the raised
 * rows surface (`ROWS`, radius 12, a lit top edge and dark dividers) holding
 * three rows of a name and a figure. Decoration only.
 */
function ReportSketch() {
  return (
    <span className={cn(ROWS, "block w-full overflow-hidden")}>
      {(
        [
          ["46%", "16%"],
          ["58%", "20%"],
          ["38%", "14%"],
        ] as const
      ).map(([name, figure], i) => (
        <span key={i} className="flex items-center justify-between gap-3 px-2.5 py-[5px]">
          <Bar w={name} />
          <Bar w={figure} />
        </span>
      ))}
    </span>
  );
}
