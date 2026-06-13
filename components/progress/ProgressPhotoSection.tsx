"use client";

import { useState } from "react";

import { ProgressPhotoCard } from "@/components/progress/ProgressPhotoCard";
import { ProgressPhotoGallerySheet } from "@/components/progress/ProgressPhotoGallerySheet";
import { AddProgressPhotoSheet } from "@/components/progress/AddProgressPhotoSheet";
import { EditDaySheet } from "@/components/progress/EditDaySheet";
import { ProgressPhotoViewer } from "@/components/progress/ProgressPhotoViewer";
import { ComparePhotosSheet } from "@/components/progress/ComparePhotosSheet";
import { customPosesIn, type ProgressPhoto } from "@/lib/progress/photos";
import type { WeightUnit } from "@/lib/weight";

type Return = "none" | "gallery" | "edit";

/**
 * The Progress photos section (Spec 09 addendum). The card carousels the latest
 * day; the gallery is the MacroFactor month/day view; from a day you edit
 * (delete / add), and any photo opens full. Only one surface is open at a time;
 * sub-flows return to where they were opened from.
 */
export function ProgressPhotoSection({
  photos,
  userId,
  todayKey,
  unit,
}: {
  photos: ProgressPhoto[];
  userId: string;
  todayKey: string;
  unit: WeightUnit;
}) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDate, setEditDate] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<string | undefined>(undefined);
  const [addReturn, setAddReturn] = useState<Return>("none");
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [viewReturn, setViewReturn] = useState<Return>("none");

  const customPoses = customPosesIn(photos);

  function openAdd(date: string | undefined, ret: Return) {
    setAddDate(date);
    setAddReturn(ret);
    setAddOpen(true);
  }
  function returnTo(target: Return) {
    if (target === "gallery") setGalleryOpen(true);
    else if (target === "edit") setEditOpen(true);
  }

  return (
    <>
      <ProgressPhotoCard
        photos={photos}
        unit={unit}
        onOpen={() => setGalleryOpen(true)}
        onView={(p) => {
          setViewReturn("none");
          setViewing(p);
        }}
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
