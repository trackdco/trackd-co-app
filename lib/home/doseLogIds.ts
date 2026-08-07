/**
 * Deterministic `dose_logs` ids, and reading a dose's day back out of one.
 *
 * SERVER-ONLY (node:crypto). Extracted from `protocolSync.ts` so the id scheme
 * has one definition and can be tested directly: `protocolSync` is a
 * `"use server"` module, every export of which must be an async action, so a
 * pure helper cannot live there and be reachable from a test.
 */
import { createHash } from "node:crypto"

/** A stable v4-shaped uuid for a seed string. */
export function deterministicUuid(seed: string): string {
  const b = createHash("sha256").update(seed).digest().subarray(0, 16)
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant 10
  const hex = b.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * The `dose_logs.id` a (user, local day, compound, slot) tuple produces.
 *
 * The day is part of the identity, which is what makes a dose idempotent to
 * re-push — and also what makes a re-derived day mint a SECOND row rather than
 * update the first. {@link recoverLoggedDay} is the other half of that bargain.
 *
 * **Slot 0 seeds EXACTLY as it did before the argument existed**, and that is
 * load-bearing rather than tidy: every row ever written is slot 0, and a changed
 * seed would give all of them new ids, so the next push would insert duplicates
 * beside the originals instead of updating them. No backfill is needed precisely
 * because the default reproduces the old string byte for byte.
 */
export function doseLogRowId(
  userId: string,
  dateKey: string,
  pcId: string,
  slot = 0,
): string {
  const seed =
    slot === 0
      ? `dl:${userId}:${dateKey}:${pcId}`
      : `dl:${userId}:${dateKey}:${pcId}:${slot}`
  return deterministicUuid(seed)
}

/** `YYYY-MM-DD` `n` days from `key`, counted in UTC so no local offset applies. */
export function shiftDayKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/**
 * Read a dose's original local day back out of its own row id.
 *
 * The id is a hash of the day the row was first written under, so a candidate
 * day either reproduces it exactly or it does not. This RECOVERS a fact rather
 * than inferring one, which is the distinction `supabase/protocol/012` draws
 * when it forbids backfilling `logged_for`: a guess must never be stored,
 * because storing it makes it permanent.
 *
 * No timezone moves a calendar day by more than one (the range is UTC-12 to
 * UTC+14), so the instant's UTC day and its two neighbours are the whole search
 * space. Returns null for a row whose id was not built this way, and the caller
 * then falls back to deriving a day from `taken_at` exactly as before.
 */
export function recoverLoggedDay(
  userId: string,
  rowId: string,
  pcId: string,
  takenAt: string
): string | null {
  const utcDay = takenAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(utcDay)) return null
  for (const offset of [0, -1, 1]) {
    const candidate = shiftDayKey(utcDay, offset)
    if (doseLogRowId(userId, candidate, pcId) === rowId) return candidate
  }
  return null
}
