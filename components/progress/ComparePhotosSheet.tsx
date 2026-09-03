"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { SHEET_TITLE } from "@/lib/ui-presets";
import {
  comparablePoses,
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
 *
 * `caption` names the set being compared when it is a SUBSET of the user's
 * photos (a block's window). Without it the poses and dates on offer look like
 * every photo the user has, which on a block is a lie by omission.
 */
/**
 * Chips shown before the row collapses: the three default poses' worth of slots.
 *
 * Four was tried first and clipped. A fixed COUNT cannot guarantee a fit, since
 * "Front relaxed" is twice the width of "Back" and a custom pose can be any
 * length, so the row wraps rather than scrolls and this number only decides how
 * often it needs to. At three it is one line for every pose in the catalogue.
 */
const POSE_CAP = 3;

export function ComparePhotosSheet({
  open,
  onOpenChange,
  photos,
  caption,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: ProgressPhoto[];
  /** One line naming the subset, e.g. "Cut down · 5 Jan to 20 Feb". */
  caption?: string;
}) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);

  const byPose = (poseId: string) =>
    (poseId === "all" ? photos : photos.filter((p) => p.pose === poseId))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date)); // oldest → newest

  // Only the poses that can actually carry a before and after. A pose shot once
  // put the same photo in both panes, and padded the row with chips that could
  // not do anything. The fallback keeps the sheet from going empty if it is ever
  // opened on a set where nothing is comparable.
  const allPoses = [...new Set(photos.map((p) => p.pose))].sort(
    (a, b) => posePriority(a) - posePriority(b),
  );
  const comparable = comparablePoses(photos);
  const presentPoses = comparable.length > 0 ? comparable : allPoses;

  /* A pose shot twice in ONE session is offerable (a retake is a legitimate
     pair) but it is a poor thing to OPEN on: the panes show one session, and
     the "N days apart" line, the single signal that would say so, is hidden
     because the gap is zero. So the default prefers a pose photographed on two
     or more days and falls back to the first only when none exists. */
  const spansDays = (poseId: string) =>
    new Set(byPose(poseId).map((p) => p.date)).size > 1;
  const defaultPose =
    presentPoses.find(spansDays) ?? presentPoses[0] ?? "all";

  const [poseFilter, setPoseFilter] = useState(defaultPose);
  /** The chip row collapses past `POSE_CAP`. Someone running the full
   *  bodybuilding catalogue has twenty of these and a scrolling row hid them
   *  with no affordance at all. */
  const [posesExpanded, setPosesExpanded] = useState(false);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const list = byPose(defaultPose);
      setPoseFilter(defaultPose);
      setPosesExpanded(false);
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

  // Which chips are on show. The SELECTED pose is always among them, or a
  // collapsed row would hide the one thing the panes are showing.
  const hiddenPoses = posesExpanded ? 0 : Math.max(0, presentPoses.length - POSE_CAP);
  let visiblePoses = presentPoses;
  if (hiddenPoses > 0) {
    visiblePoses = presentPoses.slice(0, POSE_CAP);
    if (!visiblePoses.includes(poseFilter) && presentPoses.includes(poseFilter)) {
      visiblePoses = [...visiblePoses.slice(0, POSE_CAP - 1), poseFilter];
    }
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
            {caption && <p className="mt-1 text-sm text-text-muted">{caption}</p>}

            {/* Pose filter. Capped and wrapped rather than a row that scrolls
                off the edge: the old row clipped its fourth chip mid-word and
                said nothing about the seven behind it. */}
            {presentPoses.length > 1 && (
              /* Wraps, never scrolls. A scrolling row put chips off the edge of
                 the phone with nothing to say they were there, which is the
                 whole reason this control was rebuilt. */
              <div className="mt-3 flex flex-wrap gap-2 pb-1">
                {visiblePoses.map((id) => (
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
                {hiddenPoses > 0 && (
                  <button
                    type="button"
                    onClick={() => setPosesExpanded(true)}
                    className="shrink-0 rounded-full border border-dashed border-border-strong px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-surface-raised"
                  >
                    {hiddenPoses} more
                  </button>
                )}
                {posesExpanded && presentPoses.length > POSE_CAP && (
                  <button
                    type="button"
                    onClick={() => setPosesExpanded(false)}
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-foreground"
                  >
                    Fewer
                  </button>
                )}
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
