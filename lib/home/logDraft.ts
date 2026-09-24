/**
 * Today's Log, Flow B: what an OPEN row holds while you edit it, and how that
 * becomes a logged dose (ui-context → "Today's Log, and logging a dose").
 *
 * Nothing here is saved until Track: the draft lives in the row, and Track
 * turns it into a `DoseLog` for the same commit path the Log sheet uses. The
 * rules for defaults are the sheet's, so a dose logged from the row and one
 * logged from the sheet are the same record.
 *
 * Pure: no React, no storage (code-standards.md).
 */
import type { DoseLog } from "@/lib/home/mockHomeData"
import { doseAmountsOf, doseTimesOf, hasTime, resolveScheduleOn, type StackCompound } from "@/lib/home/stack"

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
}

/** The planned amount and unit for one slot on one day. */
export function plannedFor(c: StackCompound, dateKey: string, slot: number): { amount: number; unit: string } {
  const on = resolveScheduleOn(c, dateKey)
  const amounts = doseAmountsOf(on.schedule, on.dose)
  return { amount: amounts[slot] ?? on.dose, unit: on.unit || c.unit }
}

/**
 * The draft a row opens with: the dose as logged when it is (edit mode), else
 * the plan for that slot. No site is pre-picked and the time follows the clock,
 * exactly as the Log sheet opens.
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
  if (draft.time24 && hasTime(draft.time24)) return draft.time24
  if (dateKey === todayKey) return clockHHMM(now)
  const planned = doseTimesOf(resolveScheduleOn(c, dateKey).schedule)[slot]
  return hasTime(planned) ? planned : ""
}

/** An amount as the stepper and the bar show it: no trailing zeros. */
export function formatStepAmount(n: number): string {
  return String(Number(n.toFixed(3)))
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
  }
}

/** Nice steps, smallest first. */
const STEPS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250]

/**
 * The stepper's step for a dose: about a quarter of it (0.5 for 2 mg), or a
 * twenty-fifth from 50 up (5 for 125 mg), rounded down to a nice number, so a
 * few taps reach any sensible change without a hundred taps for a big dose.
 */
export function stepFor(dose: number): number {
  if (!(dose > 0)) return 1
  const target = dose >= 50 ? dose / 25 : dose / 4
  let step = STEPS[0]
  for (const s of STEPS) if (s <= target + 1e-9) step = s
  return step
}

/** "Track 2 mg · Abdomen L", or "Save" in edit mode. */
export function trackLabel(draft: RowDraft, siteName: string | null, editing: boolean): string {
  if (editing) return "Save"
  const base = `Track ${formatStepAmount(draft.amount)} ${draft.unit}`
  return siteName ? `${base} · ${siteName}` : base
}
