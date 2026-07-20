"use client";

import { CaretRight } from "@/components/icons";

import { CARD_EYEBROW } from "@/lib/ui-presets";
import { formatJournalDate, type JournalEntry } from "@/lib/progress/journal";

function bodyFirstLine(body: string | null): string | null {
  return body?.split("\n").find((l) => l.trim() !== "")?.trim() ?? null;
}

/**
 * Journal card on the Progress scroll (Step 5) — the eyebrow title and a preview of
 * the most recent entry: its date, the note's first line, and a few of the dialed
 * marker words as neutral chips. Taps to the feed.
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
  const latestPhotoUrl = latest?.attachments.find((a) => a.url)?.url ?? null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open journal"
      className="flex w-full items-start gap-3.5 rounded-2xl bg-bg-surface p-5 text-left transition-colors hover:bg-bg-surface-raised/40"
    >
      <span className="min-w-0 flex-1">
        <span className={`block ${CARD_EYEBROW}`}>Journal</span>
        {latest ? (
          <>
            <span className="mt-1.5 block text-sm text-foreground">
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
            <span className="absolute -right-1 -bottom-1 rounded-full border border-border-strong bg-bg-surface px-1 text-[10px] leading-tight text-text-muted">
              {latest?.attachments.length}
            </span>
          )}
        </span>
      )}
      <CaretRight className="mt-0.5 h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
    </button>
  );
}
