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
