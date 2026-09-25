"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Trash, X } from "@/components/icons";

import { ConfirmDialog } from "@/components/feel/ConfirmDialog";
import { PRESS } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";
import { dayShort } from "@/lib/format/date";
import { showToast } from "@/lib/toast";
import { VIEWER } from "@/lib/progress/viewerGesture";
import type { BloodworkPhoto } from "@/lib/progress/bloodwork";
import { deleteBloodworkPhoto } from "@/app/(app)/progress/actions";

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * One bloodwork photo, full screen (Step 4, revised; consistency fix #1). It
 * follows the progress photo viewer's pattern: black at 93% so the app barely
 * shows, the × at the top left, the date at the top, and the delete at the top
 * right behind the one confirm (fix #5). No "Close" bar: the ×, Escape, or a
 * tap on the dark around the report closes it.
 *
 * A lab report is a document, not a pose, so it is shown at the screen's width
 * and SCROLLS, with any note under it. It does not take the photo viewer's
 * pinch that springs back: a report is read, and a zoom that lets go of the
 * figures you are reading would get in the way.
 *
 * Built on Radix's dialog for the focus trap, the scroll lock and hiding the
 * app from assistive tech, portalled onto `<body>`. Its content carries
 * `data-slot="sheet-content"` so the confirm renders inside it.
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

  const [mounted, setMounted] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  // Retained through the close, so the report does not blank as it leaves.
  const [shown, setShown] = useState<BloodworkPhoto | null>(photo);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMounted(true);
      if (photo) setShown(photo);
      setConfirming(false);
      setBusy(false);
      setError(null);
    }
  } else if (open && photo !== null && photo.id !== shown?.id) {
    setShown(photo);
  }

  const bgRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closing = useRef(false);
  /** The close was ours (×, the dark, Escape): it has animated already. */
  const closedByUs = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  useLayoutEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  // IN: the backdrop fades up, the controls follow, the report settles in.
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    closing.current = false;
    closedByUs.current = false;
    returnFocus.current = document.activeElement as HTMLElement | null;
    animateIn(bgRef.current, topRef.current, bodyRef.current);
  }, [open, mounted]);

  /** Every close of ours goes through here: it animates, THEN tells the caller. */
  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    closedByUs.current = true;
    animateOut(bgRef.current, topRef.current, bodyRef.current).then(() => {
      setMounted(false);
      onOpenChangeRef.current(false);
    });
  }, []);

  // OUT, when the caller closes it (after a delete): a fade, then unmount.
  useEffect(() => {
    if (open || !mounted) return;
    if (closedByUs.current) return;
    closing.current = true;
    let alive = true;
    animateOut(bgRef.current, topRef.current, bodyRef.current).then(() => {
      if (alive) setMounted(false);
    });
    return () => {
      alive = false;
    };
  }, [open, mounted]);

  async function handleDelete() {
    if (!shown) return;
    setBusy(true);
    setError(null);
    const res = await deleteBloodworkPhoto(shown.id);
    setBusy(false);
    if (res.ok) {
      onDeleted();
      router.refresh();
      // Its file is gone with it, so there is no Undo to offer.
      showToast("Photo deleted");
    } else {
      setError(res.error ?? "Couldn’t delete. Try again.");
    }
  }

  /** A tap on the dark around the report (not on it) closes. */
  const onDark = (e: MouseEvent) => {
    if (e.target === e.currentTarget) requestClose();
  };

  if (!mounted || !shown || typeof document === "undefined") return null;

  const title = `Bloodwork · ${dayShort(shown.date)}`;

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
    >
      {createPortal(
        <>
          <DialogPrimitive.Overlay ref={bgRef} className="fixed inset-0 z-[70] bg-black/[0.93]" />
          <DialogPrimitive.Content
            data-slot="sheet-content"
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              closeRef.current?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const back = returnFocus.current;
              if (back && back.isConnected) back.focus({ preventScroll: true });
            }}
            onEscapeKeyDown={(e) => {
              // The confirm closes itself; the viewer stays.
              if (confirming) e.preventDefault();
            }}
            className="fixed inset-0 z-[70] flex flex-col outline-none"
          >
            {/* The top: ×, then the date, then delete. */}
            <div
              ref={topRef}
              className="flex shrink-0 items-center gap-3 px-3 pt-[max(12px,calc(env(safe-area-inset-top)_+_8px))] pb-2"
            >
              <button
                ref={closeRef}
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className={cn(PRESS.button, "inst-ghost flex h-9 w-9 shrink-0 items-center justify-center text-foreground")}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-[13px] leading-snug font-normal text-foreground">
                {title}
              </DialogPrimitive.Title>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={busy}
                aria-label="Delete this photo"
                className={cn(
                  PRESS.button,
                  "inst-ghost flex h-9 w-9 shrink-0 items-center justify-center text-text-muted disabled:opacity-50",
                )}
              >
                <Trash className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* The report at the screen's width, scrolling, and its note. */}
            <div
              ref={bodyRef}
              onClick={onDark}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-[max(20px,calc(env(safe-area-inset-bottom)_+_14px))]"
            >
              <div onClick={onDark} className="mx-auto w-full max-w-md">
                {shown.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shown.url}
                    alt={title}
                    decoding="async"
                    className="w-full rounded-xl bg-black object-contain"
                  />
                ) : (
                  <p className="py-10 text-center text-sm text-text-muted">
                    Couldn’t load this photo.
                  </p>
                )}
                {shown.note ? (
                  <p className="mt-3 text-[13px] leading-snug whitespace-pre-wrap text-foreground">
                    {shown.note}
                  </p>
                ) : null}
                {error ? (
                  <p role="alert" className="mt-3 text-[13px] text-state-error">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>

            <ConfirmDialog
              open={confirming}
              onClose={() => setConfirming(false)}
              title="Delete this photo?"
              line="This can’t be undone."
              confirmLabel="Delete"
              onConfirm={() => void handleDelete()}
            />
          </DialogPrimitive.Content>
        </>,
        document.body,
      )}
    </DialogPrimitive.Root>
  );
}

/** The way in. WAAPI keyframes carry numbers only (`var()` snaps in Safari). */
function animateIn(bg: HTMLElement | null, top: HTMLElement | null, body: HTMLElement | null) {
  const reduce = reduced();
  bg?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 140 : 220, easing: "ease-out" });
  top?.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: reduce ? 140 : 240,
    delay: reduce ? 0 : 140,
    easing: "ease-out",
    fill: "backwards",
  });
  body?.animate(
    reduce
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: "scale(0.96)" },
          { opacity: 1, transform: "none" },
        ],
    { duration: reduce ? 140 : 280, easing: VIEWER.ease },
  );
}

/** The way out: everything fades, the report a touch smaller. */
function animateOut(
  bg: HTMLElement | null,
  top: HTMLElement | null,
  body: HTMLElement | null,
): Promise<void> {
  const reduce = reduced();
  const anims: Animation[] = [];
  for (const el of [bg, top, body]) {
    if (!el) continue;
    el.getAnimations().forEach((a) => a.cancel());
    anims.push(
      el.animate(
        el === body && !reduce
          ? [
              { opacity: 1, transform: "none" },
              { opacity: 0, transform: "scale(0.96)" },
            ]
          : [{ opacity: 1 }, { opacity: 0 }],
        { duration: reduce ? 120 : el === bg ? VIEWER.closeMs : 200, easing: "ease-in", fill: "forwards" },
      ),
    );
  }
  return Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => undefined);
}
