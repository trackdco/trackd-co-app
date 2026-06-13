"use client";

import { ChevronRight, NotebookPen } from "lucide-react";

import { CARD_ICON_BADGE, CARD_TITLE } from "@/lib/ui-presets";
import { formatJournalDate, type JournalEntry } from "@/lib/progress/journal";

function bodyFirstLine(body: string | null): string | null {
  return body?.split("\n").find((l) => l.trim() !== "")?.trim() ?? null;
}

/**
 * Journal card on the Progress scroll (Step 5) — a leading icon badge for
 * identity and a preview of the most recent entry: its date, the note's first
 * line, and a few of the dialed marker words as neutral chips. Taps to the feed.
 */
export function JournalCard({
  entries,
  onOpen,
}: {
  entries: JournalEntry[];
  onOpen: () => void;
}) {
  const latest = entries[0] ?? null;
  const line = latest ? bodyFirstLine(latest.body) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open journal"
      className="flex w-full items-start gap-3.5 rounded-2xl border border-border-default bg-bg-surface p-5 text-left transition-colors hover:bg-bg-surface-raised/40"
    >
      <span className={CARD_ICON_BADGE} aria-hidden>
        <NotebookPen className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block ${CARD_TITLE}`}>Journal</span>
        {latest ? (
          <>
            <span className="mt-1 block text-sm text-foreground">
              {formatJournalDate(latest.date)}
            </span>
            {line && (
              <span className="mt-0.5 block truncate text-xs text-text-muted">{line}</span>
            )}
            {latest.markers.length > 0 && (
              <span className="mt-2 flex flex-wrap gap-1.5">
                {latest.markers.slice(0, 3).map((m) => (
                  <span
                    key={m.markerId}
                    className="rounded-full bg-bg-input px-2 py-0.5 text-[11px]"
                  >
                    <span className="text-text-muted">{m.name}</span>{" "}
                    <span className="text-foreground">{m.word}</span>
                  </span>
                ))}
                {latest.markers.length > 3 && (
                  <span className="self-center text-[11px] text-text-subtle">
                    +{latest.markers.length - 3}
                  </span>
                )}
              </span>
            )}
          </>
        ) : (
          <span className="mt-1 block text-sm text-text-muted">
            Write a note or log how you feel
          </span>
        )}
      </span>
      <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
    </button>
  );
}
