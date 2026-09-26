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
 * One exception: the Past runs week ({@link doseRuns}) is a calendar week, so
 * it reads the device's clock offset to stay a week across a clock change.
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
/** …when it is also this much longer than the usual interval between doses
 *  (judged per slot for more than one dose a day: see `breakRule`). */
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
 * fiftieth of the slower of the two half-times, and stopped at 60 of them so a
 * pathological input cannot spin. The SLOWER one: a tiny half-life taken by
 * mouth is held back by its 0.35 h absorption, not by its own half-life.
 */
export function clearsAfterH(halfLifeH: number, route: AbsorptionRoute): number {
  const slower = Math.max(halfLifeH, absHalfH(halfLifeH, route))
  const step = slower / 50
  const limit = 60 * slower
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

/** How many of a slot's latest gaps its usual gap is the median of (see
 *  `breakRule`): two weeks of a daily slot. */
const RUN_GAP_RECENT = 14

/** The lower median of `xs`, or null when empty. */
function lowerMedian(xs: number[]): number | null {
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

/**
 * The BREAK rule of a regimen: for the slot of the dose a gap starts at, how
 * long that gap must be to end a run. More than {@link RUN_GAP_HALF_LIVES}
 * half-lives, and also longer than a MISSED dose would make it: the usual gap
 * after that slot's dose, plus {@link RUN_GAP_INTERVALS} − 1 (three quarters)
 * of the usual gap after the next slot's dose, the one that was missed.
 *
 * The second test is the build's (2026-09-24). With the half-lives alone, a
 * 4-hour peptide taken daily breaks its run at EVERY dose (24 h is more than
 * 12 h), so "Steady" would count down after each dose and never settle. Such a
 * compound clears between doses and repeats the same curve, which is exactly
 * a steady state. For a long half-life, 3 half-lives is the larger number and
 * the rule is the spec's own. A missed dose is still a break.
 *
 * Taken once a day, or every few days, this is 1.75 × the usual interval, as
 * it always was. Taken two or three times a day, the gaps differ by slot (8 h
 * and then 16 h at 08:00 and 16:00), so each gap is judged by its OWN slot's
 * usual gap: the overnight gap is part of the regimen, while a missed morning
 * or evening dose, or a missed day, is still a break (cold review B11).
 *
 * The usual gap after a slot is the median of its last {@link RUN_GAP_RECENT}
 * gaps, so a schedule cut from twice a day to once settles into the new
 * rhythm in about a week rather than when its new gaps outnumber the old.
 * Doses at one instant are one (two untimed slots both placed at noon are not
 * a gap of 0), named by the first slot. Slots are the day's doses in order, so
 * the slot after the last one is the first. A slot with no gap after it yet
 * uses the median of every recent gap. `past` is sorted, oldest first.
 */
function breakRule(past: readonly Dose[], halfLifeH: number): (slot: number) => number {
  const events: { atH: number; slot: number }[] = []
  for (const d of past) {
    const slot = d.slot ?? 0
    const last = events[events.length - 1]
    if (last && d.atH <= last.atH) last.slot = Math.min(last.slot, slot)
    else events.push({ atH: d.atH, slot })
  }
  const gapsAfter = new Map<number, number[]>()
  const every: number[] = []
  for (let i = 1; i < events.length; i++) {
    const gap = events[i].atH - events[i - 1].atH
    const slot = events[i - 1].slot
    const list = gapsAfter.get(slot)
    if (list) list.push(gap)
    else gapsAfter.set(slot, [gap])
    every.push(gap)
  }
  const overall = lowerMedian(every.slice(-RUN_GAP_RECENT)) ?? 0
  const usualAfter = new Map<number, number>()
  for (const [slot, gaps] of gapsAfter) usualAfter.set(slot, lowerMedian(gaps.slice(-RUN_GAP_RECENT)) ?? overall)
  const usual = (slot: number) => usualAfter.get(slot) ?? overall
  const slots = [...new Set(events.map((e) => e.slot))].sort((a, b) => a - b)
  const nextSlot = (slot: number) => slots.find((s) => s > slot) ?? slots[0] ?? slot
  const floor = RUN_GAP_HALF_LIVES * halfLifeH
  return (slot) => Math.max(floor, usual(slot) + (RUN_GAP_INTERVALS - 1) * usual(nextSlot(slot)))
}

/** The slot that names the doses at `atH`: the first of them (see {@link breakRule}). */
function slotAt(past: readonly Dose[], atH: number): number {
  return Math.min(...past.filter((d) => d.atH === atH).map((d) => d.slot ?? 0))
}

/**
 * Where the CURRENT run began: the dose that opened the unbroken stretch
 * ending at the last dose on or before `nowH`, or null with none yet.
 *
 * A run breaks at a gap (see {@link breakRule}) and at a change of amount.
 * Titrating is normal, and a new amount has its own steady level to reach. The
 * amount is compared with the previous dose in the SAME slot, so a different
 * morning and evening amount is one regimen, not a change twice a day.
 */
export function runStartH(doses: readonly Dose[], nowH: number, halfLifeH: number): number | null {
  const past = doses.filter((d) => d.atH <= nowH).sort((a, b) => a.atH - b.atH)
  if (past.length === 0) return null
  const breakAfter = breakRule(past, halfLifeH)
  const lastBySlot = new Map<number, number>()
  let start = past[0].atH
  let prev = past[0].atH
  let prevSlot = past[0].slot ?? 0
  for (const d of past) {
    const slot = d.slot ?? 0
    if (d.atH - prev > breakAfter(prevSlot)) {
      start = d.atH
      lastBySlot.clear()
    } else {
      const before = lastBySlot.get(slot)
      if (before !== undefined && Math.abs(before - d.amount) > 1e-9) start = d.atH
    }
    lastBySlot.set(slot, d.amount)
    prevSlot = d.atH > prev ? slot : Math.min(prevSlot, slot)
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
 *  or two is not a new run to the person who took them. Measured on the local
 *  clock ({@link wallHoursBetween}). */
export const RUN_BREAK_MIN_H = 7 * 24

/** The device's offset from UTC at an epoch-hours instant, in hours (positive
 *  west, as `getTimezoneOffset`). */
const utcOffsetH = (h: number) => new Date(h * 3_600_000).getTimezoneOffset() / 60

/**
 * Hours between two epoch-hours instants as the LOCAL clock counts them: the
 * week across the autumn clock change is 169 hours of real time but 168 on
 * the clock, and it is still a week to the person (cold review B28).
 */
export function wallHoursBetween(fromH: number, toH: number): number {
  return toH - fromH - (utcOffsetH(toH) - utcOffsetH(fromH))
}

/**
 * The doses taken by `nowH`, split into runs at a BREAK: the gap
 * {@link runStartH} uses (more than three half-lives and longer than a missed
 * dose would make it, {@link breakRule}), and never less than
 * {@link RUN_BREAK_MIN_H} on the local clock. Unlike the steady-state run, a
 * change of amount does NOT split a run here: titrating is one run to the
 * person who did it. Oldest first.
 */
export function doseRuns(doses: readonly Dose[], nowH: number, halfLifeH: number): DoseRun[] {
  const past = doses.filter((d) => d.atH <= nowH).sort((a, b) => a.atH - b.atH)
  if (past.length === 0) return []
  const breakAfter = breakRule(past, halfLifeH)
  const breaks = (fromH: number, slot: number, toH: number) =>
    toH - fromH > breakAfter(slot) && wallHoursBetween(fromH, toH) > RUN_BREAK_MIN_H
  const runs: DoseRun[] = []
  let cur: DoseRun = { fromH: past[0].atH, toH: past[0].atH, count: 1, current: false }
  let curSlot = past[0].slot ?? 0
  for (const d of past.slice(1)) {
    const slot = d.slot ?? 0
    if (breaks(cur.toH, curSlot, d.atH)) {
      runs.push(cur)
      cur = { fromH: d.atH, toH: d.atH, count: 1, current: false }
      curSlot = slot
    } else {
      curSlot = d.atH > cur.toH ? slot : Math.min(curSlot, slot)
      cur.toH = d.atH
      cur.count += 1
    }
  }
  cur.current = !breaks(cur.toH, curSlot, nowH)
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
 * longer than a break, {@link breakRule}) restarts at the next dose due; with no
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
  const last = past.length ? past[past.length - 1] : undefined
  const lapsed = last === undefined || nowH - last.atH > breakRule(past, halfLifeH)(slotAt(past, last.atH))
  const start = lapsed ? nextDoseAtH : runStartH(doses, nowH, halfLifeH)
  if (start === null) return { kind: "none" }
  const at = start + span
  return at <= nowH ? { kind: "reached" } : { kind: "in", hours: at - nowH }
}

/** Every figure the half-life card and Home show for one compound. */
export interface HalfLifeFigures {
  /** The instant these figures are for, in hours. */
  nowH: number
  /** The amount in the body now, from every dose so far. */
  circulating: number
  /** "Of last dose left", 0–1, or null before the first dose. */
  lastDoseLeft: number | null
  /** Hours until the last dose falls below 3%; at or below 0 it has cleared.
   *  Null before the first dose. */
  clearsInH: number | null
  /** Hours until the next dose due, or null when none is scheduled. */
  nextDoseInH: number | null
  /** The next dose due, in hours, or null when none is scheduled: the Next
   *  dose words count calendar days to it, not hours. */
  nextDoseAtH: number | null
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
    nowH,
    circulating: amountAt(past, nowH, halfLifeH, route),
    lastDoseLeft: since === null ? null : lastDoseLeft(since, halfLifeH, route),
    clearsInH: since === null ? null : clearsAfterH(halfLifeH, route) - since,
    nextDoseInH: nextDoseAtH === null ? null : Math.max(0, nextDoseAtH - nowH),
    nextDoseAtH,
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

/*
 * Each formatter ROUNDS first and then picks its unit or precision from the
 * rounded figure, so a value just under a threshold never reads as the
 * threshold in the smaller unit ("60 min", "48h", "100.0"; cold review B26).
 */

/** Whole minutes under an hour, or null from an hour (as rounded) up. */
function underAnHour(h: number): string | null {
  const min = Math.round(h * 60)
  return min < 60 ? `${Math.max(1, min)} min` : null
}

/** A duration: under 1 h in minutes, under 48 h in hours, else days. */
export function formatDuration(h: number): string {
  const min = underAnHour(h)
  if (min) return min
  const hours = Math.round(h)
  if (hours < 48) return `${hours}h`
  return `${Math.round(h / 24)} days`
}

/** A figure to three significant digits: 220 · 44.1 · 4.58 (99.96 is "100"). */
export function formatAmount(n: number): string {
  const two = n.toFixed(2)
  if (Math.abs(Number(two)) < 10) return two
  const one = n.toFixed(1)
  if (Math.abs(Number(one)) < 100) return one
  return n.toFixed(0)
}

/** "Of last dose left" as a whole percentage. */
export function formatPercent(fraction: number): string {
  return String(Math.round(fraction * 100))
}

/** A half-life's parts, rounded first: minutes under an hour, else hours to
 *  one decimal under 48, else days to one decimal. */
function halfLifeParts(h: number): { n: string; unit: "min" | "h" | "days" } {
  const min = Math.round(h * 60)
  if (min < 60) return { n: String(Math.max(1, min)), unit: "min" }
  const hours = Math.round(h * 10) / 10
  if (hours < 48) return { n: String(hours), unit: "h" }
  return { n: (h / 24).toFixed(1), unit: "days" }
}

/** The Half-life row: "4.5 days" · "4h" · "4 min". */
export function formatHalfLife(h: number): string {
  const { n, unit } = halfLifeParts(h)
  return unit === "h" ? `${n}h` : `${n} ${unit}`
}

/** The collapsed row's mono tag, after "t½": "6.0D" · "4H" · "4MIN". */
export function formatHalfLifeShort(h: number): string {
  const { n, unit } = halfLifeParts(h)
  return `${n}${unit === "min" ? "MIN" : unit === "h" ? "H" : "D"}`
}

/**
 * A Half-life list row (build-brief-final §3.11): its figure, and whether it
 * draws its sparkline. "No doses yet" and NO line before the first dose (a
 * flat line says nothing; cold review D28); "Cleared" once the last dose has;
 * else what is circulating.
 */
export function listRowFigure(f: HalfLifeFigures | null, unit: string): { figure: string; line: boolean } {
  if (!f || f.lastDoseLeft == null) return { figure: "No doses yet", line: false }
  if (f.clearsInH != null && f.clearsInH <= 0) return { figure: "Cleared", line: true }
  return { figure: `${formatAmount(f.circulating)} ${unit}`, line: true }
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

/* ------------------------------------ the screens' geometry (pure, no DOM) */

/*
 * Layout maths the half-life screens share, kept here so it is tested
 * (code-standards: pure logic lives in lib/ with tests): the "Reading the
 * curve" guide's labels, and the rail's hold on a card as it opens. Pixels in,
 * pixels out; the components only measure and apply.
 */

/** Which side of the chart a guide label sits on: over it or under it. */
export type GuideSide = "top" | "bot"

/** One label of the guide, measured. */
export interface GuideLabel<K extends string = string> {
  key: K
  /** Its mark, in the guide's pixels: where its leader ends. */
  px: number
  py: number
  /** Its width. */
  w: number
  /** The side it reads best on (build-brief-final §3.11). */
  prefer: GuideSide
}

/** The guide's box, in the same pixels. */
export interface GuideBox {
  width: number
  height: number
  /** Every label's height. */
  labelH: number
  /** The inner lane's distance from the guide's edge; the outer lane sits at 0. */
  laneInner: number
}

/** A label laid out. */
export interface GuidePlaced<K extends string = string> {
  key: K
  side: GuideSide
  /** 0 = the inner lane, next to the chart; 1 = the outer one, beyond it. */
  lane: 0 | 1
  left: number
  top: number
  /** Where its leader starts: the label's edge nearest the chart. The leader
   *  runs straight up or down from here to the mark. */
  y0: number
}

/** Space between two labels in one lane. */
export const GUIDE_GAP = 6
/** How far a leader stays inside its own label, except at the guide's edge. */
export const GUIDE_INSET = 5
/** How far a leader passes from any other label. */
export const GUIDE_CLEAR = 3
/** Two leaders nearer than this, side by side, read as one line. */
export const GUIDE_TWIN = 4

/* What a layout costs: the cheapest wins. A hidden label costs most, then two
   leaders running side by side (read as one line, they make a reader take one
   mark for the other, as the peak for the ½ line), then a label on its other
   side (two of them cost less than one pair of twins), then the outer lane,
   then each pixel a label sits off-centre over its leader. */
const COST_HIDDEN = 1000
const COST_TWIN = 200
const COST_OTHER_SIDE = 40
const COST_OUTER = 8
const COST_PER_PX = 0.02

/**
 * Whether a label with its left at `left` holds its leader at `px`: inside the
 * guide, with the leader at least {@link GUIDE_INSET} inside the label, except
 * at the guide's own edge, where the label can go no further out (cold review
 * B24: the old test was true for any `left`).
 */
export function guideHolds(px: number, w: number, left: number, width: number): boolean {
  const inL = left <= 0 ? 0 : GUIDE_INSET
  const inR = left + w >= width - 0.5 ? 0 : GUIDE_INSET
  return left >= -1e-6 && left + w <= width + 0.5 && px >= left + inL - 1e-6 && px <= left + w - inR + 1e-6
}

/** Every `left` at which a label holds its leader, as [lo, hi], or null. */
function guideRange(px: number, w: number, width: number): [number, number] | null {
  const max = width - w
  if (max < -0.5) return null
  const lo = Math.max(0, px - w + GUIDE_INSET)
  const hi = Math.min(max, px - GUIDE_INSET)
  if (lo <= hi) return [lo, hi]
  if (guideHolds(px, w, 0, width)) return [0, 0]
  if (guideHolds(px, w, Math.max(0, max), width)) return [Math.max(0, max), Math.max(0, max)]
  return null
}

interface LaneSlot {
  i: number
  px: number
  w: number
  lo: number
  hi: number
}

/**
 * One lane's lefts, in `slots` order (sorted by leader here), or null when
 * they cannot all hold their leaders without touching. A label is never
 * reordered past its neighbour: each holds its own leader and they do not
 * overlap, so their order IS their leaders' order. The first pass finds the
 * leftmost that works; the second pulls each back towards centred over its
 * leader, right to left, without breaking the first.
 */
function packLane(slots: LaneSlot[]): number[] | null {
  slots.sort((a, b) => a.px - b.px)
  const least: number[] = []
  let edge = -Infinity
  for (let k = 0; k < slots.length; k++) {
    const l = Math.max(slots[k].lo, edge)
    if (l > slots[k].hi + 1e-6) return null
    least[k] = l
    edge = l + slots[k].w + GUIDE_GAP
  }
  const lefts: number[] = []
  let limit = Infinity
  for (let k = slots.length - 1; k >= 0; k--) {
    const s = slots[k]
    const hi = Math.min(s.hi, limit - GUIDE_GAP - s.w)
    lefts[k] = Math.min(hi, Math.max(least[k], s.px - s.w / 2))
    limit = lefts[k]
  }
  return lefts
}

/** The four lanes, as a side and a depth. */
const LANES: readonly [GuideSide, 0 | 1][] = [
  ["top", 0],
  ["top", 1],
  ["bot", 0],
  ["bot", 1],
]

function laneTop(side: GuideSide, lane: 0 | 1, box: GuideBox): { top: number; y0: number } {
  const off = lane === 0 ? box.laneInner : 0
  if (side === "top") return { top: off, y0: off + box.labelH }
  const top = box.height - off - box.labelH
  return { top, y0: top }
}

/** A leader's vertical extent: from its label's edge to its mark. */
function leaderSpan(p: GuidePlaced, py: number): [number, number] {
  return p.side === "top" ? [p.y0, py] : [py, p.y0]
}

/** One assignment of labels to lanes (an index into {@link LANES}, or -1 for
 *  hidden), laid out, or null when it cannot hold. */
function layoutAs<K extends string>(
  labels: readonly GuideLabel<K>[],
  lanes: readonly number[],
  box: GuideBox,
): { placed: (GuidePlaced<K> | null)[]; extra: number } | null {
  const placed: (GuidePlaced<K> | null)[] = labels.map(() => null)
  for (const side of ["top", "bot"] as const) {
    const inner = LANES.findIndex(([s, d]) => s === side && d === 0)
    const outer = inner + 1
    // The outer lane first: its leaders cross the inner lane, so the inner
    // labels must leave each of them clear.
    const crossing: number[] = []
    for (const lane of [outer, inner]) {
      const slots: LaneSlot[] = []
      for (let i = 0; i < labels.length; i++) {
        if (lanes[i] !== lane) continue
        const it = labels[i]
        const r = guideRange(it.px, it.w, box.width)
        if (!r) return null
        let [lo, hi] = r
        for (const x of crossing) {
          if (it.px < x) hi = Math.min(hi, x - GUIDE_CLEAR - it.w)
          else if (it.px > x) lo = Math.max(lo, x + GUIDE_CLEAR)
          else return null
        }
        if (lo > hi + 1e-6) return null
        slots.push({ i, px: it.px, w: it.w, lo, hi })
      }
      const lefts = packLane(slots)
      if (!lefts) return null
      const [s, depth] = LANES[lane]
      const { top, y0 } = laneTop(s, depth, box)
      slots.forEach((slot, k) => {
        placed[slot.i] = { key: labels[slot.i].key, side: s, lane: depth, left: lefts[k], top, y0 }
        if (lane === outer) crossing.push(slot.px)
      })
    }
  }
  // No leader may pass through another label, whatever lane either is in.
  let extra = 0
  for (let i = 0; i < labels.length; i++) {
    const p = placed[i]
    if (!p) continue
    const [a0, a1] = leaderSpan(p, labels[i].py)
    extra += COST_PER_PX * Math.abs(p.left - (labels[i].px - labels[i].w / 2))
    for (let j = 0; j < labels.length; j++) {
      const q = placed[j]
      if (!q || j === i) continue
      const x = labels[i].px
      const across = x > q.left - GUIDE_CLEAR && x < q.left + labels[j].w + GUIDE_CLEAR
      if (across && a0 < q.top + box.labelH && a1 > q.top) return null
      // Two leaders side by side read as one line.
      if (j > i && Math.abs(x - labels[j].px) < GUIDE_TWIN) {
        const [b0, b1] = leaderSpan(q, labels[j].py)
        if (Math.max(a0, b0) < Math.min(a1, b1)) extra += COST_TWIN
      }
    }
  }
  return { placed, extra }
}

/**
 * The "Reading the curve" labels laid out (build-brief-final §3.11; cold
 * review B24 / F6 / D3): each on a lane over or under the chart, with a
 * straight vertical leader from its edge to its mark. Every label shown
 * contains its own leader, no two overlap, and no leader passes through
 * another label, so no two leaders ever run into one label. When two marks are
 * closer than a label's width, one moves to the other lane or side. Each of
 * the four lanes (inner and outer, top and bottom) and "hidden" is tried for
 * every label, and the cheapest layout wins: a label is hidden only when
 * nothing else holds. Returns the shown labels, in the order given.
 */
export function layoutGuide<K extends string>(
  labels: readonly GuideLabel<K>[],
  box: GuideBox,
): GuidePlaced<K>[] {
  const n = labels.length
  // Each label's lanes, cheapest first: its own side's inner lane, its outer
  // lane, the other side's inner and outer, then hidden.
  const order = labels.map((it) => {
    const own = it.prefer === "top" ? [0, 1] : [2, 3]
    const other = it.prefer === "top" ? [2, 3] : [0, 1]
    return [...own, ...other, -1]
  })
  const baseCost = (lane: number, it: GuideLabel<K>) =>
    lane < 0 ? COST_HIDDEN : (LANES[lane][0] === it.prefer ? 0 : COST_OTHER_SIDE) + (LANES[lane][1] === 1 ? COST_OUTER : 0)
  let best: { cost: number; placed: (GuidePlaced<K> | null)[] } | null = null
  const lanes = new Array<number>(n).fill(-1)
  // Depth first, cheapest lane first, and a branch is dropped as soon as what
  // it has spent already matches the best whole layout found.
  const visit = (i: number, spent: number) => {
    if (best && spent >= best.cost) return
    if (i === n) {
      const got = layoutAs(labels, lanes, box)
      if (!got) return
      const cost = spent + got.extra
      if (!best || cost < best.cost) best = { cost, placed: got.placed }
      return
    }
    for (const lane of order[i]) {
      lanes[i] = lane
      visit(i + 1, spent + baseCost(lane, labels[i]))
    }
  }
  visit(0, 0)
  const found = best as { placed: (GuidePlaced<K> | null)[] } | null
  return (found?.placed ?? []).filter((p): p is GuidePlaced<K> => p != null)
}

/**
 * The rail's scroll while a tapped card grows open (build-brief-final §3.3;
 * cold review F7): held on the card every frame, its offset from the centre
 * eased from where it sat to nothing over the grow, on the grow's own curve
 * (cubic-bezier(.22,1,.36,1), the quintic ease-out). `centre` is the scroll
 * that centres the card NOW, as the widths change; `from` is how far off
 * centre it sat when tapped (0 for the centre card: it simply stays held).
 */
export function heldScroll(centre: number, from: number, elapsedMs: number, durationMs: number): number {
  const t = durationMs > 0 ? Math.min(1, Math.max(0, elapsedMs / durationMs)) : 1
  return centre + from * Math.pow(1 - t, 5)
}
