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
 * feed's "+" branches into Write / Markers; tapping an entry opens it READ-ONLY, and Edit is a second, deliberate tap from there.
 * Only one surface is open at a time (feed ⇄ editor) so the sheets never stack;
 * closing the editor returns to the feed.
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
  // Where the viewer was opened FROM. A Calendar deep-link opens it with no feed
  // behind it, and closing used to open a feed the user never asked for.
  const [viewerFromFeed, setViewerFromFeed] = useState(false);
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
    else if (signal.date) openEditor({ mode: "write", initialDate: signal.date });
  });

  // The dashboard's journal card — the WRITE prompt it advertises, for that day.
  useProgressAction("journal-write", (signal) => {
    if (signal.date) openEditor({ mode: "write", initialDate: signal.date });
  });

  function openViewer(entry: JournalEntry, fromFeed = true) {
    setViewerFromFeed(fromFeed);
    setFeedOpen(false);
    setViewing(entry);
  }

  function openEditor(config: EditorConfig) {
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
        onWrite={() => openEditor({ mode: "write", initialDate: todayKey })}
        onMarkers={() => openEditor({ mode: "markers", initialDate: todayKey })}
        onEdit={(entry) => openViewer(entry)}
      />

      <JournalViewSheet
        open={viewing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setViewing(null);
            // Back to where it was opened from, which is not always the feed.
            if (viewerFromFeed) setFeedOpen(true);
          }
        }}
        entry={viewing}
        onEdit={(entry) => {
          setViewing(null);
          openEditor({ mode: "edit", initialDate: entry.date });
        }}
      />

      <JournalEntrySheet
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setFeedOpen(true); // return to the feed
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
