/**
 * Bodyweight helpers — unit conversion, input sanitising, and display
 * formatting shared by the Weight view (Context/Feature Specs/08 → C) and its
 * server action. Storage is always kilograms; imperial (lbs) is a display/entry
 * preference, converted at the boundary.
 *
 * Pure helpers only; no React, no side effects (Context/code-standards.md).
 */
export const KG_PER_LB = 0.45359237;

export type WeightUnit = "kg" | "lbs";

/** The user's weight unit from their profile units preference. */
export function unitForPreference(pref: string | null | undefined): WeightUnit {
  return pref === "imperial" ? "lbs" : "kg";
}

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === "lbs" ? kg / KG_PER_LB : kg;
}

export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === "lbs" ? value * KG_PER_LB : value;
}

/**
 * Sanitise a typed weight value: digits + a single decimal point, capped at 3
 * whole digits and 2 decimal places (the "xxx.xx" rule from the spec). Bounds
 * the field so a fat-fingered entry can't run away; the 30–300 kg range check
 * happens at submit + on the server.
 */
export function sanitizeWeightInput(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "");
  const dot = v.indexOf(".");
  if (dot !== -1) {
    v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");
  }
  const [int = "", dec] = v.split(".");
  const clampedInt = int.slice(0, 3);
  return v.includes(".") ? `${clampedInt}.${(dec ?? "").slice(0, 2)}` : clampedInt;
}

/** A kg value shown in the chosen unit, ≤2 decimals, trailing zeros trimmed. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  const rounded = Math.round(kgToUnit(kg, unit) * 100) / 100;
  return String(rounded);
}

/* ------------------------------------------------------------------ ranges */

export interface WeightRange {
  id: string;
  label: string;
  /** `Infinity` for "All", which means everything on offer rather than a span. */
  days: number;
}

/** Every range the weight graph can offer, shortest first. */
export const WEIGHT_RANGES: WeightRange[] = [
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 180 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: Number.POSITIVE_INFINITY },
];

/**
 * The ranges worth offering over a span of `spanDays`, which is how the block
 * weight graph avoids offering windows its block does not contain.
 *
 * A range LONGER than the span shows the same picture as "All" while implying
 * there is more to see, so the list unlocks progressively: a five day block
 * offers "All" alone, a forty day block adds 1W and 1M, and a block past ninety
 * days reveals 3M but still not 6M (Adrian, 2026-09-03).
 *
 * `null` means unscoped (the `/weight` page over the user's whole history) and
 * every range is offered, which is what that screen has always done.
 *
 * "All" is always present and always last, because whatever the span is, seeing
 * the whole of it is the one view that is never redundant.
 */
export function rangesForSpan(spanDays: number | null): WeightRange[] {
  if (spanDays === null) return WEIGHT_RANGES;
  const all = WEIGHT_RANGES[WEIGHT_RANGES.length - 1];
  // Strictly shorter: a range equal to the span IS "All" wearing another label.
  return [...WEIGHT_RANGES.filter((r) => r.days < spanDays), all];
}

/** The widest range on offer, i.e. the one a scoped graph should open on. */
export function defaultRangeFor(spanDays: number | null): string {
  return spanDays === null ? "3m" : "all";
}
