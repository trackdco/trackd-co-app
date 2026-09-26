/**
 * The marker picker's pure rules (build-brief-final §3.5): which markers can
 * still be added, how the picker sorts them, what "Use my last" brings back,
 * and the words the create-your-own card asks for. No React, no side effects.
 *
 * One rule runs through all of it: a marker you cannot add (`addable: false`,
 * a sex-specific marker or a removed custom one) is simply ABSENT from every
 * add path. It is never greyed out, never counted, never offered.
 */
import type { MarkerOption } from "@/lib/progress/journal";

/**
 * Suggested, the same for everyone, in this order (Adrian, 26 Sep 2026: Energy,
 * Libido, Sleep quality, Mood, Pump strength, Recovery, Motivation). Matched by
 * catalogue name, ignoring case; a name the catalogue does not have (or cannot
 * offer this person) drops out. The app decides what to suggest here, in code:
 * the catalogue's own `is_default` flag is not read for it.
 */
export const SUGGESTED_MARKERS = [
  "Energy",
  "Libido",
  "Sleep Quality",
  "Mood",
  "Pump Strength",
  "Recovery",
  "Motivation",
] as const;

/**
 * Other catalogue names a suggestion answers to. The catalogue still calls pump
 * strength "Pumps" (`supabase/seed/markers.csv`); if the row is renamed to
 * "Pump Strength", the suggestion follows with no code change.
 */
export const SUGGESTED_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "Pump Strength": ["Pumps"],
};

const norm = (s: string) => s.trim().toLowerCase();
const byName = (a: MarkerOption, b: MarkerOption) => a.name.localeCompare(b.name);

/** The markers you could still add to this entry: addable and not already on it. */
export function addableMarkers(
  options: MarkerOption[],
  onEntry: Iterable<string>,
): MarkerOption[] {
  const on = new Set(onEntry);
  return options.filter((m) => m.addable && !on.has(m.id));
}

export interface PickerSections {
  /** SUGGESTED_MARKERS order. */
  suggested: MarkerOption[];
  /** Your own markers, alphabetical. */
  yours: MarkerOption[];
  /** The rest of the catalogue, alphabetical. */
  all: MarkerOption[];
}

/** The picker's three sections. Every addable marker lands in exactly one. */
export function pickerSections(
  options: MarkerOption[],
  onEntry: Iterable<string>,
): PickerSections {
  const pool = addableMarkers(options, onEntry);
  const catalogue = pool.filter((m) => m.kind === "catalogue");
  const suggested: MarkerOption[] = [];
  for (const name of SUGGESTED_MARKERS) {
    const names = [name, ...(SUGGESTED_ALIASES[name] ?? [])].map(norm);
    const hit = catalogue.find((m) => names.includes(norm(m.name)));
    if (hit && !suggested.includes(hit)) suggested.push(hit);
  }
  const taken = new Set(suggested.map((m) => m.id));
  return {
    suggested,
    yours: pool.filter((m) => m.kind === "custom").sort(byName),
    all: catalogue.filter((m) => !taken.has(m.id)).sort(byName),
  };
}

/** The search field's placeholder: how many markers are left to add. */
export function searchPlaceholder(remaining: number): string {
  if (remaining <= 0) return "Search markers";
  return remaining === 1 ? "Search 1 marker" : `Search ${remaining} markers`;
}

/**
 * Search the addable markers. A marker matches on its name, or on one of its
 * words starting with the query ("wired" finds Energy). Names that START with
 * the query come first, then names that contain it, then word matches;
 * alphabetical within each.
 */
export function searchMarkers(
  options: MarkerOption[],
  onEntry: Iterable<string>,
  query: string,
): MarkerOption[] {
  const q = norm(query);
  if (!q) return [];
  const rank = (m: MarkerOption): number => {
    const n = norm(m.name);
    if (n.startsWith(q)) return 0;
    if (n.includes(q)) return 1;
    if (m.tierLabels.some((w) => norm(w).startsWith(q))) return 2;
    return -1;
  };
  return addableMarkers(options, onEntry)
    .map((m) => ({ m, r: rank(m) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || byName(a.m, b.m))
    .map((x) => x.m);
}

/** True when a search matches a marker's name exactly, so "Create “…”" is not offered. */
export function exactNameMatch(options: MarkerOption[], query: string): boolean {
  const q = norm(query);
  return q !== "" && options.some((m) => m.addable && norm(m.name) === q);
}

/**
 * "Use my last": the markers from your previous entry that are not on this
 * one, in that entry's order. Anything you can no longer add drops out.
 */
export function lastUsedToAdd(
  lastUsed: readonly string[],
  options: MarkerOption[],
  onEntry: Iterable<string>,
): string[] {
  const addable = new Set(addableMarkers(options, onEntry).map((m) => m.id));
  const out: string[] = [];
  for (const id of lastUsed) {
    if (addable.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/* --------------------------------------------------- create your own --- */

/** "neck pain" → "Neck Pain". Each word's first letter is raised; the rest is
 *  kept as typed, so "HRV" and "PIP" survive. Spaces collapse. */
export function titleCaseMarkerName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1))
    .join(" ");
}

/** The addable marker already using this name, if any (case-insensitive). */
export function markerNamed(
  options: MarkerOption[],
  name: string,
): MarkerOption | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return options.find((m) => m.addable && norm(m.name) === n);
}

export type ScaleKey = "severity" | "level" | "quality" | "own";

/** Which end is better, for a scale that asks. */
export type BetterEnd = "low" | "high" | "neither";

/**
 * The ready-made steps. Severity (None to Severe) and Quality (Poor to Great)
 * already say which end is better; Level and your own words ask.
 */
export const READY_SCALES: { key: Exclude<ScaleKey, "own">; words: string[] }[] = [
  { key: "severity", words: ["None", "Low", "Medium", "High", "Severe"] },
  { key: "level", words: ["Very low", "Low", "Medium", "High", "Very high"] },
  { key: "quality", words: ["Poor", "Fair", "Okay", "Good", "Great"] },
];

/** How many words "your own words" offers. */
export const OWN_WORD_SLOTS = 5;

/** Only Level and your own words ask which end is better. */
export function asksBetterEnd(scale: ScaleKey): boolean {
  return scale === "level" || scale === "own";
}

/** The steps a new marker will have, low to high. Own words: the filled ones. */
export function scaleWords(scale: ScaleKey, own: readonly string[]): string[] {
  if (scale === "own") return own.map((w) => w.trim()).filter(Boolean);
  return READY_SCALES.find((s) => s.key === scale)?.words.slice() ?? [];
}

/**
 * The stored polarity: axis orientation for future charts, never a verdict.
 * "positive" = the high end is better (as Energy), "negative" = the low end
 * is (as Joint Pain), "neutral" = neither.
 */
export function polarityFor(scale: ScaleKey, better: BetterEnd): "positive" | "negative" | "neutral" {
  if (scale === "severity") return "negative";
  if (scale === "quality") return "positive";
  if (better === "high") return "positive";
  if (better === "low") return "negative";
  return "neutral";
}

/* ------------------------------------------------------------ the rows --- */

/** A marker on the entry and its 1-based rating (0 or absent = not rated). */
export interface RowRating {
  markerId: string;
  tierValue: number;
}

/**
 * The rows a dialer starts from. Every marker in `initial` is a row, in order,
 * once; only a whole rating of 1 or more counts as rated. So a parent can hand
 * back a row that was added but not yet rated (`tierValue: 0`) and it stays a
 * row, and a not-rated row is never reported as a rating (the save refuses 0).
 */
export function seedRows(initial: readonly RowRating[]): {
  order: string[];
  rated: Map<string, number>;
} {
  const order: string[] = [];
  const rated = new Map<string, number>();
  for (const m of initial) {
    if (typeof m?.markerId !== "string" || m.markerId === "") continue;
    if (!order.includes(m.markerId)) order.push(m.markerId);
    const tv = Math.trunc(m.tierValue);
    if (Number.isFinite(tv) && tv >= 1) rated.set(m.markerId, tv);
  }
  return { order, rated };
}

/** What the dialer reports: the rated rows, in row order. */
export function ratedInOrder(order: readonly string[], rated: ReadonlyMap<string, number>): RowRating[] {
  const out: RowRating[] = [];
  for (const id of order) {
    const tv = rated.get(id);
    if (tv !== undefined && tv >= 1) out.push({ markerId: id, tierValue: tv });
  }
  return out;
}

/** Undo brings a removed row back where it was (or at the end, if the rows
 *  have since shrunk). A row that is already back stays put. */
export function restoreRow(order: readonly string[], id: string, at: number): string[] {
  if (order.includes(id)) return order.slice();
  const i = Math.max(0, Math.min(at, order.length));
  return [...order.slice(0, i), id, ...order.slice(i)];
}

/* ----------------------------------------------------------- the steps --- */

/** The step under a pointer across `n` equal bars: 1 to n, clamped, so a drag
 *  past either end holds the end step (markers6: `ceil(x / width * n)`). */
export function stepAt(x: number, left: number, width: number, n: number): number {
  if (n <= 0) return 0;
  if (!(width > 0)) return 1;
  return Math.min(n, Math.max(1, Math.ceil(((x - left) / width) * n)));
}

/** A tap on a step: the chosen step again clears it (0); any other sets it. */
export function tapStep(current: number, tapped: number): number {
  return current === tapped ? 0 : tapped;
}

/**
 * How bar `i` (0-based) draws for a rating (0 = not rated), from markers8:
 * filled WHITE up to the rating on a brightness ramp (the leftmost filled bar
 * dimmest, the chosen one full), the chosen bar enlarged to 1.08. Nothing is
 * filled or enlarged until a rating.
 */
export function stepLook(i: number, value: number): { filled: boolean; opacity: number; scale: number } {
  const filled = value >= 1 && i < value;
  return {
    filled,
    opacity: filled ? 0.45 + (0.55 * (i + 1)) / value : 0,
    scale: value >= 1 && i === value - 1 ? 1.08 : 1,
  };
}

/**
 * The steps from a keyboard, as a slider from 0 (not rated) to `n`. Returns
 * the new rating, or null for a key the steps do not take.
 */
export function keyStep(current: number, key: string, n: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return Math.min(n, current + 1);
    case "ArrowLeft":
    case "ArrowDown":
      return Math.max(0, current - 1);
    case "Home":
      return 0;
    case "End":
      return n;
    case "Delete":
    case "Backspace":
      return 0;
    default:
      return null;
  }
}

/* ----------------------------------------------- the pinned "Add N" bar --- */

/** A box on screen (client pixels). */
export interface ScreenRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * The lowest point the pinned "Add N" bar may reach: the bottom of what you can
 * see, above anything fixed along the bottom that overlaps the bar sideways
 * (the tab bar, the +, a pinned Save). Only boxes in the lower half count, so
 * a fixed header never drags the floor up. `gap` is the breathing room kept
 * above that floor.
 */
export function pinFloor(
  viewTop: number,
  viewBottom: number,
  bar: { left: number; right: number },
  fixed: readonly ScreenRect[],
  gap: number,
): number {
  const half = viewTop + (viewBottom - viewTop) / 2;
  let floor = viewBottom;
  for (const b of fixed) {
    if (!(b.bottom > b.top) || !(b.right > b.left)) continue; // not drawn
    if (b.right <= bar.left || b.left >= bar.right) continue; // beside the bar
    if (b.top <= half || b.top >= viewBottom) continue; // not along the bottom
    floor = Math.min(floor, b.top);
  }
  return floor - gap;
}

/**
 * How far to lift the bar (px, 0 or less) so it stays in view: what
 * `position: sticky; bottom` does, for a bar whose panel clips it (a sticky
 * child of an `overflow: hidden` panel never sticks). `slot` is where the bar
 * sits in the flow, `floor` the lowest its bottom may reach, `ceiling` the
 * highest its top may reach (the picker's own top, as sticky keeps a child
 * inside its parent).
 */
export function pinLift(slot: { top: number; bottom: number }, floor: number, ceiling: number): number {
  const over = slot.bottom - floor;
  if (!(over > 0)) return 0;
  const room = Math.max(0, slot.top - ceiling);
  const lift = Math.min(over, room);
  return lift > 0 ? -lift : 0;
}

/* ------------------------------------------------ removals with an Undo --- */

export interface RemovalQueue<T> {
  /** Hold a removal for `ms`, then run it; a second schedule for an id replaces the first. */
  schedule(id: string, item: T, ms: number): void;
  /** The Undo: drop a held removal. True if one was held. */
  cancel(id: string): boolean;
  has(id: string): boolean;
  ids(): string[];
  subscribe(listener: () => void): () => void;
}

/**
 * Removals that wait out their Undo before the server hears (Yours, Edit, x).
 *
 * It lives OUTSIDE any one dialer (cold review B6): closing the journal, or
 * switching its tile, must neither send a removal early nor take its Undo away.
 * The toast's Undo still cancels it after the dialer has gone, and a dialer
 * that mounts meanwhile keeps the marker hidden until the window passes.
 * Timers are passed in, so the rules are testable without a clock.
 */
export function createRemovalQueue<T>(
  run: (item: T, id: string) => void,
  timers: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  },
): RemovalQueue<T> {
  const held = new Map<string, { item: T; handle: unknown }>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const take = (id: string) => {
    const h = held.get(id);
    if (!h) return undefined;
    timers.clear(h.handle);
    held.delete(id);
    return h;
  };
  return {
    schedule(id, item, ms) {
      take(id);
      const handle = timers.set(() => {
        const h = held.get(id);
        if (!h || h.handle !== handle) return;
        held.delete(id);
        emit();
        run(h.item, id);
      }, ms);
      held.set(id, { item, handle });
      emit();
    },
    cancel(id) {
      const h = take(id);
      if (h) emit();
      return h !== undefined;
    },
    has: (id) => held.has(id),
    ids: () => [...held.keys()],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
