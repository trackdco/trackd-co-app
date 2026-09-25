"use client";

import { ArrowRight, ArrowsLeftRight, PencilSimple, Plus } from "@/components/icons";

import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/layout/BottomSheet";
import {
  ADD_ACTION,
  CARD_EYEBROW,
  PRESS,
  ROWS,
  SECONDARY_BUTTON,
  SHEET_TITLE,
} from "@/lib/ui-presets";
import { dayLong } from "@/lib/format/date";
import {
  groupByMonth,
  poseLabel,
  type DayGroup,
  type ProgressPhoto,
} from "@/lib/progress/photos";

/**
 * The progress-photos gallery (Spec 09 addendum) — MacroFactor-style: grouped by
 * month, a row per day showing that day's poses as circular thumbnails, with the
 * date and an edit pencil. Tap a thumbnail to preview it; the pencil edits the
 * day; "Compare" opens before/after; the "+" at the top right adds.
 *
 * `scope` makes the same sheet serve a SUBSET of the photos — a block's window,
 * opened from its retrospective. When it is set the sheet says whose photos
 * these are and offers the way back out to all of them, because a gallery that
 * silently shows three of your thirty photos is a bug report waiting to happen.
 * `onAdd` and `onEditDay` are optional for the same reason: a look-back surface
 * lends itself to reading, and the block scope leaves the writing where it
 * already lives.
 *
 * The one sheet frame (`BottomSheet`, consistency fix #1).
 */
export function ProgressPhotoGallerySheet({
  open,
  onOpenChange,
  photos,
  onAdd,
  onView,
  onCompare,
  onEditDay,
  scope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: ProgressPhoto[];
  /** Omitted on a read-only scope; the "+" is not rendered without it. */
  onAdd?: () => void;
  onView: (photo: ProgressPhoto) => void;
  onCompare: () => void;
  /** Omitted on a read-only scope; the day's pencil is not rendered without it. */
  onEditDay?: (date: string) => void;
  /** Set when these are a subset of the user's photos rather than all of them. */
  scope?: {
    /** What KIND of subset, e.g. "Block photos". Sits above the title as an
     *  eyebrow, so the title itself is free to be the subset's own name. */
    eyebrow: string;
    /** Replaces the sheet's title. The subset's name, e.g. "Off-season". */
    title: string;
    /** One line placing it, e.g. "5 Jan to 20 Feb". Two blocks can share a
     *  name, so this is what tells one comp prep from the next. */
    caption: string;
    /** The way out to the full set. */
    onSeeAll: () => void;
  };
}) {
  const months = groupByMonth(photos);
  const title = scope?.title ?? "Progress photos";

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Your progress photos by month and day."
      header={
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {/* The scope, stated rather than implied, and in three parts:
                what kind of thing this is, which one, and when. A user on
                their third comp prep has three blocks called "Comp prep",
                so the name alone does not identify one. */}
            {scope && <p className={CARD_EYEBROW}>{scope.eyebrow}</p>}
            <p aria-hidden className={cn(SHEET_TITLE, scope && "mt-1.5")}>{title}</p>
            {scope && <p className="mt-1 text-sm text-text-muted">{scope.caption}</p>}
          </div>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              aria-label="Add a progress photo"
              className={cn(ADD_ACTION, "relative before:absolute before:-inset-1.5 before:content-['']")}
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      }
    >
      {/* Everything under the title rises in as the sheet lands (feel
          pass §4). */}
      <div data-sheet-body>
        {/* Two photos is the gate, as it always was. Gating on
            `comparablePoses` instead removed Compare from Progress for
            anyone whose poses were each shot once, which was never the ask:
            the chip CULL belongs inside the sheet, and its own fallback
            already covers a set where nothing is comparable. */}
        {photos.length >= 2 && (
          <button type="button" onClick={onCompare} className={cn(SECONDARY_BUTTON, "w-full")}>
            <ArrowsLeftRight className="h-4 w-4" aria-hidden />
            Compare before &amp; after
          </button>
        )}

        {photos.length === 0 ? (
          /* A scope with nothing in it cannot offer to add, because the photo
             would land on today and today may sit outside it. */
          <p className="text-sm text-text-muted">No photos yet.</p>
        ) : (
          // The months are direct children of the body, so each one rises
          // in its turn. They used to stagger in on their own.
          <>
            {months.map((month, mi) => (
              <div key={month.key} className={mi === 0 ? "mt-5" : "mt-6"}>
                <h3 className={`px-1 ${CARD_EYEBROW}`}>{month.label}</h3>
                <ul className={cn(ROWS, "mt-2 overflow-hidden")}>
                  {month.days.map((day) => (
                    <li key={day.date}>
                      <DayRow
                        day={day}
                        onView={onView}
                        onEdit={onEditDay ? () => onEditDay(day.date) : undefined}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}

        {scope && (
          <button
            type="button"
            onClick={scope.onSeeAll}
            className={cn(
              PRESS.text,
              "mt-5 flex min-h-11 w-full items-center justify-center gap-2 text-sm text-text-muted transition-colors hover:text-foreground",
            )}
          >
            See all progress photos
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </BottomSheet>
  );
}

function DayRow({
  day,
  onView,
  onEdit,
}: {
  day: DayGroup;
  onView: (photo: ProgressPhoto) => void;
  onEdit?: () => void;
}) {
  // Three places at most, as on the photos card: with more than three photos,
  // two and a "+N", so the date beside them always fits.
  const shown = day.photos.length > 3 ? day.photos.slice(0, 2) : day.photos;
  const extra = day.photos.length - shown.length;
  const when = dayLong(day.date);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-1.5">
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onView(p)}
            aria-label={`Preview ${poseLabel(p.pose)}`}
            className={cn(
              PRESS.card,
              "h-12 w-9 shrink-0 overflow-hidden rounded-lg border border-border-default bg-bg-input",
            )}
          >
            {p.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt="" className="h-full w-full object-cover object-top" />
            )}
          </button>
        ))}
        {extra > 0 && (
          <span className="flex h-12 w-9 shrink-0 items-center justify-center rounded-lg border border-border-default bg-bg-input font-mono text-xs text-text-muted">
            +{extra}
          </span>
        )}
      </div>

      <span className="flex-1 truncate text-right text-sm text-foreground">{when}</span>

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${when}`}
          className={cn(
            PRESS.icon,
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-foreground",
          )}
        >
          <PencilSimple className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
