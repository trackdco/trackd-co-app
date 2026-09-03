"use client";

import { ArrowRight, ArrowsLeftRight, Camera, PencilSimple, Plus } from "@/components/icons";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { CARD_EYEBROW, SHEET_TITLE } from "@/lib/ui-presets";
import {
  formatPhotoDateRow,
  groupByMonth,
  poseLabel,
  type DayGroup,
  type ProgressPhoto,
} from "@/lib/progress/photos";

/**
 * The progress-photos gallery (Spec 09 addendum) — MacroFactor-style: grouped by
 * month, a row per day showing that day's poses as circular thumbnails, with the
 * date and an edit pencil. Tap a thumbnail to preview it; the pencil edits the
 * day; "Compare" opens before/after; "+" adds.
 *
 * `scope` makes the same sheet serve a SUBSET of the photos — a block's window,
 * opened from its retrospective. When it is set the sheet says whose photos
 * these are and offers the way back out to all of them, because a gallery that
 * silently shows three of your thirty photos is a bug report waiting to happen.
 * `onAdd` and `onEditDay` are optional for the same reason: a look-back surface
 * lends itself to reading, and the block scope leaves the writing where it
 * already lives.
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
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);
  const months = groupByMonth(photos);

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

          <SheetTitle className="sr-only">Progress photos</SheetTitle>
          <SheetDescription className="sr-only">
            Your progress photos by month and day.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <div className="flex items-start justify-between gap-2 pb-1">
              <div className="min-w-0">
                {/* The scope, stated rather than implied, and in three parts:
                    what kind of thing this is, which one, and when. A user on
                    their third comp prep has three blocks called "Comp prep",
                    so the name alone does not identify one. */}
                {scope && <p className={CARD_EYEBROW}>{scope.eyebrow}</p>}
                <h2 className={cn(SHEET_TITLE, scope && "mt-1.5")}>
                  {scope?.title ?? "Progress photos"}
                </h2>
                {scope && (
                  <p className="mt-1 text-sm text-text-muted">{scope.caption}</p>
                )}
              </div>
              {onAdd && (
                <button
                  type="button"
                  onClick={onAdd}
                  aria-label="Add a progress photo"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-primary transition-colors hover:bg-bg-surface-raised"
                >
                  <Plus className="h-5 w-5" aria-hidden />
                </button>
              )}
            </div>

            {/* Two photos is the gate, as it always was. Gating on
                `comparablePoses` instead removed Compare from Progress for
                anyone whose poses were each shot once, which was never the ask:
                the chip CULL belongs inside the sheet, and its own fallback
                already covers a set where nothing is comparable. */}
            {photos.length >= 2 && (
              <button
                type="button"
                onClick={onCompare}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border-strong bg-bg-surface-raised py-3 text-sm font-medium text-text-primary transition-colors hover:bg-bg-input/60"
              >
                <ArrowsLeftRight className="h-4 w-4" aria-hidden />
                Compare before &amp; after
              </button>
            )}

            {photos.length === 0 ? (
              onAdd ? (
                <button
                  type="button"
                  onClick={onAdd}
                  className="mt-4 flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-bg-input/40 py-12 text-center transition-colors hover:bg-bg-input/70"
                >
                  <Camera className="h-8 w-8 text-text-muted" aria-hidden />
                  <span className="text-sm text-text-muted">Add your first progress photo</span>
                </button>
              ) : (
                /* A scope with nothing in it cannot offer to add, because the
                   photo would land on today and today may sit outside it. */
                <div className="mt-4 flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-bg-input/40 py-12 text-center">
                  <Camera className="h-8 w-8 text-text-muted" aria-hidden />
                  <span className="text-sm text-text-muted">No photos in here yet</span>
                </div>
              )
            ) : (
              <div className="mt-5 space-y-6">
                {months.map((month, mi) => (
                  <div
                    key={month.key}
                    className="animate-shortcut-in"
                    style={{ animationDelay: `${mi * 50}ms` }}
                  >
                    <h3 className={`px-1 ${CARD_EYEBROW}`}>
                      {month.label}
                    </h3>
                    <ul className="mt-2 overflow-hidden rounded-2xl border border-border-default bg-bg-surface-raised">
                      {month.days.map((day, i) => (
                        <li
                          key={day.date}
                          className={cn(i > 0 && "hairline-t")}
                        >
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
              </div>
            )}

            {scope && (
              <button
                type="button"
                onClick={scope.onSeeAll}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm text-text-muted transition-colors hover:text-foreground"
              >
                See all progress photos
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
  const shown = day.photos.slice(0, 3);
  const extra = day.photos.length - shown.length;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-1.5">
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onView(p)}
            aria-label={`Preview ${poseLabel(p.pose)}`}
            className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border-default bg-bg-input"
          >
            {p.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt="" className="h-full w-full object-cover object-top" />
            )}
          </button>
        ))}
        {extra > 0 && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border-default bg-bg-input text-xs font-medium text-text-muted">
            +{extra}
          </span>
        )}
      </div>

      <span className="flex-1 truncate text-right text-sm text-foreground">
        {formatPhotoDateRow(day.date)}
      </span>

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${formatPhotoDateRow(day.date)}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-input text-text-muted transition-colors hover:text-foreground"
        >
          <PencilSimple className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
