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
 *   the word — words, never numbers. Users can't create markers.
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

export interface EntryMarker {
  markerId: string;
  name: string;
  /** 1-based ordinal into the marker's words. */
  tierValue: number;
  /** The displayed word = tierLabels[tierValue - 1]. */
  word: string;
}

export interface JournalEntry {
  /** journal_entries.id */
  id: string;
  /** entry_date 'YYYY-MM-DD' */
  date: string;
  /** free_text (null for a markers-only entry). */
  body: string | null;
  markers: EntryMarker[];
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
