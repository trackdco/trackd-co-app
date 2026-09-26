"use client";

import { CaretRight } from "@/components/icons";

import { EmptySection, JournalSketch } from "@/components/progress/EmptySection";
import { JournalSavedMark } from "@/components/progress/JournalSavedMark";
import { CARD_EYEBROW, PRESS, ROW_CHEVRON } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";
import { dayShort } from "@/lib/format/date";
import { bodyFirstLine, type JournalEntry } from "@/lib/progress/journal";

/**
 * Journal card on the Progress scroll (Step 5) — the eyebrow title and a preview of
 * the most recent entry: its date, the note's first line, and a few of the dialed
 * marker words as neutral chips. Taps to the feed.
 *
 * Empty on Progress it is the quiet "None yet" card, and its plus opens the
 * journal ready to write (build-brief-final §3.15).
 *
 * Just after a save, a small tick and "Saved" sit beside its title for a
 * couple of seconds (W10): the confirmation in place of a toast.
 */
export function JournalCard({
  entries,
  onOpen,
  onAdd,
  compact = false,
  savedMark = 0,
}: {
  entries: JournalEntry[];
  onOpen: () => void;
  /** The empty card's plus: the journal, open on Write / Markers. */
  onAdd?: () => void;
  /**
   * Progress's two-up grid (spec 08 · part two). The spec dropped the marker
   * chips at this size and invited us to say if that read too thin. It did
   * (Adrian, 2026-07-30), so they are back — as compact word-only chips rather
   * than the full "name value" pairs, which is what actually did not fit. The
   * marker WORD is the part worth glancing at; the marker's name is already
   * implied by the word ("Sleep · Good" reads fine as just "Good" in context,
   * and the full pairing is one tap away inside the journal).
   */
  compact?: boolean;
  /** Bumped by each save made from this section: above 0, the "Saved" tick
   *  shows beside the title (and plays again for each new value). */
  savedMark?: number;
}) {
  const latest = entries[0] ?? null;
  const line = latest ? bodyFirstLine(latest.body) : null;
  const latestPhotoUrl = latest?.attachments.find((a) => a.url)?.url ?? null;
  const title = (
    <span className="flex min-w-0 items-center gap-2">
      <span className={CARD_EYEBROW}>Journal</span>
      {savedMark > 0 ? <JournalSavedMark key={savedMark} /> : null}
    </span>
  );

  if (compact && !latest) {
    return (
      <EmptySection
        title="Journal"
        preview={<JournalSketch />}
        add={{ label: "Write in your journal", onClick: () => (onAdd ?? onOpen)() }}
      />
    );
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open journal"
        className={cn(PRESS.card, "flow-card flex flex-col inst-card p-5 text-left transition-colors hover:bg-bg-surface-raised/40")}
      >
        {title}
        {latest ? (
          <span className="mt-3 flex flex-1 flex-col">
            <span className="block text-sm text-foreground">
              {dayShort(latest.date)}
            </span>
            {line ? (
              <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-muted">
                {line}
              </span>
            ) : null}
            {latest.markers.length > 0 ? (
              <span className="mt-2 flex flex-wrap gap-1">
                {latest.markers.slice(0, 4).map((m) => (
                  <span
                    key={m.markerId}
                    className="rounded-lg bg-bg-input px-1.5 py-0.5 text-[10px] text-foreground"
                  >
                    {m.word}
                  </span>
                ))}
                {latest.markers.length > 4 ? (
                  <span className="self-center text-[10px] text-text-muted">
                    +{latest.markers.length - 4}
                  </span>
                ) : null}
              </span>
            ) : null}
            {/* Entry count fills the card's foot with something true rather than
                whitespace, and is the one number a journal glance wants. */}
            <span className="mt-auto pt-2 text-[11px] text-text-muted">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </span>
          </span>
        ) : (
          <span className="mt-3 flex-1 text-sm text-text-muted">
            Write a note or log how you feel
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open journal"
      className={cn(PRESS.card, "flow-card flex w-full items-start gap-3.5 inst-card p-5 text-left transition-colors hover:bg-bg-surface-raised/40")}
    >
      <span className="min-w-0 flex-1">
        {title}
        {latest ? (
          <>
            <span className="mt-1.5 block text-sm text-foreground">
              {dayShort(latest.date)}
            </span>
            {line && (
              <span className="mt-0.5 block truncate text-xs text-text-muted">{line}</span>
            )}
            {latest.markers.length > 0 && (
              <span className="mt-2 flex flex-wrap gap-1.5">
                {latest.markers.slice(0, 3).map((m) => (
                  <span
                    key={m.markerId}
                    className="rounded-lg bg-bg-input px-2 py-0.5 text-[11px]"
                  >
                    <span className="text-text-muted">{m.name}</span>{" "}
                    <span className="text-foreground">{m.word}</span>
                  </span>
                ))}
                {latest.markers.length > 3 && (
                  <span className="self-center text-[11px] text-text-muted">
                    +{latest.markers.length - 3}
                  </span>
                )}
              </span>
            )}
          </>
        ) : (
          <span className="mt-1.5 block text-sm text-text-muted">
            Write a note or log how you feel
          </span>
        )}
      </span>
      {latestPhotoUrl && (
        <span className="relative mt-0.5 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={latestPhotoUrl}
            alt=""
            className="h-14 w-10 rounded-lg border border-border-default object-cover object-top"
          />
          {(latest?.attachments.length ?? 0) > 1 && (
            <span className="absolute -right-1 -bottom-1 rounded-lg border border-border-strong bg-bg-surface px-1 text-[10px] leading-tight text-text-muted">
              {latest?.attachments.length}
            </span>
          )}
        </span>
      )}
      <CaretRight className={cn(ROW_CHEVRON, "mt-0.5")} aria-hidden />
    </button>
  );
}
