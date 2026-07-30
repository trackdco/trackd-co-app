"use client";

import { useState } from "react";

import { JournalCard } from "@/components/progress/JournalCard";
import { JournalFeedSheet } from "@/components/progress/JournalFeedSheet";
import { JournalEntrySheet } from "@/components/progress/JournalEntrySheet";
import { JournalViewSheet } from "@/components/progress/JournalViewSheet";
import { useProgressAction } from "@/components/progress/useProgressAction";
import type { JournalEntry, MarkerOption } from "@/lib/progress/journal";

type EditorConfig = { mode: "write" | "markers" | "edit"; initialDate: string };

/**
 * The Progress journal section (Step 5). Card → feed (the journal page). The
 * feed's "+" branches into Write / Markers; tapping an entry opens it READ-ONLY,
 * and Edit is a second, deliberate tap from there. Only one surface is open at a
 * time (feed ⇄ viewer ⇄ editor) so the sheets never stack.
 *
 * **Closing returns you to where you came from, which is not always the feed.**
 * `returnToFeed` is set once, when a chain STARTS, and carried through
 * viewer → editor, because the answer to "where did this come from" belongs to
 * the chain rather than to each sheet in it. Getting this wrong is not cosmetic:
 * a Calendar deep-link or the dashboard's "How did today go?" opens with no feed
 * behind it, and returning to one drops the user in a journal they never asked
 * for. That is the bug `lib/progress/progressAction.ts` says the separate
 * `journal-write` signal exists to prevent, and it survived the first fix, which
 * only covered the viewer's own close and left every editor close still opening
 * the feed.
 */
export function JournalSection({
  entries,
  options,
  userId,
  todayKey,
  compact = false,
}: {
  entries: JournalEntry[];
  options: MarkerOption[];
  userId: string;
  todayKey: string;
  /** Progress's two-up grid (spec 08 · part two). */
  compact?: boolean;
}) {
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedCompose, setFeedCompose] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  // Reading an entry is its own surface now (spec 08 · part two): tapping one
  // opens it read-only, and Edit is a deliberate second action from there.
  const [viewing, setViewing] = useState<JournalEntry | null>(null);
  // Where this CHAIN was opened from. Set once at the entry point and carried
  // through viewer → editor, so closing any surface in it lands where the user
  // actually started rather than in the feed by default.
  const [returnToFeed, setReturnToFeed] = useState(false);
  const [editor, setEditor] = useState<EditorConfig>({
    mode: "write",
    initialDate: todayKey,
  });

  // The global "+" menu's Journal tile lands here → open the feed with the
  // Write/Markers branch already expanded (the entry then saves to the journal).
  useProgressAction("journal-compose", () => {
    setFeedCompose(true);
    setFeedOpen(true);
  });

  // The Calendar's Journal row deep-links a specific day → open that day's entry
  // to READ. It is a "look back" link from a read-only sheet; landing in an
  // editor was never what it advertised.
  useProgressAction("journal-open", (signal) => {
    const entry = signal.date
      ? entries.find((e) => e.date === signal.date)
      : undefined;
    if (entry) openViewer(entry, false);
    else if (signal.date)
      openEditor({ mode: "write", initialDate: signal.date }, false);
  });

  // The dashboard's journal card — the WRITE prompt it advertises, for that day.
  useProgressAction("journal-write", (signal) => {
    if (signal.date) openEditor({ mode: "write", initialDate: signal.date }, false);
  });

  function openViewer(entry: JournalEntry, fromFeed: boolean) {
    setReturnToFeed(fromFeed);
    setFeedOpen(false);
    setViewing(entry);
  }

  function openEditor(config: EditorConfig, fromFeed: boolean) {
    setReturnToFeed(fromFeed);
    setEditor(config);
    setFeedOpen(false);
    setEditorOpen(true);
  }

  return (
    <>
      <JournalCard entries={entries} onOpen={() => setFeedOpen(true)} compact={compact} />

      <JournalFeedSheet
        open={feedOpen}
        onOpenChange={(o) => {
          setFeedOpen(o);
          if (!o) setFeedCompose(false);
        }}
        composeOnOpen={feedCompose}
        entries={entries}
        onWrite={() => openEditor({ mode: "write", initialDate: todayKey }, true)}
        onMarkers={() => openEditor({ mode: "markers", initialDate: todayKey }, true)}
        onEdit={(entry) => openViewer(entry, true)}
      />

      <JournalViewSheet
        open={viewing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setViewing(null);
            // Back to where it was opened from, which is not always the feed.
            if (returnToFeed) setFeedOpen(true);
          }
        }}
        entry={viewing}
        onEdit={(entry) => {
          setViewing(null);
          // The chain's origin travels with it: editing from a Calendar
          // deep-link must not end up in the feed either.
          openEditor({ mode: "edit", initialDate: entry.date }, returnToFeed);
        }}
      />

      <JournalEntrySheet
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          // Only back to the feed if that is where this chain began.
          if (!open && returnToFeed) setFeedOpen(true);
        }}
        mode={editor.mode}
        options={options}
        entries={entries}
        userId={userId}
        todayKey={todayKey}
        initialDate={editor.initialDate}
      />
    </>
  );
}
