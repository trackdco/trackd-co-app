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
 * Suggested, the same for everyone, in this order. Matched by catalogue name;
 * a name the catalogue does not have (or cannot offer this person) drops out.
 */
export const SUGGESTED_MARKERS = [
  "Energy",
  "Libido",
  "Sleep Quality",
  "Mood",
  "Pumps",
  "Strength",
  "Recovery",
  "Motivation",
] as const;

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
    const hit = catalogue.find((m) => norm(m.name) === norm(name));
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
