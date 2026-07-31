"use client";

import { useRef, useState, type ReactNode } from "react";
import { CaretRight } from "@/components/icons";

import { cn } from "@/lib/utils";
import { CARD_EYEBROW } from "@/lib/ui-presets";
import {
  formatPhotoDate,
  latestDay,
  poseLabel,
  type ProgressPhoto,
} from "@/lib/progress/photos";
import { formatWeight, type WeightUnit } from "@/lib/weight";

/**
 * Progress photos card on the Progress scroll (Spec 09 addendum). The latest
 * session shown big, in catalogue order (Front first), as a swipeable carousel. Swipe to the
 * other poses; tap a photo to preview it; tap the header to open the gallery
 * (where you add / edit). Each photo carries the weight logged that day.
 */
export function ProgressPhotoCard({
  photos,
  unit,
  onOpen,
  onView,
  compact = false,
  footer,
}: {
  photos: ProgressPhoto[];
  unit: WeightUnit;
  onOpen: () => void;
  onView: (photo: ProgressPhoto) => void;
  /** Home glance: render the photo shorter so the card doesn't dominate. */
  compact?: boolean;
  /**
   * Rendered inside the card below the caption — the "Running" list on Progress
   * (spec 08 · part two). Passed in rather than resolved here so the card stays
   * a photo card: it knows nothing about the protocol, and the list can render
   * null on a day with nothing running without this card knowing that either.
   */
  footer?: ReactNode;
}) {
  const day = latestDay(photos);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  }

  if (photos.length === 0 || !day) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open progress photos"
        className="flex w-full items-center gap-3.5 rounded-2xl bg-bg-surface p-5 text-left transition-colors hover:bg-bg-surface-raised/40"
      >
        <span className="min-w-0 flex-1">
          <span className={`block ${CARD_EYEBROW}`}>Progress photos</span>
          <span className="mt-1.5 block text-sm text-text-muted">
            Add your first photo to track how you look
          </span>
        </span>
        <CaretRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-bg-surface">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open progress photos"
        className="flex w-full items-center gap-3.5 px-5 pt-5 pb-3.5 text-left transition-colors hover:bg-bg-surface-raised/30"
      >
        <span className="min-w-0 flex-1">
          {/* No count line (Adrian, 2026-07-30). "14 photos" is a fact about
              the database, not about the user: the photo is right below it, the
              date is under that, and the number told them nothing they wanted. */}
          <span className={`block ${CARD_EYEBROW}`}>Progress photos</span>
        </span>
        <CaretRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
      </button>

      {/* Latest session — swipe between the day's poses. */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {day.photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onView(p)}
            aria-label={`Preview ${poseLabel(p.pose)}`}
            className="w-full shrink-0 snap-center px-5 pb-2 text-left"
          >
            <span
              className={cn(
                "block overflow-hidden rounded-xl border border-border-default bg-bg-surface-raised",
                compact ? "h-56" : "aspect-[3/4]",
              )}
            >
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.url}
                  alt=""
                  /* Only the photo actually on screen is fetched. The carousel
                     used to pull every pose of the day at once, at full upload
                     resolution, before you had swiped to any of them. */
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : "auto"}
                  /* Decoded off the main thread, and REVEALED only once decoded.
                     A baseline JPEG paints top-down as bytes arrive, so a slow
                     connection showed a head and then a torn-off band of
                     background — which reads as a corrupt photo, not a loading
                     one (Adrian, 2026-07-31). */
                  decoding="async"
                  /* A cached image can be `complete` BEFORE React attaches the
                     handler — on a back-navigation nothing would ever fire
                     `load`, and the photo would sit at zero opacity for good. So
                     the ref checks, and `onLoad` covers the uncached case. */
                  ref={(el) => {
                    if (el?.complete) el.classList.remove("opacity-0")
                  }}
                  onLoad={(e) => e.currentTarget.classList.remove("opacity-0")}
                  className={cn(
                    "h-full w-full object-cover object-top opacity-0",
                    "transition-opacity duration-300 ease-out motion-reduce:transition-none",
                  )}
                />
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Caption + swipe dots for the active photo — pose label sits directly
          above the date (weight · date), not railed opposite it. */}
      <div className="px-5 pb-5">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">
            {poseLabel(day.photos[active]?.pose ?? day.photos[0].pose)}
          </p>
          <p className="mt-0.5 font-mono text-xs text-text-muted">
            {day.photos[active]?.weightKg != null && (
              <>
                {formatWeight(day.photos[active]!.weightKg!, unit)} {unit} ·{" "}
              </>
            )}
            {formatPhotoDate(day.date)}
          </p>
        </div>
        {day.photos.length > 1 && (
          <div className="mt-2.5 flex justify-center gap-1.5">
            {day.photos.map((p, i) => (
              <span
                key={p.id}
                aria-hidden
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === active ? "w-4 bg-foreground" : "w-1.5 bg-border-strong",
                )}
              />
            ))}
          </div>
        )}
      </div>

      {footer}
    </div>
  );
}
