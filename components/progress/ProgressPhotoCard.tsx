"use client";

import type { ReactNode } from "react";
import { CaretRight } from "@/components/icons";

import { CardPlus } from "@/components/progress/EmptySection";
import { cn } from "@/lib/utils";
import {
  CARD,
  CARD_EYEBROW,
  PRESS,
  ROW_CHEVRON,
  ROW_META,
  TILE,
  TILE_LABEL,
} from "@/lib/ui-presets";
import { dayShort } from "@/lib/format/date";
import {
  dayWeightKg,
  photoDayLine,
  photoOverflow,
  photoTiles,
  tileColumns,
  type PhotoOverflow,
  type PhotoTile,
} from "@/lib/progress/photoCard";
import { DEFAULT_POSES, latestDay, poseShortLabel, type ProgressPhoto } from "@/lib/progress/photos";
import type { WeightUnit } from "@/lib/weight";

/**
 * The Progress photos card (build-brief-final §3.15; Adrian's walk, W39). The
 * LATEST day's photos as tiles, 3:4, each labelled with the short name of the
 * pose picked when it was added (D18: the same words the viewer shows), Front,
 * Side and Back first. One to three photos grow to fill the row, so there is
 * never an empty space beside them. More than three: the first three whole,
 * and a long "N more" card under them that opens the viewer at the fourth
 * (`photoOverflow`), where a swipe reaches every photo of the day. Under them
 * one mono line: that day's weight, if one was logged, and the date. Tap a
 * tile to open it; tap the header for the gallery, where you add and edit.
 *
 * A new account gets a quiet "Your first photos" card instead: three clear
 * frames and a small "+" that starts adding. No big button and no privacy line
 * (Adrian, final check round four: "keep progress empty").
 */
export function ProgressPhotoCard({
  photos,
  unit,
  todayKey,
  onOpen,
  onView,
  onAdd,
  tileRef,
  footer,
}: {
  photos: ProgressPhoto[];
  unit: WeightUnit;
  /** Decides whether the date needs its year. */
  todayKey: string;
  /** The header: the gallery. */
  onOpen: () => void;
  /** A tile: the viewer, at that photo. */
  onView: (photo: ProgressPhoto) => void;
  /** The new account's "+": the add flow. */
  onAdd: () => void;
  /** Each tile's element, so the viewer can grow out of it and back. */
  tileRef?: (index: number, el: HTMLElement | null) => void;
  /**
   * Rendered inside the card under the photos: the folded "Running" row.
   * Passed in rather than resolved here so the card stays a photo card: it
   * knows nothing about the protocol, and the row can render null on a day
   * with nothing running without this card knowing that either.
   */
  footer?: ReactNode;
}) {
  const day = latestDay(photos);

  if (!day) {
    return (
      <section aria-label="Your first photos" className={cn(CARD, "p-5")}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={CARD_EYEBROW}>Your first photos</h2>
          <CardPlus label="Add photos" onClick={onAdd} />
        </div>
        <div aria-hidden className="mt-3 grid grid-cols-3 gap-1.5">
          {DEFAULT_POSES.map((p) => (
            <span
              key={p.id}
              className={cn(TILE_LABEL, "flex aspect-[3/4] items-end justify-center rounded-xl pb-2")}
              // A clear frame, not a person (Adrian, final check round two):
              // a faint wash of ink and a faint edge. The wash falls a quarter
              // less than it did (W38: every grey fall 25% softer, same ground).
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--text-primary) 6.375%, transparent), color-mix(in srgb, var(--text-primary) 3%, transparent))",
                boxShadow:
                  "inset 0 0 0 1px color-mix(in srgb, var(--text-primary) 10%, transparent), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 8%, transparent)",
              }}
            >
              {p.label}
            </span>
          ))}
        </div>
      </section>
    );
  }

  const tiles = photoTiles(day.photos);
  const more = photoOverflow(day.photos);
  const line = photoDayLine({ date: day.date, weightKg: dayWeightKg(day.photos), unit, todayKey });

  return (
    <section aria-label="Progress photos" className={cn(CARD, "p-5")}>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open progress photos"
        className={cn(PRESS.text, "-my-3 flex min-h-11 w-full items-center justify-between gap-3 text-left")}
      >
        <span className={CARD_EYEBROW}>Progress photos</span>
        <CaretRight className={ROW_CHEVRON} aria-hidden />
      </button>

      {/* One column per photo, up to three: the tiles fill the row whatever
          the count (W39). Each stays 3:4, so the viewer's growth out of a
          tile lines up exactly. */}
      <div
        className="mt-2.5 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${tileColumns(day.photos)}, minmax(0, 1fr))` }}
      >
        {tiles.map((t, i) => (
          <PhotoTileButton
            key={t.photo.id}
            tile={t}
            date={day.date}
            onView={onView}
            tileRef={tileRef ? (el) => tileRef(i, el) : undefined}
          />
        ))}
      </div>

      {more ? <MorePhotos more={more} date={day.date} onView={onView} /> : null}

      <p className={cn(ROW_META, "mt-2.5")}>{line}</p>

      {footer}
    </section>
  );
}

function PhotoTileButton({
  tile,
  date,
  onView,
  tileRef,
}: {
  tile: PhotoTile;
  date: string;
  onView: (photo: ProgressPhoto) => void;
  tileRef?: (el: HTMLElement | null) => void;
}) {
  const label = poseShortLabel(tile.photo.pose);
  return (
    <button
      ref={tileRef}
      type="button"
      onClick={() => onView(tile.photo)}
      aria-label={`${label}, ${dayShort(date)}`}
      className={cn(PRESS.card, TILE, "relative block aspect-[3/4] overflow-hidden bg-bg-inset")}
    >
      <TileImage url={tile.photo.url} eager={tile.index === 0} />
      {/* A little dark under the label, so it reads on a light photo. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent"
      />
      <span
        aria-hidden
        className="absolute bottom-1.5 left-2 max-w-[calc(100%-1rem)] truncate text-[11px] text-foreground"
      >
        {label}
      </span>
      {/* The tile's pressed-in edge, over the photo (an inset shadow under an
          image is hidden by it). */}
      <span aria-hidden className={cn(TILE, "pointer-events-none absolute inset-0")} />
    </button>
  );
}

/**
 * The photos past the third (W39: "more than three open another way"). A long
 * card under the row, the width of the photos: the first few of them small, how
 * many there are, and a chevron. It opens the viewer at the first of them; the
 * viewer holds the whole day, so a swipe back reaches the three above.
 */
function MorePhotos({
  more,
  date,
  onView,
}: {
  more: PhotoOverflow;
  date: string;
  onView: (photo: ProgressPhoto) => void;
}) {
  const noun = more.count === 1 ? "photo" : "photos";
  return (
    <button
      type="button"
      onClick={() => onView(more.photos[0])}
      aria-label={`${more.count} more ${noun} from ${dayShort(date)}`}
      className={cn(PRESS.card, TILE, "mt-1.5 flex min-h-11 w-full items-center gap-3 py-1.5 pr-3 pl-1.5 text-left")}
    >
      <span aria-hidden className="flex shrink-0 gap-1">
        {more.photos.slice(0, 3).map((p) => (
          <span key={p.id} className="relative block h-8 w-6 overflow-hidden rounded-[5px] bg-bg-inset">
            <TileImage url={p.url} eager={false} />
          </span>
        ))}
      </span>
      <span aria-hidden className="min-w-0 flex-1 truncate text-[13px] text-foreground">
        {more.count} more
      </span>
      <CaretRight className={ROW_CHEVRON} aria-hidden />
    </button>
  );
}

function TileImage({ url, eager }: { url: string | null; eager: boolean }) {
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      /* Decoded off the main thread, and REVEALED only once decoded. A
         baseline JPEG paints top-down as bytes arrive, so a slow connection
         showed a head and then a torn-off band of background, which reads as
         a corrupt photo, not a loading one (Adrian, 2026-07-31). */
      decoding="async"
      /* A cached image can be `complete` BEFORE React attaches the handler; on
         a back-navigation nothing would ever fire `load`, and the photo would
         sit at zero opacity for good. So the ref checks, and `onLoad` covers
         the uncached case. */
      ref={(el) => {
        if (el?.complete) el.classList.remove("opacity-0");
      }}
      onLoad={(e) => e.currentTarget.classList.remove("opacity-0")}
      /* A 404 or an expired signed URL would otherwise leave a perfectly empty
         tile forever: `opacity-0` hides even the browser's broken-image mark.
         Showing it puts the failure back on screen. */
      onError={(e) => e.currentTarget.classList.remove("opacity-0")}
      className="absolute inset-0 h-full w-full object-cover object-top opacity-0 transition-opacity duration-300 ease-out motion-reduce:transition-none"
    />
  );
}
