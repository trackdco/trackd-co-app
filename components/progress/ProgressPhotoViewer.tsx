"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import {
  formatPhotoDate,
  poseLabel,
  type ProgressPhoto,
} from "@/lib/progress/photos";
import { formatWeight, type WeightUnit } from "@/lib/weight";
import { deleteProgressPhoto } from "@/app/(app)/progress/actions";

/** Full view of one progress photo, with its pose, date, linked weight, and a
 *  two-tap delete. */
export function ProgressPhotoViewer({
  open,
  onOpenChange,
  photo,
  unit,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: ProgressPhoto | null;
  unit: WeightUnit;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);

  const [shown, setShown] = useState<ProgressPhoto | null>(photo);
  if (photo !== null && photo.id !== shown?.id) setShown(photo);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setConfirming(false);
      setError(null);
    }
  }

  async function handleDelete() {
    if (!shown) return;
    setBusy(true);
    setError(null);
    const res = await deleteProgressPhoto(shown.id);
    setBusy(false);
    if (res.ok) {
      onDeleted();
      router.refresh();
    } else {
      setError(res.error ?? "Couldn't delete. Try again.");
    }
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

          <SheetTitle className="sr-only">
            {shown ? `${poseLabel(shown.pose)} — ${formatPhotoDate(shown.date)}` : "Progress photo"}
          </SheetTitle>
          <SheetDescription className="sr-only">Your progress photo.</SheetDescription>

          {shown && (
            <>
              <div className="flex items-center justify-between gap-3 px-6 pb-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{poseLabel(shown.pose)}</p>
                  <p className="font-mono text-xs text-text-muted">
                    {formatPhotoDate(shown.date)}
                    {shown.weightKg != null && (
                      <span className="text-foreground">
                        {" · "}
                        {formatWeight(shown.weightKg, unit)} {unit}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  aria-label="Delete this photo"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-accent-destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                {shown.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shown.url}
                    alt={`${poseLabel(shown.pose)} — ${formatPhotoDate(shown.date)}`}
                    className="mx-auto w-full rounded-xl object-contain"
                  />
                ) : (
                  <p className="py-10 text-center text-sm text-text-muted">
                    Couldn&apos;t load this image.
                  </p>
                )}
                {error && <p className="mt-3 px-1 text-sm text-state-error">{error}</p>}
              </div>

              {confirming ? (
                <div className="animate-shortcut-in shrink-0 border-t border-border-default px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                  <p className="text-sm text-foreground">
                    Delete this photo? This can&apos;t be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                      className="flex-1 rounded-lg border border-border-strong py-2.5 text-sm text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={busy}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent-destructive py-2.5 text-sm font-medium text-text-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="shrink-0 border-t border-border-default px-6 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
                  <SheetClose className="w-full rounded-xl border border-border-strong py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary">
                    Close
                  </SheetClose>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
