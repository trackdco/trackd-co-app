/**
 * Journal data shapes + pure helpers (Context/Feature Specs/09 → Step 5). No
 * React, no side effects.
 *
 * Schema notes that shape this (architecture is the source of truth):
 * - ONE entry per day (`journal_entries.one_entry_per_day`). Both "+" paths
 *   (Write / Markers) write to that day's single row; the feed is one row per day.
 * - Markers are GLOBAL catalogue rows (`markers`): a preset flag (`is_default`)
 *   and an ordered set of word values (`tier_labels`). A reading stores the
 *   1-based ORDINAL into those words (`marker_readings.tier_value`) and we DISPLAY
 *   the word — words, never numbers. Catalogue markers are global; a user can ALSO
 *   create their OWN custom markers (user_markers.custom_*), keyed by
 *   customMarkerKey() so they flow through the same read/write path (Spec 22 · 1).
 */

import type { ProgressPhoto } from "./photos";

export interface MarkerCatalogueItem {
  id: string;
  name: string;
  /** 'positive' | 'negative' | 'neutral' — axis orientation only, never a verdict. */
  polarity: string;
  /** true = preset (shown by default when dialing); false = optional (addable). */
  isDefault: boolean;
  /** Ordered word values, low → high. */
  tierLabels: string[];
}

/**
 * A marker the dialer can offer — a global catalogue marker OR the user's own
 * custom marker. `id` is the dialer/reading KEY: a catalogue marker uses its
 * `markers.id`; a custom marker uses `own:<user_markers.id>` (customMarkerKey), so
 * both flow through ONE code path (the save action decodes it).
 */
export interface MarkerOption {
  id: string;
  name: string;
  /** 'positive' | 'negative' | 'neutral' — axis orientation only, never a verdict. */
  polarity: string;
  /** Ordered word values, low → high (the marker's scale). */
  tierLabels: string[];
  /** Catalogue: true = preset (Common), false = optional (More). Custom: false. */
  isDefault: boolean;
  kind: "catalogue" | "custom";
  /** Offerable for a NEW reading. Catalogue: always true. Custom: is_active — a
   *  soft-removed custom marker stays renderable on entries that already use it,
   *  but is never offered again. */
  addable: boolean;
}

/** Custom-marker identity: namespace the user_markers.id so a custom key can never
 *  collide with a catalogue markers.id, and the save action can tell them apart. */
export const CUSTOM_MARKER_PREFIX = "own:";
export function customMarkerKey(userMarkerId: string): string {
  return CUSTOM_MARKER_PREFIX + userMarkerId;
}
export function isCustomMarkerKey(key: string): boolean {
  return key.startsWith(CUSTOM_MARKER_PREFIX);
}
export function customMarkerUserMarkerId(key: string): string {
  return key.slice(CUSTOM_MARKER_PREFIX.length);
}

export interface EntryMarker {
  markerId: string;
  name: string;
  /** 1-based ordinal into the marker's words. */
  tierValue: number;
  /** The displayed word = tierLabels[tierValue - 1]. */
  word: string;
}

/** An attached photo on a journal entry (Spec 22 · 3). The `journal` bucket is
 *  private; `url` is a short-lived signed URL regenerated on every page load, or
 *  null if signing failed. Raw storage paths are never exposed to the client. */
export interface JournalAttachment {
  /** journal_attachments.id */
  id: string;
  url: string | null;
}

export interface JournalEntry {
  /** journal_entries.id */
  id: string;
  /** entry_date 'YYYY-MM-DD' */
  date: string;
  /** free_text (null for a markers-only entry). */
  body: string | null;
  markers: EntryMarker[];
  /** Attached photos, newest first (Spec 22 · 3). */
  attachments: JournalAttachment[];
}

/** The word for a 1-based tier value, clamped defensively (the upper bound is
 *  app-enforced, not a DB constraint). */
export function wordFor(tierLabels: string[], tierValue: number): string {
  if (!tierLabels.length) return "";
  const i = Math.min(Math.max(tierValue, 1), tierLabels.length) - 1;
  return tierLabels[i] ?? "";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "12 August 2025".
 *
 * @deprecated Days are written through `lib/format/date.ts` (consistency fix
 * #26: `dayLong` "Tue 3 Sep", `dayShort` "3 Sep"). Progress no longer calls
 * this; the Calendar still does, and moves over in its own pass.
 */
export function formatJournalDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "June 2026" for a 'YYYY-MM' month key: a month heading, not a day. */
export function formatMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${MONTHS[m - 1]} ${y}`;
}

export interface JournalMonthGroup {
  /** 'YYYY-MM' */
  key: string;
  /** "June 2026" */
  label: string;
  /** that month's entries, newest first */
  entries: JournalEntry[];
}

/**
 * Group entries by calendar month, newest month first. Entries arrive already
 * newest-first (the page orders `entry_date` desc), so they stay newest-first
 * within each month — no extra sort needed.
 */
export function groupJournalByMonth(entries: JournalEntry[]): JournalMonthGroup[] {
  const byMonth = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const key = e.date.slice(0, 7); // YYYY-MM
    const arr = byMonth.get(key);
    if (arr) arr.push(e);
    else byMonth.set(key, [e]);
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, es]) => ({ key, label: formatMonthLabel(key), entries: es }));
}

/** The first line of an entry's note that has any words on it, or null. */
export function bodyFirstLine(body: string | null): string | null {
  return body?.split("\n").find((l) => l.trim() !== "")?.trim() ?? null;
}

/** What `saveJournalEntry` takes to write an entry back. */
export interface JournalRestoreInput {
  entryDate: string;
  touchBody: true;
  body: string;
  markers: { markerId: string; tierValue: number }[];
}

/**
 * The Undo for a deleted entry (build-brief-final §3.16: "Undo wherever it can
 * undo"): the same day's note and markers, written back through the existing
 * save. Null when it cannot be brought back whole, so no Undo is offered:
 *
 * - an entry with photos, because deleting it removes their files, and an Undo
 *   that returned the words without the pictures would be a quiet loss;
 * - an entry with nothing in it, since there is nothing to write back.
 */
export function entryRestoreInput(entry: JournalEntry): JournalRestoreInput | null {
  if (entry.attachments.length > 0) return null;
  const body = entry.body ?? "";
  if (body.trim() === "" && entry.markers.length === 0) return null;
  return {
    entryDate: entry.date,
    touchBody: true,
    body,
    markers: entry.markers.map((m) => ({ markerId: m.markerId, tierValue: m.tierValue })),
  };
}

/**
 * An entry's photos in the shape the photo viewer swipes through
 * (consistency fix #1: journal photos open in `ProgressPhotoViewer`). They
 * carry no pose and no weight, all sit on the entry's day, and keep the order
 * given. A photo whose link could not be signed is left out: the viewer has
 * nothing to show for it.
 */
export function attachmentsAsPhotos(
  items: readonly { id: string; url: string | null }[],
  date: string,
): ProgressPhoto[] {
  return items
    .filter((a) => a.url)
    .map((a) => ({ id: a.id, pose: "", date, url: a.url, weightKg: null, note: null }));
}
