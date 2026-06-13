"use client"

import { Camera, ChevronRight } from "lucide-react"

import { CARD_ICON_BADGE, CARD_TITLE } from "@/lib/ui-presets"
import {
  formatPhotoDateShort,
  latestDay,
  type ProgressPhoto,
} from "@/lib/progress/photos"

/** How many thumbnails to show before collapsing the rest into a "+N" tile. */
const MAX_THUMBS = 4

/**
 * Home progress-photos glance — a small, NON-expandable peek at the latest
 * session's photos that taps straight through to the Progress photos (the
 * Progress tab). Nothing opens inline; the whole card just navigates. Kept
 * deliberately separate from the Weight card — a glance, not a merge — so the
 * two stay distinct but both reachable from Home.
 */
export function ProgressPhotosGlanceCard({
  photos,
  onOpen,
}: {
  photos: ProgressPhoto[]
  /** Tap anywhere → the Progress photos. */
  onOpen: () => void
}) {
  const day = latestDay(photos)

  // Empty — a gentle prompt that still taps through to start.
  if (!day) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open progress photos"
        className="flex w-full items-center gap-3.5 rounded-2xl border border-border-default bg-bg-surface p-5 text-left transition-colors hover:bg-bg-surface-raised/40"
      >
        <span className={CARD_ICON_BADGE} aria-hidden>
          <Camera className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${CARD_TITLE}`}>Progress photos</span>
          <span className="mt-1 block text-sm text-text-muted">
            Add your first photo to track how you look
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
      </button>
    )
  }

  const thumbs = day.photos.slice(0, MAX_THUMBS)
  const extra = day.photos.length - thumbs.length

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open progress photos"
      className="w-full overflow-hidden rounded-2xl border border-border-default bg-bg-surface text-left transition-colors hover:bg-bg-surface-raised/30"
    >
      <span className="flex items-center gap-3.5 px-5 pt-5">
        <span className={CARD_ICON_BADGE} aria-hidden>
          <Camera className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${CARD_TITLE}`}>Progress photos</span>
          <span className="mt-0.5 block text-xs text-text-muted">
            Latest · {formatPhotoDateShort(day.date)}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
      </span>

      {/* Mini thumbnails of the latest session — a peek only; the whole card
          navigates, nothing here is independently tappable. */}
      <span className="flex gap-2 px-5 pt-3.5 pb-5">
        {thumbs.map((p, i) => (
          <span
            key={p.id}
            className="relative block w-16 shrink-0 overflow-hidden rounded-lg border border-border-default bg-bg-surface-raised"
          >
            {p.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.url}
                alt=""
                className="aspect-[3/4] w-full object-cover object-top"
              />
            )}
            {/* "+N" on the last tile when the session has more poses. */}
            {i === thumbs.length - 1 && extra > 0 && (
              <span className="absolute inset-0 flex items-center justify-center bg-bg-base/60 text-sm font-medium text-foreground">
                +{extra}
              </span>
            )}
          </span>
        ))}
      </span>
    </button>
  )
}
