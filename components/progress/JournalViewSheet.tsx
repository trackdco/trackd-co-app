"use client"

import { NotePencil } from "@/components/icons"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { useSheetDrag } from "@/components/home/useSheetDrag"
import { CARD_EYEBROW, SHEET_TITLE } from "@/lib/ui-presets"
import { formatJournalDate, type JournalEntry } from "@/lib/progress/journal"

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
 * already exists.
 */
export function JournalViewSheet({
  open,
  onOpenChange,
  entry,
  onEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The entry being read; null between closing and the next open. */
  entry: JournalEntry | null
  onEdit: (entry: JournalEntry) => void
}) {
  const { cardRef, cardStyle, handleProps } = useSheetDrag(() =>
    onOpenChange(false),
  )

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
            {entry ? formatJournalDate(entry.date) : "Journal entry"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Your journal entry for this day. Read it here; edit it if you want to
            change it.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <div className="flex items-center justify-between gap-3 pb-1">
              <h2 className={SHEET_TITLE}>
                {entry ? formatJournalDate(entry.date) : ""}
              </h2>
              {entry ? (
                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  className="flex items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-raised"
                >
                  <NotePencil className="h-4 w-4" aria-hidden />
                  Edit
                </button>
              ) : null}
            </div>

            {entry ? (
              <div className="mt-5 space-y-5">
                {entry.markers.length > 0 ? (
                  <section>
                    <p className={CARD_EYEBROW}>How you felt</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {entry.markers.map((m) => (
                        <li
                          key={m.markerId}
                          className="rounded-full bg-bg-input px-2.5 py-1 text-[13px]"
                        >
                          <span className="text-text-muted">{m.name}</span>{" "}
                          <span className="text-foreground">{m.word}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {entry.body ? (
                  <section>
                    <p className={CARD_EYEBROW}>Note</p>
                    {/* `whitespace-pre-wrap`: the note is stored with the line
                        breaks the user typed, and this is where they read it
                        back. Collapsing them would silently reformat it. */}
                    <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                      {entry.body}
                    </p>
                  </section>
                ) : null}

                {entry.attachments.length > 0 ? (
                  <section>
                    <p className={CARD_EYEBROW}>Photos</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {entry.attachments.map((a) =>
                        a.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={a.id}
                            src={a.url}
                            alt=""
                            className="aspect-[3/4] w-full rounded-xl object-cover object-top"
                          />
                        ) : null,
                      )}
                    </div>
                  </section>
                ) : null}

                {!entry.body &&
                entry.markers.length === 0 &&
                entry.attachments.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    This entry is empty. Edit it to add a note.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
