"use client";

import { useState } from "react";

import { BloodworkCard } from "@/components/progress/BloodworkCard";
import { BloodworkGallerySheet } from "@/components/progress/BloodworkGallerySheet";
import { AttachBloodworkSheet } from "@/components/progress/AttachBloodworkSheet";
import { BloodworkPhotoViewer } from "@/components/progress/BloodworkPhotoViewer";
import type { BloodworkPhoto } from "@/lib/progress/bloodwork";

/**
 * The Progress bloodwork section (Step 4, revised — a dated photo store). The card
 * is the entry point: its header opens the bloodwork page (gallery of all
 * panels); its photo grows the latest full-screen. Inside the gallery you attach
 * new panels and open any past one. Only one surface is open at a time (gallery ⇄
 * viewer ⇄ attach) so the bottom sheets never stack; the viewer returns to
 * wherever it was opened from.
 */
export function BloodworkSection({
  photos,
  userId,
  todayKey,
}: {
  photos: BloodworkPhoto[];
  userId: string;
  todayKey: string;
}) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [viewing, setViewing] = useState<BloodworkPhoto | null>(null);
  const [returnToGallery, setReturnToGallery] = useState(false);

  function closeViewer() {
    setViewing(null);
    if (returnToGallery) setGalleryOpen(true);
    setReturnToGallery(false);
  }

  return (
    <>
      <BloodworkCard
        photos={photos}
        onOpen={() => setGalleryOpen(true)}
        onViewLatest={() => {
          if (photos[0]) {
            setReturnToGallery(false);
            setViewing(photos[0]);
          }
        }}
      />

      <BloodworkGallerySheet
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        photos={photos}
        onAttach={() => {
          setGalleryOpen(false);
          setAttachOpen(true);
        }}
        onView={(photo) => {
          setGalleryOpen(false);
          setReturnToGallery(true);
          setViewing(photo);
        }}
      />

      <BloodworkPhotoViewer
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) closeViewer();
        }}
        photo={viewing}
        onDeleted={closeViewer}
      />

      <AttachBloodworkSheet
        open={attachOpen}
        onOpenChange={setAttachOpen}
        userId={userId}
        todayKey={todayKey}
      />
    </>
  );
}
