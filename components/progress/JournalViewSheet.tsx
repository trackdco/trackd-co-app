"use client"

import { useRef, useState } from "react"
import { NotePencil } from "@/components/icons"

import { BottomSheet } from "@/components/layout/BottomSheet"
import { ProgressPhotoViewer } from "@/components/progress/ProgressPhotoViewer"
import { CARD_EYEBROW, GHOST_BUTTON, PRESS, SHEET_TITLE } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"
import { dayShort } from "@/lib/format/date"
import { attachmentsAsPhotos, type JournalEntry } from "@/lib/progress/journal"
import type { ProgressPhoto } from "@/lib/progress/photos"

/**
 * READ an entry, then decide whether to edit it (spec 08 · part two, Adrian's
 * note: "I want to be able to actually see my entry ... it should be a preview,
 * and then there is a viewing of the entry, and then you can edit later").
 *
 * Before this, tapping an entry dropped you straight into the editor. That was
 * wrong in three ways at once: reading your own note meant entering an editing
 * session you did not ask for, the marker dialer opened expanded over the text
 * you came to read, and on a FUTURE-dated entry the editor refuses to save while
 * hiding the date field, so the entry could be neither saved nor corrected, only
 * abandoned (open bug 7 in `next-tasks.md`). A read-only view has none of those
 * problems because it writes nothing.
 *
 * Deliberately plain: the entry's date, its markers as they were dialed, its
 * text, and its photos. One action, "Edit", which hands off to the editor that
 * already exists. A photo opens in the photo viewer (consistency fix #1).
 */
export function JournalViewSheet({
  open,
  onOpenChange,
  entry,
  onEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The entry being read. Null while closed; the sheet holds the last one
   *  through its exit animation so it does not empty as it slides away. */
  entry: JournalEntry | null
  onEdit: (entry: JournalEntry) => void
}) {
  // The caller clears `entry` the instant it closes, but the sheet keeps
  // animating out for another 300ms — so it emptied and collapsed in front of
  // you on every close and on every hand-off to the editor. Hold the last one
  // through the exit, using React's documented adjust-state-during-render
  // pattern rather than an effect (which would just paint the empty frame first).
  const [shown, setShown] = useState<JournalEntry | null>(entry)
  if (entry && entry !== shown) setShown(entry)

  const [viewing, setViewing] = useState<ProgressPhoto | null>(null)
  const tiles = useRef(new Map<string, HTMLElement>())
  const photos = shown ? attachmentsAsPhotos(shown.attachments, shown.date) : []
  const title = shown ? dayShort(shown.date) : "Journal entry"

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      desktop="rail"
      header={
        <div className="flex items-center justify-between gap-3">
          <span aria-hidden className={SHEET_TITLE}>
            {shown ? title : ""}
          </span>
          {shown ? (
            <button type="button" onClick={() => onEdit(shown)} className={GHOST_BUTTON}>
              <NotePencil className="h-4 w-4" aria-hidden />
              Edit
            </button>
          ) : null}
        </div>
      }
    >
      {shown ? (
        // Each section rises in as the sheet lands (feel pass §4).
        <div data-sheet-body className="space-y-5 pt-1">
          {shown.markers.length > 0 ? (
            <section>
              <p className={CARD_EYEBROW}>How you felt</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {shown.markers.map((m) => (
                  <li
                    key={m.markerId}
                    className="rounded-lg bg-bg-input px-2.5 py-1 text-[13px]"
                  >
                    <span className="text-text-muted">{m.name}</span>{" "}
                    <span className="text-foreground">{m.word}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {shown.body ? (
            <section>
              <p className={CARD_EYEBROW}>Note</p>
              {/* `whitespace-pre-wrap`: the note is stored with the line
                  breaks the user typed, and this is where they read it
                  back. Collapsing them would silently reformat it. */}
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {shown.body}
              </p>
            </section>
          ) : null}

          {photos.length > 0 ? (
            <section>
              <p className={CARD_EYEBROW}>Photos</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <button
                    key={p.id}
                    ref={(el) => {
                      if (el) tiles.current.set(p.id, el)
                      else tiles.current.delete(p.id)
                    }}
                    type="button"
                    onClick={() => setViewing(p)}
                    aria-label="View photo"
                    className={cn(PRESS.card, "block overflow-hidden rounded-xl")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url ?? undefined}
                      alt=""
                      className="aspect-[3/4] w-full object-cover object-top"
                    />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {!shown.body && shown.markers.length === 0 && photos.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing in this entry yet.</p>
          ) : null}
        </div>
      ) : null}

      <ProgressPhotoViewer
        open={viewing !== null}
        onOpenChange={(o) => {
          if (!o) setViewing(null)
        }}
        photo={viewing}
        photos={photos}
        originFor={(p) => tiles.current.get(p.id) ?? null}
        label={(p) => `Journal · ${dayShort(p.date)}`}
        canDelete={false}
        unit="kg"
        onDeleted={() => setViewing(null)}
      />
    </BottomSheet>
  )
}
