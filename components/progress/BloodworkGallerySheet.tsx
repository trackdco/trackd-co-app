"use client";

import { Plus } from "@/components/icons";

import { BottomSheet } from "@/components/layout/BottomSheet";
import { ADD_ACTION, PRESS, SHEET_TITLE } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";
import { dayShort } from "@/lib/format/date";
import type { BloodworkPhoto } from "@/lib/progress/bloodwork";

/**
 * The bloodwork gallery (Step 4, revised) — every panel the user has attached, as
 * dated thumbnails newest-first so they can scan the periods. Tap a thumbnail to
 * view it full; the "+" at the top right attaches another. Read-only and
 * neutral. The one sheet frame (consistency fix #1).
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
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Bloodwork"
      description="Your attached bloodwork photos, newest first."
      header={
        <div className="flex items-center justify-between gap-3">
          <span aria-hidden className={SHEET_TITLE}>
            Bloodwork
          </span>
          <button
            type="button"
            onClick={onAttach}
            aria-label="Attach bloodwork"
            className={cn(ADD_ACTION, "relative before:absolute before:-inset-1.5 before:content-['']")}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      }
    >
      {/* The contents rise in as the sheet lands (feel pass §4): the
          empty line as one piece, the photos one by one. */}
      {photos.length === 0 ? (
        <div data-sheet-body>
          <p className="text-sm text-text-muted">No bloodwork yet.</p>
        </div>
      ) : (
        <div data-sheet-body className="grid grid-cols-2 gap-3">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onView(p)}
              className={cn(PRESS.card, "text-left")}
            >
              <div className="aspect-[3/4] overflow-hidden rounded-xl border border-border-default bg-bg-surface-raised">
                {p.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.url}
                    alt={`Bloodwork from ${dayShort(p.date)}`}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <p className="mt-1.5 font-mono text-xs text-text-muted">{dayShort(p.date)}</p>
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
