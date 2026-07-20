"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { SHEET_TITLE } from "@/lib/ui-presets";
import {
  dateKeyDaysApart,
  formatPhotoDateShort,
  posePriority,
  poseLabel,
  type ProgressPhoto,
} from "@/lib/progress/photos";

/**
 * Before / after compare (Spec 09 addendum) — pick a pose, then a "before" and an
 * "after" photo from that pose's timeline, shown side by side with the gap
 * between them. Defaults to the oldest vs the newest of the most-photographed
 * pose.
 */
export function ComparePhotosSheet({
  open,
  onOpenChange,
  photos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: ProgressPhoto[];
}) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);

  const byPose = (poseId: string) =>
    (poseId === "all" ? photos : photos.filter((p) => p.pose === poseId))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date)); // oldest → newest

  const presentPoses = [...new Set(photos.map((p) => p.pose))].sort(
    (a, b) => posePriority(a) - posePriority(b),
  );
  // Prefer a pose with ≥2 photos so before/after is meaningful.
  const defaultPose =
    presentPoses.find((id) => byPose(id).length >= 2) ?? presentPoses[0] ?? "all";

  const [poseFilter, setPoseFilter] = useState(defaultPose);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const list = byPose(defaultPose);
      setPoseFilter(defaultPose);
      setBeforeId(list[0]?.id ?? null);
      setAfterId(list[list.length - 1]?.id ?? null);
    }
  }

  function changePose(poseId: string) {
    const list = byPose(poseId);
    setPoseFilter(poseId);
    setBeforeId(list[0]?.id ?? null);
    setAfterId(list[list.length - 1]?.id ?? null);
  }

  const list = byPose(poseFilter);
  const before = list.find((p) => p.id === beforeId) ?? list[0] ?? null;
  const after = list.find((p) => p.id === afterId) ?? list[list.length - 1] ?? null;
  const daysApart =
    before && after ? dateKeyDaysApart(before.date, after.date) : 0;

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

          <SheetTitle className="sr-only">Compare progress photos</SheetTitle>
          <SheetDescription className="sr-only">
            Compare a before and after photo for a pose.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <h2 className={SHEET_TITLE}>Compare</h2>

            {/* Pose filter */}
            {presentPoses.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {presentPoses.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => changePose(id)}
                    aria-pressed={poseFilter === id}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      poseFilter === id
                        ? "border-border-strong bg-bg-surface-raised text-foreground"
                        : "border-border-default text-text-muted hover:text-foreground",
                    )}
                  >
                    {poseLabel(id)}
                  </button>
                ))}
              </div>
            )}

            {/* Side-by-side */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ComparePane label="Before" photo={before} />
              <ComparePane label="After" photo={after} />
            </div>
            {daysApart > 0 && (
              <p className="mt-2.5 text-center font-mono text-sm text-text-muted">
                {daysApart} {daysApart === 1 ? "day" : "days"} apart
              </p>
            )}

            {/* Pickers */}
            <div className="mt-4 space-y-3">
              <PhotoStrip
                heading="Before"
                photos={list}
                selectedId={before?.id ?? null}
                onSelect={setBeforeId}
              />
              <PhotoStrip
                heading="After"
                photos={list}
                selectedId={after?.id ?? null}
                onSelect={setAfterId}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ComparePane({ label, photo }: { label: string; photo: ProgressPhoto | null }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <div className="aspect-[3/4] overflow-hidden rounded-xl border border-border-default bg-bg-surface-raised">
        {photo?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt={label} className="h-full w-full object-cover object-top" />
        )}
      </div>
      {photo && (
        <p className="mt-1.5 font-mono text-[11px] text-text-muted">
          {formatPhotoDateShort(photo.date)}
        </p>
      )}
    </div>
  );
}

function PhotoStrip({
  heading,
  photos,
  selectedId,
  onSelect,
}: {
  heading: string;
  photos: ProgressPhoto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-subtle">
        {heading}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            aria-pressed={selectedId === p.id}
            className={cn(
              "h-16 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
              selectedId === p.id ? "border-accent-primary" : "border-border-default",
            )}
            aria-label={`${poseLabel(p.pose)} ${formatPhotoDateShort(p.date)}`}
          >
            {p.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt="" className="h-full w-full object-cover object-top" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
