/**
 * THE JOURNAL DRAFT: the pure rules behind Home's in-place journal
 * (`components/home/HomeJournal.tsx`) and the full-page writer
 * (`components/progress/JournalEntrySheet.tsx`). No React, no side effects.
 *
 * A draft is one day's entry being written: the note, the marker rows (rated
 * or not), and photos uploaded but not yet saved. The journal read that fills
 * it can land late, the day can change under it, and an upload can finish after
 * the day it was started on has gone: each of those is a rule here, with a test.
 */

import { wordFor, type EntryMarker, type JournalEntry, type MarkerOption } from "./journal";

/** A marker row on the draft; `tierValue` 0 means added but not rated yet. */
export interface DraftRow {
  markerId: string;
  tierValue: number;
}

/** The rows an entry starts from: its saved markers, in order, all rated. */
export function rowsFromEntry(entry: Pick<JournalEntry, "markers"> | null | undefined): DraftRow[] {
  return (entry?.markers ?? []).map((m) => ({ markerId: m.markerId, tierValue: m.tierValue }));
}

/** What the save sends: only rated rows (the server refuses a 0), in row order. */
export function ratedRows(rows: readonly DraftRow[]): DraftRow[] {
  return rows.filter((r) => Number.isFinite(r.tierValue) && r.tierValue >= 1).map((r) => ({ ...r }));
}

/**
 * A dialer that reports only its RATED markers (`onChange`) keeps the draft's
 * unrated rows: a row it no longer reports as rated stays, not rated, and a
 * newly rated one is added at the end. A dialer that also reports every row
 * (`onRowsChange`) replaces the rows outright, which is how a row leaves.
 */
export function mergeRatedIntoRows(prev: readonly DraftRow[], rated: readonly DraftRow[]): DraftRow[] {
  const byId = new Map(rated.map((r) => [r.markerId, r.tierValue]));
  const out = prev.map((r) => ({ markerId: r.markerId, tierValue: byId.get(r.markerId) ?? 0 }));
  for (const r of rated) {
    if (!out.some((o) => o.markerId === r.markerId)) out.push({ markerId: r.markerId, tierValue: r.tierValue });
  }
  return out;
}

/**
 * The Markers tile's small line (cold review F11): how many are rated, else
 * "Not rated" when rows sit there unrated (after "Add 3"), else "None".
 */
export function markersTileWord(rows: readonly DraftRow[]): string {
  const rated = ratedRows(rows).length;
  if (rated > 0) return `${rated} noted`;
  return rows.length > 0 ? "Not rated" : "None";
}

/**
 * The note once the journal read lands (cold review B5). Typing done while the
 * read was in flight is never thrown away:
 * - nothing typed (`typed` null or blank): the day's saved note;
 * - nothing saved for the day: what was typed;
 * - both: the saved note, a blank line, then what was typed, so neither is
 *   lost and the save cannot write over the day's note unseen.
 */
export function mergeTypedNote(saved: string | null | undefined, typed: string | null): string {
  const s = saved ?? "";
  if (typed === null || typed.trim() === "") return s;
  if (s.trim() === "" || typed === s) return typed;
  if (typed.startsWith(s)) return typed;
  return `${s.replace(/\s+$/, "")}\n\n${typed}`;
}

/**
 * What the draft holds when the journal read lands (cold review B5): the entry
 * for the day shown NOW (which may have changed while the read was in flight),
 * never the day the card was opened on; the note typed meanwhile kept.
 */
export function draftOnRead(
  entries: readonly JournalEntry[],
  dayNow: string,
  typed: string | null,
): { body: string; rows: DraftRow[] } {
  const entry = entries.find((e) => e.date === dayNow) ?? null;
  return { body: mergeTypedNote(entry?.body, typed), rows: rowsFromEntry(entry) };
}

/**
 * Why Save cannot save right now, in the words the screen shows beside it, or
 * null when it can. A Save is never dead without a reason on screen
 * (Adrian's ruling 10, "no broken functions").
 * - The read has not landed: a save now would write over the day's markers.
 * - The read failed: the same, and the card says so with a way to try again.
 * - A photo is still uploading.
 * - Nothing to save: no note, no rated marker, no photo.
 */
export function journalSaveBlock(d: {
  read: "loading" | "failed" | "ready";
  uploading: boolean;
  body: string;
  rows: readonly DraftRow[];
  photoCount: number;
  /** False where there is no note to write (the writer's "Log markers"). */
  noteShown?: boolean;
}): string | null {
  const note = d.noteShown !== false;
  if (d.read === "loading") return "Loading your journal…";
  if (d.read === "failed") return "Couldn’t load your journal.";
  if (d.uploading) return "Adding your photo…";
  if ((note && d.body.trim() !== "") || ratedRows(d.rows).length > 0 || d.photoCount > 0) return null;
  if (d.rows.length > 0) return note ? "Rate a marker, or add a note, to save." : "Rate a marker to save.";
  return note ? "Add a note, a marker or a photo first." : "Add a marker or a photo first.";
}

/**
 * The draft as a comparable string: Save shows "Saved" while the draft is
 * exactly what was last saved (the same day, note and ratings, and no photo
 * waiting), and "Save" again after any change (W10).
 */
export function draftSnapshot(d: { date: string; body: string; rows: readonly DraftRow[] }): string {
  return JSON.stringify([d.date, d.body, ratedRows(d.rows).map((r) => [r.markerId, r.tierValue])]);
}

/** True while the draft is what was last saved and nothing waits to be sent. */
export function isSavedDraft(
  savedSnapshot: string | null,
  d: { date: string; body: string; rows: readonly DraftRow[] },
  waiting: number,
): boolean {
  return savedSnapshot !== null && waiting === 0 && savedSnapshot === draftSnapshot(d);
}

/**
 * THE DAY AN UPLOAD BELONGS TO (cold review S8). Every draft carries a ticket,
 * bumped when the day changes, the card closes or reopens, or the entry saves.
 * An upload remembers the ticket it started under; one that lands under
 * another ticket is taken back out of the bucket, never attached to the day
 * now shown.
 */
export function uploadLands(startedUnder: number, ticketNow: number): "attach" | "discard" {
  return startedUnder === ticketNow ? "attach" : "discard";
}

/**
 * The journal as it stands just after a save, without reading it again: the
 * day's entry replaced (or added) with what was saved, so the card can stay
 * where it is, showing the entry, with "Saved" on its button (W10). Photos
 * saved this time keep their local preview and their place after the ones
 * already there (where the card drew them); the next open reads the journal
 * afresh, newest first again.
 */
export function entriesAfterSave(
  entries: readonly JournalEntry[],
  saved: {
    date: string;
    body: string;
    rows: readonly DraftRow[];
    options: readonly MarkerOption[];
    photosAdded: readonly { id: string; url: string | null }[];
  },
): JournalEntry[] {
  const before = entries.find((e) => e.date === saved.date) ?? null;
  const byId = new Map(saved.options.map((o) => [o.id, o]));
  const markers: EntryMarker[] = ratedRows(saved.rows).map((r) => {
    const o = byId.get(r.markerId);
    const was = before?.markers.find((m) => m.markerId === r.markerId);
    return {
      markerId: r.markerId,
      name: o?.name ?? was?.name ?? "",
      tierValue: r.tierValue,
      word: o ? wordFor(o.tierLabels, r.tierValue) : (was?.word ?? ""),
    };
  });
  const next: JournalEntry = {
    id: before?.id ?? `saved:${saved.date}`,
    date: saved.date,
    body: saved.body.trim() === "" ? null : saved.body,
    markers,
    attachments: [...(before?.attachments ?? []), ...saved.photosAdded.map((p) => ({ id: p.id, url: p.url }))],
  };
  const rest = entries.filter((e) => e.date !== saved.date);
  return [...rest, next].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
