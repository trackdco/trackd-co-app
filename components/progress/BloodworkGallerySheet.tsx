"use client";

import { ImagePlus, Plus } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { formatBloodworkDate, type BloodworkPhoto } from "@/lib/progress/bloodwork";

/**
 * The bloodwork gallery (Step 4, revised) — every panel the user has attached, as
 * dated thumbnails newest-first so they can scan the periods. Tap a thumbnail to
 * view it full; "Attach" adds another. Read-only and neutral.
 */
export function BloodworkGallerySheet({
  open,
  onOpenChange,
  photos,
  onAttach,
  onView,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: BloodworkPhoto[];
  onAttach: () => void;
  onView: (photo: BloodworkPhoto) => void;
}) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);

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

          <SheetTitle className="sr-only">Bloodwork</SheetTitle>
          <SheetDescription className="sr-only">
            Your attached bloodwork photos, newest first.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <div className="flex items-center justify-between gap-3 pb-1">
              <h2 className="font-display text-2xl font-medium text-foreground">
                Bloodwork
              </h2>
              <button
                type="button"
                onClick={onAttach}
                className="flex items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-raised"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Attach
              </button>
            </div>

            {photos.length === 0 ? (
              <button
                type="button"
                onClick={onAttach}
                className="mt-4 flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-bg-input/40 py-12 text-center transition-colors hover:bg-bg-input/70"
              >
                <ImagePlus className="h-8 w-8 text-text-muted" aria-hidden />
                <span className="text-sm text-text-muted">
                  Attach a screenshot of your blood work
                </span>
              </button>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {photos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onView(p)}
                    className="text-left"
                  >
                    <div className="aspect-[3/4] overflow-hidden rounded-xl border border-border-default bg-bg-surface-raised">
                      {p.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.url}
                          alt={`Bloodwork from ${formatBloodworkDate(p.date)}`}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <p className="mt-1.5 font-mono text-xs text-text-muted">
                      {formatBloodworkDate(p.date)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
