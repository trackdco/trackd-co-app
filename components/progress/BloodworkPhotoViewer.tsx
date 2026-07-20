"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch, Trash } from "@/components/icons";

import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { formatBloodworkDate, type BloodworkPhoto } from "@/lib/progress/bloodwork";
import { deleteBloodworkPhoto } from "@/app/(app)/progress/actions";

/**
 * Full view of one bloodwork photo (Step 4, revised) — the image at full size on
 * the Obsidian canvas with its draw date, and a delete (two-tap confirm). Read
 * via a short-lived signed URL.
 */
export function BloodworkPhotoViewer({
  open,
  onOpenChange,
  photo,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: BloodworkPhoto | null;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);

  // Retain through the close animation so the body doesn't blank.
  const [shown, setShown] = useState<BloodworkPhoto | null>(photo);
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
    const res = await deleteBloodworkPhoto(shown.id);
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
            {shown ? `Bloodwork from ${formatBloodworkDate(shown.date)}` : "Bloodwork"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Your attached blood-work photo.
          </SheetDescription>

          {shown && (
            <>
              <div className="flex items-center justify-between gap-3 px-6 pb-2">
                <p className="font-mono text-sm text-foreground">
                  {formatBloodworkDate(shown.date)}
                </p>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  aria-label="Delete this photo"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:text-accent-destructive"
                >
                  <Trash className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                {shown.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shown.url}
                    alt={`Bloodwork from ${formatBloodworkDate(shown.date)}`}
                    className="mx-auto w-full rounded-xl object-contain"
                  />
                ) : (
                  <p className="py-10 text-center text-sm text-text-muted">
                    Couldn&apos;t load this image.
                  </p>
                )}

                {shown.note && (
                  <p className="mt-3 rounded-xl bg-bg-surface-raised px-4 py-3 text-sm whitespace-pre-wrap text-foreground">
                    {shown.note}
                  </p>
                )}

                {error && (
                  <p className="mt-3 px-1 text-sm text-state-error">{error}</p>
                )}
              </div>

              {confirming ? (
                <div className="shrink-0 border-t border-border-default px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                  <p className="text-sm text-foreground">
                    Delete this bloodwork photo? This can&apos;t be undone.
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
                      {busy ? <CircleNotch className="h-4 w-4 animate-spin" aria-hidden /> : <Trash className="h-4 w-4" aria-hidden />}
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
