/**
 * Today's Log, Flow B: what an OPEN row holds while you edit it, and how that
 * becomes a logged dose (ui-context → "Today's Log, and logging a dose").
 *
 * Nothing here is saved until Track: the draft lives in the row, and Track
 * turns it into a `DoseLog` for the one commit path (`commitDoseOn`). The old
 * Log sheet is retired: every place that logs a dose draws these rows.
 *
 * Pure: no React, no storage (code-standards.md).
 */
import { formatDose, formatDoseAmount } from "@/lib/format/dose"
import { dayLong } from "@/lib/format/date"
import type { DoseLog } from "@/lib/home/mockHomeData"
import {
  doseAmountsOf,
  doseTimesOf,
  formatTimeLabel,
  hasTime,
  resolveScheduleOn,
  type StackCompound,
} from "@/lib/home/stack"

/**
 * THE WORDS OF LOGGING A DOSE (consistency fix #0): one way to log, with the
 * same words wherever you start (Home's rows, Quick log, the Calendar's day).
 * The old Log sheet said "Don't count this one", "Update" and "Live now,
 * 09:41:07"; these are the ones that stayed.
 */
export const LOG_WORDS = {
  /** The Track bar's verb (sanctioned, ui-context → the Track bar). */
  track: "Track",
  /** The verb once the dose is already logged (edit mode). */
  save: "Save",
  /** A dose logged without touching stock. */
  dontCount: "Don’t count this dose",
  /** The opposite: it comes off the container in use. */
  countIt: "Count it",
  /** A logged dose's tick tapped again. */
  unticked: "Unticked",
} as const

/** "Today", else the day as the app writes it ("Tue 3 Sep"). */
export function logDayWord(dateKey: string, todayKey: string): string {
  return dateKey === todayKey ? "Today" : dayLong(dateKey)
}

/** The Time row: "Today · 9:41 AM" (never a 24-hour clock with seconds). */
export function logTimeLabel(dateKey: string, todayKey: string, time24: string): string {
  return `${logDayWord(dateKey, todayKey)} · ${formatTimeLabel(time24)}`
}

export interface RowDraft {
  /** The amount, in the unit it will be logged in. */
  amount: number
  unit: string
  /** A time the user set, "HH:MM", or null to take the clock at Track. */
  time24: string | null
  siteId: string | null
  note: string
  /**
   * The container it comes out of: an id, `null` for "Don't count this dose",
   * or `undefined` to leave it to the server's rule (the oldest open one).
   */
  inventoryItemId: string | null | undefined
  /**
   * A SKIPPED dose opened to edit its note or time stays skipped on Save
   * (cold review B4): without it the log went back with no status, which
   * means taken, so it came off stock and counted toward consistency.
   * Absent on everything else (absent is taken).
   */
  status?: "skipped"
}

/** The planned amount and unit for one slot on one day. */
export function plannedFor(c: StackCompound, dateKey: string, slot: number): { amount: number; unit: string } {
  const on = resolveScheduleOn(c, dateKey)
  const amounts = doseAmountsOf(on.schedule, on.dose)
  return { amount: amounts[slot] ?? on.dose, unit: on.unit || c.unit }
}

/**
 * The draft a row opens with: the dose as logged when it is (edit mode), else
 * the plan for that slot. No site is pre-picked and the time follows the clock.
 */
export function initialDraft(
  c: StackCompound,
  dateKey: string,
  slot: number,
  existing: DoseLog | null,
): RowDraft {
  const plan = plannedFor(c, dateKey, slot)
  const logged = existing ? Number.parseFloat(existing.amount) : NaN
  return {
    amount: Number.isFinite(logged) && logged > 0 ? logged : plan.amount,
    unit: existing?.unit ?? plan.unit,
    time24: existing && hasTime(existing.time24) ? existing.time24 : null,
    siteId: existing?.siteId ?? null,
    note: existing?.note ?? "",
    inventoryItemId: existing ? existing.inventoryItemId : undefined,
    ...(existing?.status === "skipped" ? { status: "skipped" as const } : {}),
  }
}

/** Local "HH:MM". */
export function clockHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/**
 * The time a Track writes: the one set, else the clock on the day being shown
 * if it is today, else the slot's scheduled time (a back-dated day has no
 * "now"), else nothing.
 */
export function draftTime(
  c: StackCompound,
  draft: RowDraft,
  dateKey: string,
  todayKey: string,
  slot: number,
  now: Date,
): string {
  return shownTime(c, draft, dateKey, todayKey, slot, clockHHMM(now))
}

/**
 * The Time row: exactly what Track will write, with today's clock as the
 * panel last read it ("HH:MM"). On a back-dated day that is THIS slot's
 * scheduled time (cold review B19: the evening dose showed the morning's
 * 8:00 AM while Track wrote 20:00).
 */
export function shownTime(
  c: StackCompound,
  draft: RowDraft,
  dateKey: string,
  todayKey: string,
  slot: number,
  clock: string,
): string {
  if (draft.time24 && hasTime(draft.time24)) return draft.time24
  if (dateKey === todayKey) return clock
  const planned = doseTimesOf(resolveScheduleOn(c, dateKey).schedule)[slot]
  return hasTime(planned) ? planned : ""
}

/** An amount as the stepper and the bar show it: no trailing zeros. The one
 *  dose format (lib/format/dose), without the unit. */
export function formatStepAmount(n: number): string {
  return formatDoseAmount(n)
}

/**
 * The dose as a `DoseLog`, for the shared commit path. A site only on an
 * injection; a note only when there is one; the container decision always,
 * because its three states mean different things (see `DoseLog`).
 */
export function draftToLog(
  c: StackCompound,
  draft: RowDraft,
  dateKey: string,
  todayKey: string,
  slot: number,
  now: Date,
): DoseLog {
  const injectable = c.method === "im" || c.method === "subq"
  const note = draft.note.trim()
  return {
    amount: formatStepAmount(draft.amount),
    unit: draft.unit,
    siteId: injectable ? draft.siteId : null,
    ...(note ? { note } : {}),
    time24: draftTime(c, draft, dateKey, todayKey, slot, now),
    ...(draft.inventoryItemId !== undefined ? { inventoryItemId: draft.inventoryItemId } : {}),
    // A skipped dose saved from its open row is still skipped (B4).
    ...(draft.status === "skipped" ? { status: "skipped" as const } : {}),
  }
}

/**
 * THE DAY A TRACK WRITES TO (cold review B23). The host re-reads "today" once a
 * minute, so for up to a minute after local midnight its rows still say Today
 * for the day that just ended. A fresh dose tracked on the clock then belongs
 * to the NEW day: writing it to the old one at 00:00 put it a day early (and
 * started a spare with yesterday's date).
 *
 * Only a fresh dose on the clock moves. An edit keeps its own day, and a time
 * set by hand on "Today" means that day, as the row said.
 */
export function trackDay(
  rowDay: string,
  hostToday: string,
  realToday: string,
  draft: RowDraft,
  editing: boolean,
): { day: string; todayKey: string } {
  const stale = rowDay === hostToday && realToday > hostToday
  if (!stale || editing || (draft.time24 && hasTime(draft.time24))) return { day: rowDay, todayKey: hostToday }
  return { day: realToday, todayKey: realToday }
}

/** Nice steps, smallest first. */
const STEPS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250]

/** Units counted in whole things: a stepper never offers 1.05 tablets. */
const COUNT_UNITS = new Set(["tab", "capsule", "drop"])

/** A dose counted in whole things (tablets, capsules, drops): the stepper and
 *  the pad move it in whole steps (build-brief-final §3.2). */
export function isCountedUnit(unit: string | null | undefined): boolean {
  return Boolean(unit && COUNT_UNITS.has(unit))
}

/**
 * The stepper's next amount. A counted dose steps by one and lands on WHOLE
 * numbers (Adrian, 26 Sep); the pad still types any amount, a half tablet
 * included. A plan of half a tablet steps 0.5 → 1 → 2
 * and back 1 → 0, never 0.5 → 1.5. Anything else moves by `step`, to three
 * places. Never below zero (zero empties the dose and the Track bar drops).
 */
export function stepAmount(amount: number, dir: 1 | -1, unit: string, step: number): number {
  const from = Number.isFinite(amount) ? amount : 0
  if (isCountedUnit(unit)) {
    const next = dir > 0 ? Math.floor(from + 1e-9) + 1 : Math.ceil(from - 1e-9) - 1
    return Math.max(0, next)
  }
  return Math.max(0, Number((from + dir * step).toFixed(3)))
}

/**
 * The stepper's step for a dose: about a quarter of it (0.5 for 2 mg), or a
 * twenty-fifth from 50 up (5 for 125 mg), rounded down to a nice number, so a
 * few taps reach any sensible change without a hundred taps for a big dose.
 * Whole steps for tablets, capsules and drops (build-brief-final §3.2: it went
 * "1 → 1.05 pills").
 */
export function stepFor(dose: number, unit?: string): number {
  if (isCountedUnit(unit)) return 1
  if (!(dose > 0)) return 1
  const target = dose >= 50 ? dose / 25 : dose / 4
  let step = STEPS[0]
  for (const s of STEPS) if (s <= target + 1e-9) step = s
  return step
}

/** "Track 2 mg · Abdomen L", or "Save" in edit mode. */
export function trackLabel(draft: RowDraft, siteName: string | null, editing: boolean): string {
  if (editing) return LOG_WORDS.save
  const base = `${LOG_WORDS.track} ${formatDose(draft.amount, draft.unit)}`
  return siteName ? `${base} · ${siteName}` : base
}
