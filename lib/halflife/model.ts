/**
 * The half-life curve model: ONE pure module that the line, the scrub, the
 * figure tiles, the rows card and Home all read. Nothing on screen computes a
 * half-life figure on its own, so the line and the numbers beside it cannot
 * disagree (verified 2026-09-24, next-tasks → "The curve model").
 *
 * The curve is the amount in the body, not a blood level: superposed
 * one-compartment first-order absorption (the Bateman function), summed over
 * every dose so far. Doses stack; it is not single-dose decay.
 *
 * Pure maths and formatting only — no React, no storage, no dates. Time is
 * plain hours on whatever axis the caller chooses (the app uses epoch hours).
 */
import type { InjectionMethod } from "@/lib/home/stack"

/**
 * How a dose reaches the blood, which is all the model needs from the route.
 * Injections (sub-Q and IM) absorb over a share of the half-life; everything
 * else absorbs in a fixed short time.
 */
export type AbsorptionRoute = "injection" | "oral"

/** One dose on the model's time axis. */
export interface Dose {
  /** When it was taken, in hours. */
  atH: number
  /** How much, in the compound's own unit. */
  amount: number
  /**
   * Which of the day's doses it was (0 = the first). Only "Steady" reads it, so
   * a 100 mg morning and 50 mg evening dose are not mistaken for a dose change.
   */
  slot?: number
}

/** "Clears in" is when the last dose falls below this share of itself. */
export const CLEAR_FRACTION = 0.03
/** A gap longer than this many half-lives ends a run (for "Steady")… */
export const RUN_GAP_HALF_LIVES = 3
/** …when it is also this much longer than the usual interval between doses. */
export const RUN_GAP_INTERVALS = 1.75
/** A run is steady this many half-lives after it began. */
export const STEADY_HALF_LIVES = 5
/** The absorption half-time for anything not injected, in hours. */
export const ORAL_ABS_HALF_H = 0.35
/** The absorption half-time for an injection, as a share of the half-life. */
export const INJECTION_ABS_SHARE = 0.09

/** Below this the two rates are treated as equal (the Bateman limit). */
const EQUAL_RATES = 1e-6

/**
 * The model's route for an app route. Nasal has no catalogue compound and no
 * spec of its own; it absorbs fast and is not injected, so it takes the fixed
 * oral time rather than a share of the half-life.
 */
export function routeFor(method: InjectionMethod): AbsorptionRoute {
  return method === "im" || method === "subq" ? "injection" : "oral"
}

/**
 * The absorption half-time, in hours: 9% of the half-life for an injection,
 * 0.35 h otherwise. There is deliberately NO floor. The prototype's 1.5 h
 * minimum made fast peptides fade two to three times slower than their stated
 * half-life.
 */
export function absHalfH(halfLifeH: number, route: AbsorptionRoute): number {
  return route === "oral" ? ORAL_ABS_HALF_H : halfLifeH * INJECTION_ABS_SHARE
}

function rates(halfLifeH: number, route: AbsorptionRoute) {
  return { ke: Math.LN2 / halfLifeH, kr: Math.LN2 / absHalfH(halfLifeH, route) }
}

/** What is circulating `h` hours after a single unit dose (0 before it). */
export function unitAmount(h: number, halfLifeH: number, route: AbsorptionRoute): number {
  if (h <= 0) return 0
  const { ke, kr } = rates(halfLifeH, route)
  if (Math.abs(kr - ke) < EQUAL_RATES) return kr * h * Math.exp(-ke * h)
  return (kr / (kr - ke)) * (Math.exp(-ke * h) - Math.exp(-kr * h))
}

/** The amount in the body at `tH`, from every dose taken by then. */
export function amountAt(
  doses: readonly Dose[],
  tH: number,
  halfLifeH: number,
  route: AbsorptionRoute,
): number {
  let sum = 0
  for (const d of doses) {
    if (d.atH > tH) continue
    sum += d.amount * unitAmount(tH - d.atH, halfLifeH, route)
  }
  return sum
}

/** Hours from a dose to its peak. */
export function peakAfterH(halfLifeH: number, route: AbsorptionRoute): number {
  const { ke, kr } = rates(halfLifeH, route)
  if (Math.abs(kr - ke) < EQUAL_RATES) return 1 / ke
  return Math.log(kr / ke) / (kr - ke)
}

/**
 * "Of last dose left": the share of ONE dose not yet eliminated, `h` hours
 * after it. That is what is still absorbing (the depot) plus what is
 * circulating, capped at 1. It is not `0.5^(h / halfLife)`, which ignores the
 * depot and ran ahead of the line.
 */
export function lastDoseLeft(h: number, halfLifeH: number, route: AbsorptionRoute): number {
  if (h <= 0) return 1
  const { kr } = rates(halfLifeH, route)
  return Math.min(1, Math.exp(-kr * h) + unitAmount(h, halfLifeH, route))
}

/**
 * Hours from a dose until less than 3% of it remains. Walked in steps of a
 * fiftieth of the slower of the two half-times, and stopped at 60 half-lives
 * so a pathological input cannot spin.
 */
export function clearsAfterH(halfLifeH: number, route: AbsorptionRoute): number {
  const step = Math.max(halfLifeH, absHalfH(halfLifeH, route)) / 50
  const limit = 60 * halfLifeH
  let h = 0
  while (lastDoseLeft(h, halfLifeH, route) > CLEAR_FRACTION && h < limit) h += step
  return h
}

/**
 * The times to sample a chart at between `t0` and `t1`: `n` even steps, PLUS
 * every dose (just before it and at it) and every dose's peak. Without those,
 * a short half-life's spike falls between samples and the line loses its
 * peaks.
 */
export function sampleTimes(
  doses: readonly Dose[],
  t0: number,
  t1: number,
  n: number,
  halfLifeH: number,
  route: AbsorptionRoute,
): number[] {
  const out: number[] = []
  for (let i = 0; i <= n; i++) out.push(t0 + ((t1 - t0) * i) / n)
  const peak = peakAfterH(halfLifeH, route)
  for (const d of doses) {
    if (d.atH >= t0 && d.atH <= t1) out.push(Math.max(t0, d.atH - 1e-6), d.atH)
    const p = d.atH + peak
    if (p >= t0 && p <= t1) out.push(p)
  }
  return out.sort((a, b) => a - b)
}

/** One point of a curve: `[hours, amount]`. */
export type CurvePoint = [number, number]

/** The curve between `t0` and `t1`, sampled per {@link sampleTimes}. */
export function curvePoints(
  doses: readonly Dose[],
  t0: number,
  t1: number,
  n: number,
  halfLifeH: number,
  route: AbsorptionRoute,
): CurvePoint[] {
  return sampleTimes(doses, t0, t1, n, halfLifeH, route).map((t) => [
    t,
    amountAt(doses, t, halfLifeH, route),
  ])
}

/**
 * How long a gap between doses must be to count as a BREAK: more than
 * {@link RUN_GAP_HALF_LIVES} half-lives, and also more than
 * {@link RUN_GAP_INTERVALS} times the usual interval (the median of the gaps so
 * far).
 *
 * The second test is the build's (2026-09-24). With the half-lives alone, a
 * 4-hour peptide taken daily breaks its run at EVERY dose (24 h is more than
 * 12 h), so "Steady" would count down after each dose and never settle. Such a
 * compound clears between doses and repeats the same curve, which is exactly
 * a steady state. For a long half-life, 3 half-lives is the larger number and
 * the rule is the spec's own. A missed dose is still a break.
 */
function breakGap(past: readonly Dose[], halfLifeH: number): number {
  const gaps: number[] = []
  for (let i = 1; i < past.length; i++) gaps.push(past[i].atH - past[i - 1].atH)
  gaps.sort((a, b) => a - b)
  const usual = gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)] : 0
  return Math.max(RUN_GAP_HALF_LIVES * halfLifeH, RUN_GAP_INTERVALS * usual)
}

/**
 * Where the CURRENT run began: the dose that opened the unbroken stretch
 * ending at the last dose on or before `nowH`, or null with none yet.
 *
 * A run breaks at a gap (see {@link breakGap}) and at a change of amount.
 * Titrating is normal, and a new amount has its own steady level to reach. The
 * amount is compared with the previous dose in the SAME slot, so a different
 * morning and evening amount is one regimen, not a change twice a day.
 */
export function runStartH(doses: readonly Dose[], nowH: number, halfLifeH: number): number | null {
  const past = doses.filter((d) => d.atH <= nowH).sort((a, b) => a.atH - b.atH)
  if (past.length === 0) return null
  const gap = breakGap(past, halfLifeH)
  const lastBySlot = new Map<number, number>()
  let start = past[0].atH
  let prev = past[0].atH
  for (const d of past) {
    const slot = d.slot ?? 0
    if (d.atH - prev > gap) {
      start = d.atH
      lastBySlot.clear()
    } else {
      const before = lastBySlot.get(slot)
      if (before !== undefined && Math.abs(before - d.amount) > 1e-9) start = d.atH
    }
    lastBySlot.set(slot, d.amount)
    prev = d.atH
  }
  return start
}

/** One unbroken stretch of taken doses: the Past runs list (build-brief-final §3.11). */
export interface DoseRun {
  /** The first dose. */
  fromH: number
  /** The last dose. */
  toH: number
  /** How many doses it had. */
  count: number
  /** Still going: its last dose is recent enough that the next would join it. */
  current: boolean
}

/** A run in the Past runs list survives any gap up to a week: a missed dose
 *  or two is not a new run to the person who took them. */
export const RUN_BREAK_MIN_H = 7 * 24

/**
 * The doses taken by `nowH`, split into runs at a BREAK: the gap
 * {@link runStartH} uses (more than three half-lives and more than 1.75 × the
 * usual interval), and never less than {@link RUN_BREAK_MIN_H}. Unlike the
 * steady-state run, a change of amount does NOT split a run here: titrating is
 * one run to the person who did it. Oldest first.
 */
export function doseRuns(doses: readonly Dose[], nowH: number, halfLifeH: number): DoseRun[] {
  const past = doses.filter((d) => d.atH <= nowH).sort((a, b) => a.atH - b.atH)
  if (past.length === 0) return []
  const gap = Math.max(RUN_BREAK_MIN_H, breakGap(past, halfLifeH))
  const runs: DoseRun[] = []
  let cur: DoseRun = { fromH: past[0].atH, toH: past[0].atH, count: 1, current: false }
  for (const d of past.slice(1)) {
    if (d.atH - cur.toH > gap) {
      runs.push(cur)
      cur = { fromH: d.atH, toH: d.atH, count: 1, current: false }
    } else {
      cur.toH = d.atH
      cur.count += 1
    }
  }
  cur.current = nowH - cur.toH <= gap
  runs.push(cur)
  return runs
}

/** "Steady": reached, reached in some hours, or not meaningful. */
export type Steady =
  | { kind: "reached" }
  | { kind: "in"; hours: number }
  | { kind: "none" }

/**
 * When the current run is steady: {@link STEADY_HALF_LIVES} half-lives (of the
 * slower half-time) after it began. A run that has already lapsed (no dose for
 * longer than a break, {@link breakGap}) restarts at the next dose due; with no
 * next dose there is nothing to be steady at.
 */
export function steadyAt(
  doses: readonly Dose[],
  nowH: number,
  halfLifeH: number,
  route: AbsorptionRoute,
  nextDoseAtH: number | null,
): Steady {
  const span = STEADY_HALF_LIVES * Math.max(halfLifeH, absHalfH(halfLifeH, route))
  const past = doses.filter((d) => d.atH <= nowH).sort((a, b) => a.atH - b.atH)
  const lastH = past.length ? past[past.length - 1].atH : null
  const lapsed = lastH === null || nowH - lastH > breakGap(past, halfLifeH)
  const start = lapsed ? nextDoseAtH : runStartH(doses, nowH, halfLifeH)
  if (start === null) return { kind: "none" }
  const at = start + span
  return at <= nowH ? { kind: "reached" } : { kind: "in", hours: at - nowH }
}

/** Every figure the half-life card and Home show for one compound. */
export interface HalfLifeFigures {
  /** The amount in the body now, from every dose so far. */
  circulating: number
  /** "Of last dose left", 0–1, or null before the first dose. */
  lastDoseLeft: number | null
  /** Hours until the last dose falls below 3%; at or below 0 it has cleared.
   *  Null before the first dose. */
  clearsInH: number | null
  /** Hours until the next dose due, or null when none is scheduled. */
  nextDoseInH: number | null
  steady: Steady
}

export interface FiguresInput {
  doses: readonly Dose[]
  halfLifeH: number
  route: AbsorptionRoute
  nowH: number
  /** The next scheduled dose, in hours, or null when none is due. */
  nextDoseAtH: number | null
}

/**
 * The figures at `nowH`. Doses after `nowH` are ignored: a dose in the future
 * has not been taken, so it moves nothing yet.
 */
export function figuresAt({ doses, halfLifeH, route, nowH, nextDoseAtH }: FiguresInput): HalfLifeFigures {
  const past = doses.filter((d) => d.atH <= nowH)
  const lastH = past.length ? Math.max(...past.map((d) => d.atH)) : null
  const since = lastH === null ? null : nowH - lastH
  return {
    circulating: amountAt(past, nowH, halfLifeH, route),
    lastDoseLeft: since === null ? null : lastDoseLeft(since, halfLifeH, route),
    clearsInH: since === null ? null : clearsAfterH(halfLifeH, route) - since,
    nextDoseInH: nextDoseAtH === null ? null : Math.max(0, nextDoseAtH - nowH),
    steady: steadyAt(doses, nowH, halfLifeH, route, nextDoseAtH),
  }
}

/* ------------------------------------------------ the graph's marks and rows */

/** The last dose taken by `nowH`, in hours, or null before the first. */
function lastTakenH(doses: readonly Dose[], nowH: number): number | null {
  let last: number | null = null
  for (const d of doses) if (d.atH <= nowH && (last === null || d.atH > last)) last = d.atH
  return last
}

/**
 * Hours from a dose until "Of last dose left" first falls to half: where the ½
 * line sits. It is the model's own fraction (the depot plus what is
 * circulating), so after an injection it lands about 1.14 half-lives on, NOT
 * at one half-life. Found by bisection, which works because the fraction only
 * ever falls.
 */
export function halfGoneAfterH(halfLifeH: number, route: AbsorptionRoute): number {
  let lo = 0
  let hi = Math.max(halfLifeH, absHalfH(halfLifeH, route))
  for (let i = 0; i < 64 && lastDoseLeft(hi, halfLifeH, route) > 0.5; i++) {
    lo = hi
    hi *= 2
  }
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2
    if (lastDoseLeft(mid, halfLifeH, route) > 0.5) lo = mid
    else hi = mid
  }
  return hi
}

/**
 * The ½ line on the chart's own axis: the last dose taken by `nowH` plus
 * {@link halfGoneAfterH}, or null before the first dose. Doses after `nowH`
 * have not been taken and move nothing, so the graph's taken-and-to-come list
 * can be passed as it is.
 */
export function halfGoneAtH(
  doses: readonly Dose[],
  nowH: number,
  halfLifeH: number,
  route: AbsorptionRoute,
): number | null {
  const last = lastTakenH(doses, nowH)
  return last === null ? null : last + halfGoneAfterH(halfLifeH, route)
}

/** Even samples across a window when finding its top (the mock's 160). */
const PEAK_SAMPLES = 160
/** With no dose after it, a window runs this many single-dose peak times on. */
const PEAK_WINDOW_PEAKS = 3
/** Golden-section steps that settle the top to the exact instant. */
const PEAK_REFINE_STEPS = 80

/**
 * The instant the stacked curve is highest between `from` and `to`: the top of
 * the DRAWN line, not one dose's own peak (earlier doses, still falling, pull
 * it earlier). Even samples plus every dose's own peak find the highest
 * stretch, and a golden-section search settles the instant, so a short
 * half-life's spike is not lost between samples. A refined point is kept only
 * if it is higher, so the answer is never lower than the best sample.
 */
function topBetween(
  doses: readonly Dose[],
  from: number,
  to: number,
  halfLifeH: number,
  route: AbsorptionRoute,
): number {
  const f = (t: number) => amountAt(doses, t, halfLifeH, route)
  let bestT = from
  let bestV = -Infinity
  const consider = (t: number) => {
    const v = f(t)
    if (v > bestV) {
      bestV = v
      bestT = t
    }
  }
  const step = (to - from) / PEAK_SAMPLES
  for (let i = 0; i <= PEAK_SAMPLES; i++) consider(from + step * i)
  const peak = peakAfterH(halfLifeH, route)
  for (const d of doses) {
    const p = d.atH + peak
    if (p > from && p < to) consider(p)
  }
  const g = (Math.sqrt(5) - 1) / 2
  let a = Math.max(from, bestT - step)
  let b = Math.min(to, bestT + step)
  let c = b - g * (b - a)
  let e = a + g * (b - a)
  let fc = f(c)
  let fe = f(e)
  for (let i = 0; i < PEAK_REFINE_STEPS; i++) {
    if (fc > fe) {
      b = e
      e = c
      fe = fc
      c = b - g * (b - a)
      fc = f(c)
    } else {
      a = c
      c = e
      fc = fe
      e = a + g * (b - a)
      fe = f(e)
    }
  }
  consider((a + b) / 2)
  return bestT
}

/** The Peaks in row: which peak it counts to, and when. */
export type PeakCountdown =
  /** The top between the last dose and the next is still ahead: "Peaks in". */
  | { kind: "ahead"; atH: number; inH: number }
  /** That top has passed; this is the next dose's own: "Next peak in". */
  | { kind: "next"; atH: number; inH: number }
  /** That top has passed and no dose is to come: "Peak" · "Passed". */
  | { kind: "passed"; atH: number }
  /** No dose taken yet. */
  | { kind: "none" }

/**
 * The peak the drawn curve reaches (build-brief-final §3.11): the top of the
 * stacked curve between the last dose taken and the next one, or, with none to
 * come, over three single-dose peak times after the last. Once that top has
 * passed, the next dose's own window (to the dose after it, or three peak
 * times) gives the next peak.
 *
 * `doses` is what the graph draws: taken doses and the ones still to come. A
 * next dose beyond that list is not seen, so it must reach at least the next
 * dose (and the one after, for its window's end).
 */
export function peakCountdown(
  doses: readonly Dose[],
  nowH: number,
  halfLifeH: number,
  route: AbsorptionRoute,
): PeakCountdown {
  const last = lastTakenH(doses, nowH)
  if (last === null) return { kind: "none" }
  const ahead = [...new Set(doses.filter((d) => d.atH > nowH).map((d) => d.atH))].sort((a, b) => a - b)
  const span = PEAK_WINDOW_PEAKS * peakAfterH(halfLifeH, route)
  const top = topBetween(doses, last, ahead[0] ?? last + span, halfLifeH, route)
  if (top > nowH) return { kind: "ahead", atH: top, inH: top - nowH }
  if (ahead.length === 0) return { kind: "passed", atH: top }
  const next = topBetween(doses, ahead[0], ahead[1] ?? ahead[0] + span, halfLifeH, route)
  return { kind: "next", atH: next, inH: next - nowH }
}

/** The likely range at Now: the curve ×1.14 above and ×0.86 below… */
export const RANGE_AT_NOW: Readonly<RangeFactors> = { upper: 1.14, lower: 0.86 }
/** …widening evenly to ×1.30 and ×0.76 by {@link RANGE_WIDEN_H} either side. */
export const RANGE_FAR: Readonly<RangeFactors> = { upper: 1.3, lower: 0.76 }
/** How far from Now the range reaches its widest, in hours (six days). */
export const RANGE_WIDEN_H = 6 * 24

/** What the curve is multiplied by for the top and bottom of the range. */
export interface RangeFactors {
  upper: number
  lower: number
}

/**
 * The likely-range shading's factors at `tH` (build-brief-final §3.11):
 * narrowest at Now, widening in a straight line with the distance from Now,
 * past or ahead, and holding at their widest beyond six days.
 */
export function rangeFactorsAt(tH: number, nowH: number): RangeFactors {
  const far = Math.min(1, Math.abs(tH - nowH) / RANGE_WIDEN_H)
  return {
    upper: RANGE_AT_NOW.upper * (1 - far) + RANGE_FAR.upper * far,
    lower: RANGE_AT_NOW.lower * (1 - far) + RANGE_FAR.lower * far,
  }
}

/** One point of the range: `[hours, bottom, top]`. */
export type RangePoint = [number, number, number]

/** The range around a drawn curve, point for point. */
export function rangeBand(points: readonly CurvePoint[], nowH: number): RangePoint[] {
  return points.map(([t, v]) => {
    const k = rangeFactorsAt(t, nowH)
    return [t, v * k.lower, v * k.upper]
  })
}

/* --------------------------------------------------------------- formatting */

/** A duration: under 1 h in minutes, under 48 h in hours, else days. */
export function formatDuration(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.round(h)}h`
  return `${Math.round(h / 24)} days`
}

/** A figure to its significant digits: 220 · 44.1 · 4.58. */
export function formatAmount(n: number): string {
  if (n >= 100) return n.toFixed(0)
  if (n >= 10) return n.toFixed(1)
  return n.toFixed(2)
}

/** "Of last dose left" as a whole percentage. */
export function formatPercent(fraction: number): string {
  return String(Math.round(fraction * 100))
}

/** Hours with at most one decimal and no trailing zero: 4 · 2.5 · 1.2. */
function trimHours(h: number): string {
  return String(Math.round(h * 10) / 10)
}

/** The Half-life row: "4.5 days" · "4h" · "4 min". */
export function formatHalfLife(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${trimHours(h)}h`
  return `${(h / 24).toFixed(1)} days`
}

/** The collapsed row's mono tag, after "t½": "6.0D" · "4H" · "4MIN". */
export function formatHalfLifeShort(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}MIN`
  if (h < 48) return `${trimHours(h)}H`
  return `${(h / 24).toFixed(1)}D`
}

/** The Clears in row: "~29 days", or "Cleared" once it has. */
export function formatClearsIn(h: number): string {
  return h <= 0 ? "Cleared" : `~${formatDuration(h)}`
}

/** The Steady row: "Yes", a duration, or null when there is no run. */
export function formatSteady(steady: Steady): string | null {
  if (steady.kind === "reached") return "Yes"
  if (steady.kind === "in") return formatDuration(steady.hours)
  return null
}

/**
 * The peak countdown: whole days from a day, then whole hours, then "<1h":
 * "3 days" · "1 day" · "5h" · "<1h". Hours that round to 24 read as "1 day",
 * never "24h".
 */
export function formatPeakIn(h: number): string {
  if (h < 1) return "<1h"
  if (Math.round(h) < 24) return `${Math.round(h)}h`
  const days = Math.round(h / 24)
  return days === 1 ? "1 day" : `${days} days`
}

/** The Peaks in row as a label and a value; null before the first dose. */
export function formatPeak(p: PeakCountdown): { label: string; value: string } | null {
  if (p.kind === "ahead") return { label: "Peaks in", value: formatPeakIn(p.inH) }
  if (p.kind === "next") return { label: "Next peak in", value: formatPeakIn(p.inH) }
  if (p.kind === "passed") return { label: "Peak", value: "Passed" }
  return null
}

/**
 * The two durations in the page's line "Usually peaks ~X after a dose and
 * clears ~Y after the last.", for ONE dose: {@link peakAfterH} and
 * {@link clearsAfterH}, each worded by {@link formatDuration}.
 */
export function formatUsual(
  halfLifeH: number,
  route: AbsorptionRoute,
): { peaksAfter: string; clearsAfter: string } {
  return {
    peaksAfter: formatDuration(peakAfterH(halfLifeH, route)),
    clearsAfter: formatDuration(clearsAfterH(halfLifeH, route)),
  }
}
