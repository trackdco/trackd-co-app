"use client";

import { useRef, useState } from "react";

import { ProgressPhotoCard } from "@/components/progress/ProgressPhotoCard";
import { ProgressPhotoGallerySheet } from "@/components/progress/ProgressPhotoGallerySheet";
import { AddProgressPhotoSheet } from "@/components/progress/AddProgressPhotoSheet";
import { EditDaySheet } from "@/components/progress/EditDaySheet";
import { ProgressPhotoViewer } from "@/components/progress/ProgressPhotoViewer";
import { ComparePhotosSheet } from "@/components/progress/ComparePhotosSheet";
import { useProgressAction } from "@/components/progress/useProgressAction";
import { PhotoRunningList } from "@/components/progress/PhotoRunningList";
import type { DayLogs } from "@/lib/home/doseLog";
import { customPosesIn, latestDay, type ProgressPhoto } from "@/lib/progress/photos";
import { tileForIndex } from "@/lib/progress/photoCard";
import type { WeightUnit } from "@/lib/weight";
import type { StackCompound } from "@/lib/home/stack";
import { useWriteAccess } from "@/components/billing/ReadOnlyGate";
import { useDeviceToday } from "@/components/home/useDeviceToday";

type Return = "none" | "gallery" | "edit";

/**
 * The Progress photos section (Spec 09 addendum; build-brief-final §3.15). The
 * card shows the latest day as tiles; a tile grows into the viewer, which
 * swipes through that day and shrinks back into the tile. The header opens the
 * gallery (the MacroFactor month/day view); from a day you edit (delete / add),
 * and any photo opens full. A new account's card has a "+" that starts adding.
 * Only one surface is open at a time; sub-flows return to where they were
 * opened from.
 */
export function ProgressPhotoSection({
  photos,
  userId,
  todayKey: serverTodayKey,
  unit,
  compact = false,
  previewStack,
  previewLogs,
}: {
  photos: ProgressPhoto[];
  userId: string;
  todayKey: string;
  unit: WeightUnit;
  /** A glance: leave the Running row off. */
  compact?: boolean;
  /** Dev-preview-only device data for the Running list. */
  previewStack?: StackCompound[];
  previewLogs?: DayLogs;
}) {
  /** Guarded: adding a photo. Viewing, comparing and the gallery are not. */
  const { guard } = useWriteAccess();
  // The DEVICE's today. The page is a server component and its date is UTC:
  // before about 10am in Sydney that is yesterday, so a new session of photos
  // (and the weight logged with it) defaulted to the wrong day. The server's
  // key seeds the first paint; the device corrects it on mount.
  const todayKey = useDeviceToday(serverTodayKey);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDate, setEditDate] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<string | undefined>(undefined);
  const [addReturn, setAddReturn] = useState<Return>("none");
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [viewReturn, setViewReturn] = useState<Return>("none");
  // The card's tiles, so the viewer grows out of the one you tapped and
  // shrinks back into it. Only when opened FROM the card: from the gallery
  // or a day there is no tile on screen to return to.
  const tiles = useRef<(HTMLElement | null)[]>([]);

  const customPoses = customPosesIn(photos);
  const day = latestDay(photos);
  // The day the card is showing. The Running row resolves against THIS date,
  // never today, which is what makes it useful when scrolling back.
  const shownDate = day?.date ?? null;

  // The Calendar's Photos row deep-links here → open the photo gallery.
  useProgressAction("photos-gallery", () => setGalleryOpen(true));

  /**
   * The one funnel that opens the ADD-a-photo sheet. Viewing, comparing and the
   * gallery are all untouched: a read-only account keeps every photo it has and
   * can look at all of them.
   */
  function openAdd(date: string | undefined, ret: Return) {
    guard(() => {
      setAddDate(date);
      setAddReturn(ret);
      setAddOpen(true);
    });
  }
  function returnTo(target: Return) {
    if (target === "gallery") setGalleryOpen(true);
    else if (target === "edit") setEditOpen(true);
  }

  /** The tile a latest-day photo sits on. A photo past the third has none
   *  (it opened from the "N more" card), so the viewer fades for it. */
  function tileFor(p: ProgressPhoto): HTMLElement | null {
    const list = latestDay(photos)?.photos ?? [];
    const i = list.findIndex((x) => x.id === p.id);
    if (i < 0) return null;
    return tiles.current[tileForIndex(i, list.length)] ?? null;
  }

  return (
    <>
      <ProgressPhotoCard
        photos={photos}
        unit={unit}
        todayKey={todayKey}
        onOpen={() => setGalleryOpen(true)}
        onView={(p) => {
          setViewReturn("none");
          setViewing(p);
        }}
        onAdd={() => openAdd(undefined, "none")}
        tileRef={(i, el) => {
          tiles.current[i] = el;
        }}
        footer={
          // Not on a glance: that card is a teaser, and the row belongs to the
          // Progress screen the spec put it on.
          !compact && shownDate ? (
            <PhotoRunningList
              date={shownDate}
              userId={userId}
              sampleStack={previewStack}
              sampleLogs={previewLogs}
            />
          ) : null
        }
      />

      <ProgressPhotoGallerySheet
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        photos={photos}
        onAdd={() => {
          setGalleryOpen(false);
          openAdd(undefined, "gallery");
        }}
        onView={(p) => {
          setGalleryOpen(false);
          setViewReturn("gallery");
          setViewing(p);
        }}
        onCompare={() => {
          setGalleryOpen(false);
          setCompareOpen(true);
        }}
        onEditDay={(date) => {
          setGalleryOpen(false);
          setEditDate(date);
          setEditOpen(true);
        }}
      />

      <EditDaySheet
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setGalleryOpen(true);
        }}
        date={editDate}
        photos={photos}
        onAdd={() => {
          setEditOpen(false);
          openAdd(editDate ?? undefined, "edit");
        }}
        onView={(p) => {
          setEditOpen(false);
          setViewReturn("edit");
          setViewing(p);
        }}
      />

      <ProgressPhotoViewer
        open={viewing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setViewing(null);
            returnTo(viewReturn);
            setViewReturn("none");
          }
        }}
        photo={viewing}
        photos={photos}
        originFor={viewReturn === "none" ? tileFor : undefined}
        unit={unit}
        onDeleted={() => {
          setViewing(null);
          returnTo(viewReturn);
          setViewReturn("none");
        }}
      />

      <ComparePhotosSheet
        open={compareOpen}
        onOpenChange={(o) => {
          setCompareOpen(o);
          if (!o) setGalleryOpen(true);
        }}
        photos={photos}
      />

      <AddProgressPhotoSheet
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) {
            returnTo(addReturn);
            setAddReturn("none");
          }
        }}
        userId={userId}
        todayKey={todayKey}
        customPoses={customPoses}
        initialDate={addDate}
        unit={unit}
      />
    </>
  );
}
