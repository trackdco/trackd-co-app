"use client";

import { CaretRight } from "@/components/icons";

import { BloodsSketch, EmptySection } from "@/components/progress/EmptySection";
import { CARD, CARD_EYEBROW, PRESS, ROW_CHEVRON } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";
import { dayShort } from "@/lib/format/date";
import type { BloodworkPhoto } from "@/lib/progress/bloodwork";

/**
 * Bloodwork card on the Progress scroll (Step 4, revised). The card leads with its
 * eyebrow (no icon badge); tapping it opens the bloodwork page. Once you've
 * uploaded, it shows the latest photo big — tap the photo to grow it full, the
 * header to open all your panels.
 *
 * Empty on Progress it is the quiet "None yet" card, and its plus starts
 * attaching a report (build-brief-final §3.15). The two-up card's eyebrow is
 * "Bloods", as the final-check page draws it; every sentence says "bloodwork"
 * (consistency fix #7).
 */
export function BloodworkCard({
  photos,
  onOpen,
  onViewLatest,
  onAttach,
  compact = false,
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
}) {
  if (compact && photos.length === 0) {
    return (
      <EmptySection
        title="Bloods"
        preview={<BloodsSketch />}
        add={{ label: "Attach bloodwork", onClick: () => (onAttach ?? onOpen)() }}
      />
    );
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={onViewLatest}
        aria-label="View latest bloodwork"
        className={cn(PRESS.card, "flow-card flex flex-col inst-card p-5 text-left transition-colors hover:bg-bg-surface-raised/40")}
      >
        <span className={`block ${CARD_EYEBROW}`}>Bloods</span>
        <span className="mt-3 block flex-1 overflow-hidden rounded-xl bg-bg-surface-raised">
          {photos[0].url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photos[0].url}
              alt=""
              className="h-full min-h-24 w-full object-cover object-top"
            />
          )}
        </span>
        <span className="mt-2 block font-mono text-xs text-text-muted">
          {dayShort(photos[0].date)}
        </span>
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
          <span className="mt-1.5 block text-sm text-text-muted">
            Attach a screenshot of your bloodwork
          </span>
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
        aria-label={`View bloodwork from ${dayShort(latest.date)}`}
        className={cn(PRESS.card, "block w-full px-5 pb-5")}
      >
        <span className="block overflow-hidden rounded-xl border border-border-default bg-bg-surface-raised">
          {latest.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={latest.url}
              alt=""
              className="aspect-[4/3] w-full object-cover object-top"
            />
          )}
        </span>
        <span className="mt-2 block font-mono text-xs text-text-muted">
          {dayShort(latest.date)}
        </span>
      </button>
    </div>
  );
}
