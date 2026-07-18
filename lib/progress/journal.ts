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
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatJournalDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatJournalDateShort(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "June 2026" for a 'YYYY-MM' month key. */
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

/** One-line preview for a card/feed row: the body's first line, else a marker
 *  summary ("Energy · Charged, Mood · Good"), else a gentle fallback. */
export function entryPreview(entry: JournalEntry): string {
  const firstLine = entry.body?.split("\n").find((l) => l.trim() !== "")?.trim();
  if (firstLine) return firstLine;
  if (entry.markers.length) {
    return entry.markers.map((m) => `${m.name} · ${m.word}`).join(", ");
  }
  return "—";
}
