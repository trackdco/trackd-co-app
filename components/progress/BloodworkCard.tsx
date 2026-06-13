"use client";

import { ChevronRight, Droplet } from "lucide-react";

import { formatBloodworkDate, type BloodworkPhoto } from "@/lib/progress/bloodwork";

const BADGE =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent-amber/25 bg-accent-amber/10 text-accent-amber";
const LABEL = "text-xs font-medium uppercase tracking-[0.18em] text-text-muted";

/**
 * Bloodwork card on the Progress scroll (Step 4, revised). A leading icon badge
 * gives the section identity; tapping the card opens the bloodwork page. Empty, it
 * invites you to attach a screenshot. Once you've uploaded, it shows the latest
 * photo big — tap the photo to grow it full, the header to open all your panels.
 */
export function BloodworkCard({
  photos,
  onOpen,
  onViewLatest,
}: {
  photos: BloodworkPhoto[];
  /** Open the bloodwork page (gallery of all panels). */
  onOpen: () => void;
  /** Grow the latest photo full-screen. */
  onViewLatest: () => void;
}) {
  if (photos.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open bloodwork"
        className="flex w-full items-center gap-3.5 rounded-2xl border border-border-default bg-bg-surface p-5 text-left transition-colors hover:bg-bg-surface-raised/40"
      >
        <span className={BADGE} aria-hidden>
          <Droplet className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${LABEL}`}>Bloodwork</span>
          <span className="mt-1 block text-sm text-text-muted">
            Attach a screenshot of your blood work
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
      </button>
    );
  }

  const latest = photos[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-surface">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open bloodwork"
        className="flex w-full items-center gap-3.5 px-5 pt-5 pb-3.5 text-left transition-colors hover:bg-bg-surface-raised/30"
      >
        <span className={BADGE} aria-hidden>
          <Droplet className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${LABEL}`}>Bloodwork</span>
          <span className="mt-0.5 block text-xs text-text-muted">
            {photos.length} {photos.length === 1 ? "panel" : "panels"}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
      </button>

      {/* Latest photo — tap to grow it full. */}
      <button
        type="button"
        onClick={onViewLatest}
        aria-label={`View bloodwork from ${formatBloodworkDate(latest.date)}`}
        className="block w-full px-5 pb-5"
      >
        <span className="block overflow-hidden rounded-xl border border-border-default bg-bg-surface-raised">
          {latest.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={latest.url}
              alt=""
              className="aspect-[4/3] w-full object-cover object-top"
            />
          )}
        </span>
        <span className="mt-2 block font-mono text-xs text-text-muted">
          {formatBloodworkDate(latest.date)}
        </span>
      </button>
    </div>
  );
}
