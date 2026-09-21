/**
 * The Trakabl number pad's key rules (feel pass, wave 3 §3), as pure logic.
 *
 * - At most 6 digits and one decimal point.
 * - `.` is refused on an integer field; on an empty field it reads "0.".
 * - A field's own sanitiser still applies: a key that the sanitiser would strip
 *   is REFUSED rather than silently dropped, so the key shakes instead of doing
 *   nothing.
 * - A prefilled value can be SELECTED: the first digit replaces it, and Delete
 *   clears it.
 *
 * No React; `components/feel/NumberPad.tsx` renders it.
 */

export type PadKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "."
  | "del"

export const PAD_DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const

/** The pad's hard ceiling on digits, whatever the field. */
export const PAD_MAX_DIGITS = 6

export interface PadKeyRules {
  /** False for a whole-number field (counts, days, rounds). */
  decimal: boolean
  /** The field's own sanitiser (e.g. `sanitizeDoseInput`). */
  sanitize?: (raw: string) => string
  /** The value is selected: the next key replaces it (Delete clears it). */
  selected?: boolean
}

export interface PadKeyResult {
  value: string
  /** The key was refused; the pad shakes it. */
  rejected: boolean
}

const digitCount = (v: string) => v.replace(".", "").length

export function applyPadKey(current: string, key: PadKey, rules: PadKeyRules): PadKeyResult {
  let v = rules.selected ? "" : current

  if (key === "del") {
    return { value: rules.selected ? "" : v.slice(0, -1), rejected: false }
  }

  if (key === ".") {
    if (!rules.decimal || v.includes(".")) return { value: current, rejected: true }
    v = v === "" ? "0." : `${v}.`
  } else {
    if (digitCount(v) >= PAD_MAX_DIGITS) return { value: current, rejected: true }
    // A lone leading zero is replaced, not extended ("0" then "5" is "5").
    v = v === "0" ? key : `${v}${key}`
  }

  if (rules.sanitize) {
    const clean = rules.sanitize(v)
    if (clean !== v) return { value: current, rejected: true }
  }
  return { value: v, rejected: false }
}

/** Map a hardware key to a pad key, or null if it is not one. */
export function padKeyFromKeyboard(key: string): PadKey | null {
  if (/^[0-9]$/.test(key)) return key as PadKey
  if (key === "." || key === ",") return "."
  if (key === "Backspace" || key === "Delete") return "del"
  return null
}
