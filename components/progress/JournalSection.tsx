"use client";

import { useState } from "react";

import { JournalCard } from "@/components/progress/JournalCard";
import { JournalFeedSheet } from "@/components/progress/JournalFeedSheet";
import { JournalEntrySheet } from "@/components/progress/JournalEntrySheet";
import { useProgressAction } from "@/components/progress/useProgressAction";
import type { JournalEntry, MarkerCatalogueItem } from "@/lib/progress/journal";

type EditorConfig = { mode: "write" | "markers" | "edit"; initialDate: string };

/**
 * The Progress journal section (Step 5). Card → feed (the journal page). The
 * feed's "+" branches into Write / Markers; tapping an entry opens it to edit.
 * Only one surface is open at a time (feed ⇄ editor) so the sheets never stack;
 * closing the editor returns to the feed.
 */
export function JournalSection({
  entries,
  catalogue,
  todayKey,
}: {
  entries: JournalEntry[];
  catalogue: MarkerCatalogueItem[];
  todayKey: string;
}) {
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedCompose, setFeedCompose] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
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

  function openEditor(config: EditorConfig) {
    setEditor(config);
    setFeedOpen(false);
    setEditorOpen(true);
  }

  return (
    <>
      <JournalCard entries={entries} onOpen={() => setFeedOpen(true)} />

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
        onEdit={(entry) => openEditor({ mode: "edit", initialDate: entry.date })}
      />

      <JournalEntrySheet
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setFeedOpen(true); // return to the feed
        }}
        mode={editor.mode}
        catalogue={catalogue}
        entries={entries}
        todayKey={todayKey}
        initialDate={editor.initialDate}
      />
    </>
  );
}
