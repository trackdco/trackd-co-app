import { percent } from "./aggregate"

/**
 * Period-over-period change, for the founder dashboard's headline numbers.
 *
 * Pure, like the rest of `lib/admin/` — no React, no Supabase, no clock. The
 * data layer works out WHICH two windows to compare and hands the two numbers
 * here; this file only knows how to subtract them honestly.
 *
 * ── WHY A DELTA IS ITS OWN TYPE RATHER THAN A NUMBER ───────────────────────
 * "+23%" is three separate facts — the two values, the movement between them,
 * and whether that movement is expressible as a percentage at all — and a bare
 * number can only carry one of them. The card has to render the arrow, the
 * percentage AND the "23 vs 19" tooltip from the same object, or the three
 * disagree the first time somebody rounds one of them independently.
 */

/** Which way a number moved. `flat` is a real answer, not a missing one. */
export type DeltaDirection = "up" | "down" | "flat"

export interface Delta {
  /** The value for the period being reported. */
  current: number
  /** The value for the period immediately before it, of the same length. */
  previous: number
  /** `current − previous`, in whatever units the metric is counted in. */
  absolute: number
  /**
   * The change as a whole percent of the previous value.
   *
   * **Null when `previous` is 0**, and that is the whole reason this field is
   * nullable. A percentage over a zero baseline is not "infinite" and it is
   * certainly not 0 — it is undefined, because there is no whole to be a share
   * of. `percent()` in `aggregate.ts` already refuses that case for exactly the
   * same reason (and the weight card refuses "+0.0 kg" on a first weigh-in), so
   * this delegates to it rather than restating the rule and eventually
   * disagreeing with it.
   */
  pct: number | null
  direction: DeltaDirection
}

/**
 * Compare two counts from two equal-length periods.
 *
 * Returns **null** when either side is not a finite number. That is the same
 * refusal `percent()` makes: a comparison built out of NaN is not a comparison,
 * and coercing the bad side to 0 would silently invent a "+100%" out of a failed
 * read. The data layer only ever passes real counts, so in practice null means
 * "there is no previous period to compare against" — which is the honest answer
 * for the All-time range, where there is nothing before the beginning.
 */
export function delta(current: number, previous: number): Delta | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  const absolute = current - previous
  return {
    current,
    previous,
    absolute,
    pct: percent(absolute, previous),
    direction: absolute > 0 ? "up" : absolute < 0 ? "down" : "flat",
  }
}

/**
 * Compare two values that are ALREADY percentages — retention, conversion, any
 * rate the dashboard prints with a `%` after it.
 *
 * ⚠️ THE NAIVE VERSION OF THIS IS WRONG AND READS AS PLAUSIBLE. Retention going
 * 30% → 40% is a rise of **ten percentage points**; running it through
 * {@link delta} and printing the result gives "+33%", which is a different claim
 * about a different quantity and is the single most common way a metrics
 * dashboard lies to the person reading it. So `absolute` here is in POINTS and
 * `pct` is deliberately forced to null: there is no percentage of a percentage
 * that this dashboard has any business rendering.
 *
 * Takes `number | null` on both sides because a rate is itself null when its
 * denominator was 0 — an unmeasured rate cannot be compared to anything.
 */
export function pointsDelta(
  current: number | null,
  previous: number | null
): Delta | null {
  if (current === null || previous === null) return null
  const base = delta(current, previous)
  if (!base) return null
  return { ...base, pct: null }
}
