"use client";

import { ArrowsLeftRight, Camera, PencilSimple, Plus } from "@/components/icons";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { CARD_TITLE, SHEET_TITLE } from "@/lib/ui-presets";
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
 */
export function ProgressPhotoGallerySheet({
  open,
  onOpenChange,
  photos,
  onAdd,
  onView,
  onCompare,
  onEditDay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: ProgressPhoto[];
  onAdd: () => void;
  onView: (photo: ProgressPhoto) => void;
  onCompare: () => void;
  onEditDay: (date: string) => void;
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
            <div className="flex items-center justify-between gap-2 pb-1">
              <h2 className={SHEET_TITLE}>
                Progress photos
              </h2>
              <button
                type="button"
                onClick={onAdd}
                aria-label="Add a progress photo"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong text-text-primary transition-colors hover:bg-bg-surface-raised"
              >
                <Plus className="h-5 w-5" aria-hidden />
              </button>
            </div>

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
              <button
                type="button"
                onClick={onAdd}
                className="mt-4 flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-bg-input/40 py-12 text-center transition-colors hover:bg-bg-input/70"
              >
                <Camera className="h-8 w-8 text-text-muted" aria-hidden />
                <span className="text-sm text-text-muted">Add your first progress photo</span>
              </button>
            ) : (
              <div className="mt-5 space-y-6">
                {months.map((month, mi) => (
                  <div
                    key={month.key}
                    className="animate-shortcut-in"
                    style={{ animationDelay: `${mi * 50}ms` }}
                  >
                    <h3 className={`px-1 ${CARD_TITLE}`}>
                      {month.label}
                    </h3>
                    <ul className="mt-2 overflow-hidden rounded-2xl border border-border-default bg-bg-surface-raised">
                      {month.days.map((day, i) => (
                        <li
                          key={day.date}
                          className={cn(i > 0 && "border-t border-border-default")}
                        >
                          <DayRow day={day} onView={onView} onEdit={() => onEditDay(day.date)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
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
  onEdit: () => void;
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

      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${formatPhotoDateRow(day.date)}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-input text-text-muted transition-colors hover:text-foreground"
      >
        <PencilSimple className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
