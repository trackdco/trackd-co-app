"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch, Plus, Trash } from "@/components/icons";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { SHEET_TITLE } from "@/lib/ui-presets";
import {
  formatPhotoDateRow,
  posePriority,
  poseLabel,
  type ProgressPhoto,
} from "@/lib/progress/photos";
import { deleteProgressPhoto } from "@/app/(app)/progress/actions";

/**
 * Edit a day's photos (Spec 09 addendum) — view / delete each pose, or add
 * another to the same day. Reached from the gallery row's edit pencil.
 */
export function EditDaySheet({
  open,
  onOpenChange,
  date,
  photos,
  onAdd,
  onView,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  photos: ProgressPhoto[];
  onAdd: () => void;
  onView: (photo: ProgressPhoto) => void;
}) {
  const router = useRouter();
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setConfirmingId(null);
  }

  const dayPhotos = date
    ? photos
        .filter((p) => p.date === date)
        .sort((a, b) => posePriority(a.pose) - posePriority(b.pose))
    : [];

  async function handleDelete(id: string) {
    setBusyId(id);
    const res = await deleteProgressPhoto(id);
    setBusyId(null);
    setConfirmingId(null);
    if (res.ok) router.refresh();
  }

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

          <SheetTitle className="sr-only">Edit photos</SheetTitle>
          <SheetDescription className="sr-only">
            View, delete, or add photos for this day.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <h2 className={SHEET_TITLE}>
              {date ? formatPhotoDateRow(date) : "Edit"}
            </h2>

            {dayPhotos.find((p) => p.note)?.note && (
              <p className="mt-2 rounded-xl bg-bg-surface-raised px-4 py-3 text-sm whitespace-pre-wrap text-text-muted">
                {dayPhotos.find((p) => p.note)?.note}
              </p>
            )}

            {dayPhotos.length === 0 ? (
              <p className="mt-4 text-sm text-text-muted">No photos for this day.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {dayPhotos.map((p) => (
                  <li
                    key={p.id}
                    className="overflow-hidden rounded-xl border border-border-default bg-bg-surface-raised"
                  >
                    <div className="flex items-center gap-3 p-3">
                      <button
                        type="button"
                        onClick={() => onView(p)}
                        aria-label={`Preview ${poseLabel(p.pose)}`}
                        className="h-16 w-14 shrink-0 overflow-hidden rounded-lg border border-border-default bg-bg-input"
                      >
                        {p.url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.url} alt="" className="h-full w-full object-cover object-top" />
                        )}
                      </button>
                      <span className="min-w-0 flex-1 text-sm text-foreground">
                        {poseLabel(p.pose)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmingId((id) => (id === p.id ? null : p.id))}
                        aria-label={`Delete ${poseLabel(p.pose)}`}
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
                          confirmingId === p.id
                            ? "text-accent-destructive"
                            : "text-text-muted hover:text-accent-destructive",
                        )}
                      >
                        <Trash className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    {confirmingId === p.id && (
                      <div className="animate-shortcut-in flex items-center justify-end gap-2 border-t border-border-default px-3 py-2">
                        <span className="mr-auto text-xs text-text-muted">Delete this photo?</span>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text-primary"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          disabled={busyId === p.id}
                          className="flex items-center gap-1.5 rounded-lg bg-accent-destructive px-3 py-1.5 text-xs font-medium text-text-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {busyId === p.id ? <CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash className="h-3.5 w-3.5" aria-hidden />}
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={onAdd}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:border-border-strong hover:text-foreground"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add a photo to this day
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
