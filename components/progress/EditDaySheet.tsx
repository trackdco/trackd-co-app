"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch, Plus, Trash } from "@/components/icons";

import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { ConfirmDialog } from "@/components/feel/ConfirmDialog";
import { ADD_ACTION, PRESS, ROWS, SHEET_TITLE } from "@/lib/ui-presets";
import { dayLong } from "@/lib/format/date";
import { showToast } from "@/lib/toast";
import { posePriority, poseLabel, type ProgressPhoto } from "@/lib/progress/photos";
import { deleteProgressPhoto } from "@/app/(app)/progress/actions";

/**
 * Edit a day's photos (Spec 09 addendum) — view / delete each pose, or add
 * another to the same day. Reached from the gallery row's edit pencil.
 *
 * The one sheet frame (consistency fix #1): the day is the title, with the
 * small "+" at its top right to add a photo to it (fix #21). A delete asks
 * through the one confirm (fix #5) and is confirmed by the toast.
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
  const [confirming, setConfirming] = useState<ProgressPhoto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setConfirming(null);
  }

  const dayPhotos = date
    ? photos
        .filter((p) => p.date === date)
        .sort((a, b) => posePriority(a.pose) - posePriority(b.pose))
    : [];
  const note = dayPhotos.find((p) => p.note)?.note ?? null;
  const title = date ? dayLong(date) : "Edit";

  async function handleDelete(photo: ProgressPhoto) {
    setBusyId(photo.id);
    const res = await deleteProgressPhoto(photo.id);
    setBusyId(null);
    if (res.ok) {
      router.refresh();
      // Its file is gone with it, so there is no Undo to offer.
      showToast("Photo deleted");
    } else {
      showToast("Couldn’t delete. Try again.");
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="View, delete, or add photos for this day."
      desktop="rail"
      header={
        <div className="flex items-center justify-between gap-3">
          <span aria-hidden className={SHEET_TITLE}>
            {title}
          </span>
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add a photo to this day"
            className={cn(ADD_ACTION, "relative before:absolute before:-inset-1.5 before:content-['']")}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      }
    >
      {/* The sections rise in as the sheet lands (feel pass §4). */}
      <div data-sheet-body>
        {note && (
          <p className="mb-4 rounded-xl bg-bg-surface-raised px-4 py-3 text-sm whitespace-pre-wrap text-text-muted">
            {note}
          </p>
        )}

        {dayPhotos.length === 0 ? (
          <p className="text-sm text-text-muted">No photos for this day.</p>
        ) : (
          <ul className={cn(ROWS, "overflow-hidden")}>
            {dayPhotos.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3">
                <button
                  type="button"
                  onClick={() => onView(p)}
                  aria-label={`Preview ${poseLabel(p.pose)}`}
                  className={cn(
                    PRESS.card,
                    "h-16 w-14 shrink-0 overflow-hidden rounded-lg border border-border-default bg-bg-input",
                  )}
                >
                  {p.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="" className="h-full w-full object-cover object-top" />
                  )}
                </button>
                <span className="min-w-0 flex-1 text-sm text-foreground">{poseLabel(p.pose)}</span>
                <button
                  type="button"
                  onClick={() => setConfirming(p)}
                  disabled={busyId === p.id}
                  aria-label={`Delete ${poseLabel(p.pose)}`}
                  className={cn(
                    PRESS.icon,
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-accent-destructive-on-surface disabled:opacity-50",
                  )}
                >
                  {busyId === p.id ? (
                    <CircleNotch className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Delete this photo?"
        line="This can’t be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirming) void handleDelete(confirming);
        }}
      />
    </BottomSheet>
  );
}
