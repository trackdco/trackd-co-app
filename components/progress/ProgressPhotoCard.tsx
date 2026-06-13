"use client";

import { useRef, useState } from "react";
import { Camera, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { CARD_ICON_BADGE, CARD_TITLE } from "@/lib/ui-presets";
import {
  formatPhotoDate,
  latestDay,
  poseLabel,
  type ProgressPhoto,
} from "@/lib/progress/photos";
import { formatWeight, type WeightUnit } from "@/lib/weight";

/**
 * Progress photos card on the Progress scroll (Spec 09 addendum). The latest
 * session shown big — Front relaxed first — as a swipeable carousel. Swipe to the
 * other poses; tap a photo to preview it; tap the header to open the gallery
 * (where you add / edit). Each photo carries the weight logged that day.
 */
export function ProgressPhotoCard({
  photos,
  unit,
  onOpen,
  onView,
}: {
  photos: ProgressPhoto[];
  unit: WeightUnit;
  onOpen: () => void;
  onView: (photo: ProgressPhoto) => void;
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
        className="flex w-full items-center gap-3.5 rounded-2xl border border-border-default bg-bg-surface p-5 text-left transition-colors hover:bg-bg-surface-raised/40"
      >
        <span className={CARD_ICON_BADGE} aria-hidden>
          <Camera className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${CARD_TITLE}`}>Progress photos</span>
          <span className="mt-1 block text-sm text-text-muted">
            Add your first photo to track how you look
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-surface">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open progress photos"
        className="flex w-full items-center gap-3.5 px-5 pt-5 pb-3.5 text-left transition-colors hover:bg-bg-surface-raised/30"
      >
        <span className={CARD_ICON_BADGE} aria-hidden>
          <Camera className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${CARD_TITLE}`}>Progress photos</span>
          <span className="mt-0.5 block text-xs text-text-muted">
            {photos.length} {photos.length === 1 ? "photo" : "photos"}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
      </button>

      {/* Latest session — swipe between the day's poses. */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {day.photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onView(p)}
            aria-label={`Preview ${poseLabel(p.pose)}`}
            className="w-full shrink-0 snap-center px-5 pb-2 text-left"
          >
            <span className="block overflow-hidden rounded-xl border border-border-default bg-bg-surface-raised">
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="aspect-[3/4] w-full object-cover object-top" />
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Caption + swipe dots for the active photo. */}
      <div className="px-5 pb-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground">
            {poseLabel(day.photos[active]?.pose ?? day.photos[0].pose)}
          </span>
          <span className="flex items-center gap-2">
            {day.photos[active]?.weightKg != null && (
              <span className="font-mono text-xs text-text-muted">
                {formatWeight(day.photos[active]!.weightKg!, unit)} {unit}
              </span>
            )}
            <span className="font-mono text-xs text-text-muted">{formatPhotoDate(day.date)}</span>
          </span>
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
    </div>
  );
}
