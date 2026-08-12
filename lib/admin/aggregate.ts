/**
 * Pure aggregation helpers for the founder dashboard.
 *
 * NO React, NO Supabase, NO side effects — `code-standards.md` → "lib/ — pure
 * helpers and shared types". That is not bookkeeping: it is what lets the
 * bucketing, the funnel maths and the CSV escaping be unit-tested in plain Node
 * (`vitest.config.ts` only collects `lib/**`), while every module that actually
 * touches the service role stays behind `server-only` in `lib/db/admin/`.
 *
 * Everything here turns rows INTO counts. Nothing here is allowed to be a way of
 * carrying a row back out — see `lib/db/admin/core.ts` for the invariant that
 * rule protects.
 */

/** A label and how many times it occurred, ready to render as a ranked bar. */
export interface Tally {
  key: string
  /** Human label. Falls back to the key when no display name is known. */
  label: string
  count: number
}

/** Count occurrences of a key, then rank them highest-first. */
export function tally(
  keys: (string | null | undefined)[],
  label: (key: string) => string = (k) => k
): Tally[] {
  const counts = new Map<string, number>()
  for (const raw of keys) {
    const key = (raw ?? "").trim()
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: label(key), count }))
    // Count descending, then key ascending so equal counts hold a stable order
    // rather than shuffling between refreshes of the same data.
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

/**
 * Percentage of a whole, rounded to a whole number.
 *
 * Returns null — never 0 — when the denominator is 0. "0%" of nothing is a
 * measurement that was not made, and the dashboard prints "—" for it instead.
 * The same reasoning as the weight card refusing to show "+0.0 kg" on a first
 * weigh-in.
 */
export function percent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  return Math.round((part / whole) * 100)
}

/** Age brackets. Never an age, never a date of birth — only which bucket. */
export const AGE_BRACKETS = ["18-24", "25-34", "35-44", "45-54", "55+"] as const
export type AgeBracket = (typeof AGE_BRACKETS)[number]

/**
 * Which bracket a date of birth falls in, as at `now`.
 *
 * Returns null for a missing, unparseable or under-18 date. Under-18 is null
 * rather than its own bucket deliberately: the 18+ gate means such a row is bad
 * data, and giving it a bucket would draw it as a real cohort on the chart.
 */
export function ageBracket(
  dob: string | null | undefined,
  now: Date = new Date()
): AgeBracket | null {
  if (!dob) return null
  const born = new Date(dob)
  if (Number.isNaN(born.getTime())) return null

  let age = now.getUTCFullYear() - born.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - born.getUTCMonth()
  // Birthday not yet reached this year.
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < born.getUTCDate())) {
    age -= 1
  }

  if (age < 18 || age > 120) return null
  if (age < 25) return "18-24"
  if (age < 35) return "25-34"
  if (age < 45) return "35-44"
  if (age < 55) return "45-54"
  return "55+"
}

/**
 * The region half of an IANA timezone — "Australia/Sydney" → "Australia".
 *
 * Deliberately coarse. The city half narrows a small beta cohort far more than a
 * founder dashboard needs, and the question being asked ("which side of the
 * world are these people on") is answered by the region.
 */
export function timezoneRegion(tz: string | null | undefined): string | null {
  const trimmed = (tz ?? "").trim()
  if (!trimmed) return null
  const region = trimmed.split("/")[0]?.trim()
  return region ? region : null
}

/** Median of a numeric list, or null when there is nothing to take a median of. */
export function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** "YYYY-MM-DD" for a Date, in UTC — the day boundary the DB timestamps use. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Count timestamps into UTC days, zero-filled across the whole window so a quiet
 * stretch reads as a flat line rather than as missing data.
 *
 * `from` null means "start at the first datapoint" (the All-time range).
 */
export function seriesByDay(
  timestamps: (string | null | undefined)[],
  from: Date | null,
  to: Date = new Date()
): { day: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const ts of timestamps) {
    if (!ts) continue
    const key = ts.slice(0, 10)
    if (key.length === 10) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (counts.size === 0) return []

  const keys = [...counts.keys()].sort()
  const start = from ? dayKey(from) : keys[0]
  const end = new Date(to)
  end.setUTCHours(0, 0, 0, 0)

  const out: { day: string; count: number }[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  if (Number.isNaN(cursor.getTime())) return []
  // Hard stop so a bad date cannot spin here.
  for (let i = 0; cursor <= end && i < 2000; i++) {
    const key = dayKey(cursor)
    out.push({ day: key, count: counts.get(key) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Escape one CSV field.
 *
 * TWO separate jobs, and the second is a security control rather than a
 * formatting one:
 *
 *  1. RFC 4180 quoting — wrap in quotes and double any embedded quote, so a
 *     comma, quote or newline inside a value cannot break the column layout.
 *
 *  2. **Formula-injection defence.** A spreadsheet treats a cell beginning `=`,
 *     `+`, `-`, `@`, or a leading tab/CR as a FORMULA, not text. This export
 *     carries two fields a stranger controls — the waitlist email and the body
 *     of a feedback note — so `=HYPERLINK(...)` typed into the feedback box
 *     would become a live, clickable formula the moment a founder opened the
 *     download in Excel, Numbers or Sheets. Prefixing a single quote makes the
 *     cell unambiguously text. The value is not otherwise altered, and the
 *     prefix is visible, so nothing is silently rewritten.
 */
export function csvField(value: string | null | undefined): string {
  const raw = (value ?? "").toString()
  const neutralised = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${neutralised.replace(/"/g, '""')}"`
}

/** A header row plus body rows, CRLF-terminated per RFC 4180. */
export function toCsv(headers: string[], rows: (string | null | undefined)[][]): string {
  const lines = [headers.map(csvField).join(",")]
  for (const row of rows) lines.push(row.map(csvField).join(","))
  return lines.join("\r\n")
}

/**
 * A filename safe to put in a `Content-Disposition` header.
 *
 * Strips anything outside `[A-Za-z0-9._-]`, which removes the quotes, newlines
 * and semicolons a header-injection attempt would need. Nothing user-controlled
 * reaches this today; it is here so that stays true if a caller ever passes
 * something dynamic.
 */
export function safeFilename(name: string, fallback = "export.csv"): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "")
  return cleaned.length > 0 ? cleaned.slice(0, 100) : fallback
}

// ── Funnel ───────────────────────────────────────────────────────────────────

/** One step of the onboarding funnel. */
export interface FunnelStep {
  label: string
  count: number
  /** Share of the FIRST step, so every bar is read against the same baseline. */
  pctOfTop: number | null
  /** Share of the step immediately above — where the drop-off actually happens. */
  pctOfPrev: number | null
}

/**
 * Build funnel steps from raw counts.
 *
 * Both percentages are carried because they answer different questions and the
 * single-percentage version of this chart is the classic way to mislead
 * yourself: "40% reach step 4" and "40% of step 3 reach step 4" are very
 * different sentences, and only showing one of them hides which step is leaking.
 */
export function funnel(steps: { label: string; count: number }[]): FunnelStep[] {
  const top = steps[0]?.count ?? 0
  return steps.map((step, i) => ({
    label: step.label,
    count: step.count,
    pctOfTop: percent(step.count, top),
    pctOfPrev: i === 0 ? null : percent(step.count, steps[i - 1].count),
  }))
}
