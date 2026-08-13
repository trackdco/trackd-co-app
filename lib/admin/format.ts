/**
 * Formatting for the dashboard. Pure, so the "never print a confident zero"
 * rules are testable rather than scattered through JSX.
 */

import type { Delta } from "./deltas"

/**
 * A delta as a short label: "+12", "−3", "+34%".
 *
 * Returns null — which the tiles render as nothing at all — when there is no
 * comparable previous period, or when the movement is zero. A tile that prints
 * "+0%" every quiet week trains you to ignore the row it sits in.
 */
export function deltaLabel(d: Delta | null | undefined, unit: "count" | "points" = "count"): string | null {
  if (!d) return null
  if (d.absolute === 0) return null
  const sign = d.absolute > 0 ? "+" : "−"
  const mag = Math.abs(d.absolute)
  if (unit === "points") return `${sign}${mag} pts`
  // Prefer the percentage when there is a real baseline; fall back to the
  // absolute when there isn't, because "+∞%" is not a number anybody wants.
  if (d.pct !== null && Math.abs(d.pct) < 1000) return `${sign}${Math.abs(d.pct)}%`
  return `${sign}${mag}`
}

/** Which way a delta points, for the caret. Null when it did not move. */
export function deltaDirection(d: Delta | null | undefined): "up" | "down" | undefined {
  if (!d || d.absolute === 0) return undefined
  return d.absolute > 0 ? "up" : "down"
}

/**
 * Colour for a delta, given whether up is good.
 *
 * Business metrics only — see `ui-context.md` → Admin. Never a health value.
 */
export function deltaTone(
  d: Delta | null | undefined,
  upIsGood = true
): "neutral" | "positive" | "negative" {
  if (!d || d.absolute === 0) return "neutral"
  const up = d.absolute > 0
  return up === upIsGood ? "positive" : "negative"
}

/** ISO 4217 → the symbol, or the code itself when there isn't a common one. */
export function currencySymbol(code: string | null): string {
  if (!code) return ""
  const map: Record<string, string> = {
    aud: "$", usd: "$", nzd: "$", cad: "$", eur: "€", gbp: "£", jpy: "¥",
  }
  return map[code.toLowerCase()] ?? code.toUpperCase() + " "
}

/** Money, with the symbol its currency actually implies. Never a hardcoded "$". */
export function money(amount: number, code: string | null): string {
  const sym = currencySymbol(code)
  const whole = Number.isInteger(amount)
  return `${sym}${amount.toLocaleString(undefined, {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

/** A count, or an em dash when the number was never measured. */
export function num(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toLocaleString()
}

/** "6 Aug" — short, unambiguous, no year unless it isn't this one. */
export function shortDate(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear()
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  })
}

/** "3 days ago", "just now". For a timestamp whose age is the point. */
export function ago(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "never"
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return "never"
  const mins = Math.floor((now.getTime() - ms) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
