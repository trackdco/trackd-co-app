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
